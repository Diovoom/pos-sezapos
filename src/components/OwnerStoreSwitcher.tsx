import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const sb = supabase as any;

export function OwnerStoreSwitcher() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const activeStoreId = me?.store?.id as string | undefined;

  const stores = useQuery({
    queryKey: ["owner-store-locations", me?.user?.id],
    enabled: Boolean(me?.user?.id),
    queryFn: async () => {
      const { data: roleRows, error: roleError } = await sb
        .from("user_roles")
        .select("store_id")
        .eq("user_id", me!.user.id)
        .eq("role", "owner");
      if (roleError) throw roleError;
      const ids = [...new Set((roleRows ?? []).map((row: any) => row.store_id).filter(Boolean))];
      if (!ids.length && activeStoreId) ids.push(activeStoreId);
      if (!ids.length) return [];
      const { data, error } = await sb
        .from("stores")
        .select("id,name,address")
        .in("id", ids)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function selectStore(storeId: string) {
    if (!me?.user?.id || storeId === activeStoreId) return;
    const { error } = await sb.from("profiles").update({ store_id: storeId }).eq("id", me.user.id);
    if (error) {
      toast.error("That location could not be opened. Please try again.");
      return;
    }
    await queryClient.invalidateQueries();
    toast.success("Location changed");
    window.location.reload();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="min-w-0 max-w-[58vw] gap-2 rounded-full px-3 text-sm font-semibold md:max-w-md md:text-base"
          aria-label="Switch store location"
        >
          <MapPin className="size-4 shrink-0 text-primary" />
          <span className="truncate">{me?.store?.name ?? "Store"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-72">
        <DropdownMenuLabel>Your locations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {stores.isLoading ? (
          <DropdownMenuItem disabled>Loading locations…</DropdownMenuItem>
        ) : stores.isError ? (
          <DropdownMenuItem disabled>Locations are temporarily unavailable.</DropdownMenuItem>
        ) : stores.data?.length ? (
          stores.data.map((store: any) => (
            <DropdownMenuItem key={store.id} onClick={() => selectStore(store.id)} className="gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{store.name}</div>
                {store.address ? <div className="truncate text-xs text-muted-foreground">{store.address}</div> : null}
              </div>
              {store.id === activeStoreId ? <Check className="size-4 text-primary" /> : null}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No additional locations found.</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
