import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useMe } from "@/hooks/useMe";
import { merchantRespondSupportSession, merchantEndSupportSession } from "@/lib/admin/admin.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Eye } from "lucide-react";
import { toast } from "sonner";

type SupportRequest = {
  id: string;
  store_id: string;
  admin_email: string | null;
  reason: string;
  status: string;
  requested_at: string;
  expires_at: string;
};

/**
 * Listens for pending SEZA support view requests targeted at the current merchant's store,
 * and shows an Accept / Decline dialog. Also shows a persistent banner while a support session
 * is active on this store. Accept / decline / end are audited server-side.
 */
export function SupportRequestListener() {
  const me = useMe();
  const storeId = me.data?.store?.id as string | undefined;

  const respond = useServerFn(merchantRespondSupportSession);
  const endFn = useServerFn(merchantEndSupportSession);

  const [pending, setPending] = useState<SupportRequest | null>(null);
  const [active, setActive] = useState<SupportRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!storeId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("admin_support_sessions")
      .select("id, store_id, admin_email, reason, status, requested_at, expires_at")
      .eq("store_id", storeId)
      .in("status", ["pending", "active"])
      .gt("expires_at", new Date().toISOString())
      .order("requested_at", { ascending: false });
    const rows = (data ?? []) as SupportRequest[];
    setPending(rows.find((r) => r.status === "pending") ?? null);
    setActive(rows.find((r) => r.status === "active") ?? null);
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    refresh();
    const channel = supabase
      .channel(`support-req-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_support_sessions", filter: `store_id=eq.${storeId}` },
        () => refresh(),
      )
      .subscribe();
    const iv = setInterval(refresh, 15_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(iv);
    };
  }, [storeId, refresh]);

  async function decide(decision: "accept" | "decline") {
    if (!pending) return;
    setBusy(true);
    try {
      await respond({ data: { sessionId: pending.id, decision } });
      toast[decision === "accept" ? "success" : "message"](
        decision === "accept"
          ? "SEZA Support can now view your screen"
          : "Support request declined",
      );
      setPending(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to respond");
    } finally {
      setBusy(false);
    }
  }

  async function endActive() {
    if (!active) return;
    try {
      await endFn({ data: { sessionId: active.id } });
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to end session");
    }
  }

  if (!storeId) return null;

  return (
    <>
      {active && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          <span className="font-medium">SEZA Support is viewing your screen</span>
          <span className="text-muted-foreground">
            — expires {new Date(active.expires_at).toLocaleTimeString()}
          </span>
          <button
            className="ml-auto text-xs underline underline-offset-2 hover:text-foreground"
            onClick={endActive}
          >
            End session
          </button>
        </div>
      )}

      <AlertDialog open={!!pending}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              SEZA Support is requesting to view your screen
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A SEZA Support agent{pending?.admin_email ? ` (${pending.admin_email})` : ""} is asking for
                  permission to view your store data for the next 30 minutes.
                </p>
                {pending?.reason && (
                  <div className="rounded-md border bg-muted/40 p-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Reason</div>
                    <div>{pending.reason}</div>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="outline">Read-only</Badge>
                  <Badge variant="outline">You can end it anytime</Badge>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={() => decide("decline")}>
              Decline
            </AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => decide("accept")}>
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
