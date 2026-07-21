import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import logoAsset from "@/assets/seza-logo.png.asset.json";
import { resolveLogoUrl } from "@/components/brand/Logo";

const SEZA_LOGO = () => resolveLogoUrl(logoAsset.url);

export type StoreBranding = {
  storeId: string | null;
  name: string | null;
  displayText: string;
  logoUrl: string;
  receiptLogoUrl: string;
  hasCustomLogo: boolean;
};

function makeDisplayText(value: string | null | undefined, storeName: string | null | undefined) {
  const raw = (value || storeName || "S").trim();
  const initials = raw.includes(" ")
    ? raw.split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]).join("")
    : raw.slice(0, 4);
  return (initials || "S").toUpperCase();
}

export function useStoreBranding() {
  const qc = useQueryClient();
  const me = useMe();
  const storeId = (me.data?.profile?.store_id ?? me.data?.store?.id) as string | undefined;

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`store-branding:${storeId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stores", filter: `id=eq.${storeId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["store-branding", storeId] });
          void qc.invalidateQueries({ queryKey: ["store"] });
          void qc.invalidateQueries({ queryKey: ["me"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, storeId]);

  return useQuery<StoreBranding>({
    queryKey: ["store-branding", storeId],
    enabled: !!storeId,
    staleTime: 0,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)("stores")
        .select("id, name, logo_url, receipt_logo_url, pos_display_name")
        .eq("id", storeId)
        .maybeSingle();
      if (error) throw error;
      const custom = !!(data?.logo_url && data.logo_url.trim());
      const logo = custom ? data!.logo_url! : SEZA_LOGO();
      const receipt =
        (data?.receipt_logo_url && data.receipt_logo_url.trim()) ||
        (data?.logo_url && data.logo_url.trim()) ||
        SEZA_LOGO();
      return {
        storeId: data?.id ?? storeId ?? null,
        name: data?.name ?? null,
        displayText: makeDisplayText((data as { pos_display_name?: string | null } | null)?.pos_display_name, data?.name),
        logoUrl: logo,
        receiptLogoUrl: receipt,
        hasCustomLogo: custom,
      };
    },
  });
}
