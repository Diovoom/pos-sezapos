import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LogIn, LogOut, Coffee, PlayCircle, Loader2 } from "lucide-react";
import { format, formatDistanceStrict } from "date-fns";
import { useState } from "react";
import { CloseShiftDialog } from "@/components/pos/CloseShiftDialog";
import { hasUnsyncedOfflineSales } from "@/lib/offline/db";
import { logAudit } from "@/lib/audit-log";

// Native APK shell detection — Clock Out on the APK routes through the
// existing Shift Review flow when a register shift is open, and enforces
// the offline-sale / payment-busy guardrails. Web POS behavior is unchanged.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isNativeShell = typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();

export const Route = createFileRoute("/_pos/timeclock")({
  head: () => ({ meta: [{ title: "Time Clock — SEZA POS" }, { name: "description", content: "Clock in, take breaks, and clock out for the current shift." }] }),
  component: TimeclockPage,
});

type TimeEntry = {
  id: string;
  user_id: string;
  store_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_start: string | null;
  break_minutes: number;
  notes: string | null;
  late?: boolean;
  late_minutes?: number;
};

export function TimeclockPage() {
  const qc = useQueryClient();
  const me = useMe();
  const canManage = me.data?.roles.some((r) => r === "owner" || r === "manager");
  const storeId = me.data?.profile?.store_id ?? null;
  const userId = me.data?.user?.id ?? null;

  // Resolve THIS employee's own open register shift. Scoping by store alone
  // could close a coworker's shift on a shared device — always narrow by
  // `opened_by = auth.uid()`. If more than one open shift matches (a stuck
  // record from a prior crash), refuse to auto-close and surface a clear
  // ambiguity error with a correlation ID; only a manager should intervene
  // via the existing management workflow.
  const openShiftQ = useQuery({
    enabled: !!storeId && !!userId,
    queryKey: ["timeclock", "open-shift", storeId, userId],
    staleTime: 15_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("register_sessions")
        .select("id, store_id, opened_by, opened_at, opening_cash, status, terminal_id")
        .eq("store_id", storeId)
        .eq("opened_by", userId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string; store_id: string; opened_by: string; opened_at: string;
        opening_cash: number; status: string; terminal_id: string | null;
      }>;
      return { rows };
    },
  });
  const openShift = openShiftQ.data?.rows?.[0] ?? null;
  const shiftAmbiguous = (openShiftQ.data?.rows?.length ?? 0) > 1;

  const [shiftReviewOpen, setShiftReviewOpen] = useState(false);

  const { data: open } = useQuery<TimeEntry | null>({
    queryKey: ["myOpenEntry", me.data?.user.id],
    enabled: !!me.data?.user.id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("time_entries")
        .select("*")
        .eq("user_id", me.data!.user.id)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as TimeEntry | null) ?? null;
    },
  });

  const { data: history = [] } = useQuery<TimeEntry[]>({
    queryKey: ["myTimeHistory", me.data?.user.id],
    enabled: !!me.data?.user.id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("time_entries")
        .select("*")
        .eq("user_id", me.data!.user.id)
        .order("clock_in", { ascending: false })
        .limit(20);
      return (data as TimeEntry[]) ?? [];
    },
  });

  const { data: whosIn = [] } = useQuery({
    enabled: !!canManage,
    queryKey: ["whosIn"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("time_entries")
        .select("id, user_id, clock_in, break_start")
        .is("clock_out", null);
      const rows = (data as { id: string; user_id: string; clock_in: string; break_start: string | null }[]) ?? [];
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name, employee_id, email")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id as string, p]));
      return rows.map((r) => ({ ...r, profile: map.get(r.user_id) }));
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["myOpenEntry"] });
    qc.invalidateQueries({ queryKey: ["myTimeHistory"] });
    qc.invalidateQueries({ queryKey: ["whosIn"] });
  };

  const clockIn = useMutation({
    mutationFn: async () => {
      if (!me.data?.user.id) throw new Error("Not signed in");
      if (me.data?.profile?.status === "disabled") throw new Error("Account is disabled");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("time_entries").insert({
        user_id: me.data.user.id,
        store_id: me.data.profile?.store_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Clocked in"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (!open) throw new Error("Not clocked in");
      // If a break was still open, close it now.
      let extraBreak = 0;
      if (open.break_start) {
        extraBreak = Math.max(0, Math.round((Date.now() - new Date(open.break_start).getTime()) / 60000));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("time_entries")
        .update({
          clock_out: new Date().toISOString(),
          break_start: null,
          break_minutes: (open.break_minutes ?? 0) + extraBreak,
        })
        .eq("id", open.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Clocked out"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const startBreak = useMutation({
    mutationFn: async () => {
      if (!open) throw new Error("Not clocked in");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("time_entries")
        .update({ break_start: new Date().toISOString() })
        .eq("id", open.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Break started"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const endBreak = useMutation({
    mutationFn: async () => {
      if (!open || !open.break_start) throw new Error("Not on break");
      const mins = Math.max(0, Math.round((Date.now() - new Date(open.break_start).getTime()) / 60000));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("time_entries")
        .update({ break_start: null, break_minutes: (open.break_minutes ?? 0) + mins })
        .eq("id", open.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Break ended"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const anyBusy = clockIn.isPending || clockOut.isPending || startBreak.isPending || endBreak.isPending;

  const totals = computeTotals(history);

  // Native APK Clock Out decision flow. Web POS keeps the direct
  // clockOut.mutate() call so nothing changes on the desktop dashboard.
  const handleClockOut = async () => {
    if (!open) return;
    if (isNativeShell) {
      // Ambiguous open shifts: refuse to auto-close either one.
      if (shiftAmbiguous) {
        const correlationId = (crypto as { randomUUID?: () => string }).randomUUID?.()
          ?? `cc-${Date.now().toString(36)}`;
        void logAudit({
          action: "system.error",
          entity: "register_session",
          details: {
            stage: "clock_out_ambiguous_open_shifts",
            correlation_id: correlationId,
            count: openShiftQ.data?.rows?.length ?? 0,
            channel: "native_shell",
          },
        });
        toast.error(
          `Multiple open shifts detected. A manager must resolve this from the dashboard. Ref: ${correlationId}`,
        );
        return;
      }

      try {
        const { getNativeActivityFlags } = await import("@/lib/native-activity");
        const flags = getNativeActivityFlags();
        if (flags.paymentBusy) {
          // Covers active payment, refund, void, and any unknown/unresolved
          // tender — the register broadcasts paymentBusy for all of them
          // via useNativeActivitySignal. Recovery lives in the POS itself.
          toast.error("A transaction is in progress. Complete or cancel it in the register before clocking out.");
          return;
        }
        if (flags.hasCart) {
          // Never silently discard a cart. Send the user back to the
          // register — they can complete the sale or use the register's
          // existing (permission-gated) cancel flow, which already routes
          // through ManagerOverrideDialog for cashiers.
          toast.error("You have an active cart. Complete or cancel the sale in the register before clocking out.");
          return;
        }
      } catch { /* module unavailable — proceed */ }

      // If a register shift is open under THIS cashier, force Shift Review
      // first. CloseShiftDialog re-checks pending offline sales and manager
      // approval; the clock-out mutation is chained into beforeSignOut.
      if (openShift?.id) {
        try {
          if (await hasUnsyncedOfflineSales(openShift.id)) {
            toast.error("Pending offline sales must sync before closing this shift.");
            return;
          }
        } catch { /* IndexedDB missing — CloseShiftDialog will re-check. */ }
        void logAudit({
          action: "clock_out",
          entity: "time_entry",
          entity_id: open.id,
          details: {
            channel: "native_shell",
            stage: "shift_review_opened",
            shift_id: openShift.id,
            opened_by: openShift.opened_by,
            terminal_id: openShift.terminal_id,
          },
        });
        setShiftReviewOpen(true);
        return;
      }
    }
    clockOut.mutate();
  };

  return (
    <>
      <PageHeader title="Time Clock" subtitle="Clock in, take breaks, clock out." />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Your status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              {!open && <Badge variant="secondary">Clocked out</Badge>}
              {open && !open.break_start && <Badge className="bg-success text-success-foreground">On the clock</Badge>}
              {open?.break_start && <Badge variant="outline" className="border-warning text-warning">On break</Badge>}
              {open && (
                <span className="text-sm text-muted-foreground">
                  Since {format(new Date(open.clock_in), "p")} · {formatDistanceStrict(new Date(open.clock_in), new Date())}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => clockIn.mutate()} disabled={!!open || anyBusy}>
                <LogIn className="size-4 mr-2" /> Clock in
              </Button>
              <Button size="lg" variant="outline" onClick={() => void handleClockOut()} disabled={!open || anyBusy}>
                <LogOut className="size-4 mr-2" /> Clock out
              </Button>
              <Button size="lg" variant="outline" onClick={() => startBreak.mutate()} disabled={!open || !!open.break_start || anyBusy}>
                <Coffee className="size-4 mr-2" /> Start break
              </Button>
              <Button size="lg" variant="outline" onClick={() => endBreak.mutate()} disabled={!open?.break_start || anyBusy}>
                <PlayCircle className="size-4 mr-2" /> End break
              </Button>
              {anyBusy && <Loader2 className="size-5 animate-spin text-muted-foreground self-center" />}
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-3 gap-3">
          <Metric label="Today" value={`${totals.today.toFixed(2)} h`} />
          <Metric label="This week" value={`${totals.week.toFixed(2)} h`} />
          <Metric label="This month" value={`${totals.month.toFixed(2)} h`} />
        </div>

        {canManage && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Who's on the clock</CardTitle>
              <CardDescription>Live view for managers and owners.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {whosIn.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No one is currently clocked in.</div>
              ) : (
                whosIn.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b last:border-b-0">
                    <div>
                      <div className="font-semibold text-sm">
                        {r.profile?.full_name || `${r.profile?.first_name ?? ""} ${r.profile?.last_name ?? ""}`.trim() || r.profile?.email}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">ID {r.profile?.employee_id}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div>{r.break_start ? <Badge variant="outline">On break</Badge> : <Badge>Active</Badge>}</div>
                      <div className="text-muted-foreground mt-1">In at {format(new Date(r.clock_in), "p")}</div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recent entries</CardTitle></CardHeader>
          <CardContent className="p-0">
            {history.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No time entries yet.</div>}
            {history.map((e) => {
              const inD = new Date(e.clock_in);
              const outD = e.clock_out ? new Date(e.clock_out) : null;
              const mins = outD ? Math.max(0, Math.round((outD.getTime() - inD.getTime()) / 60000) - (e.break_minutes ?? 0)) : null;
              return (
                <div key={e.id} className="flex items-center justify-between px-4 py-2 border-b last:border-b-0 text-xs">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {format(inD, "EEE, MMM d")}
                      {e.late && (
                        <Badge variant="outline" className="border-warning text-warning">
                          Late {e.late_minutes ?? 0}m
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground">{format(inD, "p")} – {outD ? format(outD, "p") : "…"}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono">{mins != null ? `${(mins / 60).toFixed(2)} h` : "—"}</div>
                    {(e.break_minutes ?? 0) > 0 && <div className="text-muted-foreground">Break {e.break_minutes}m</div>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/*
        Native-shell Shift Review — reuses the production CloseShiftDialog.
        Clock-out runs inside `beforeSignOut`: shift closes first, then time
        entry closes with the authenticated session, then the dialog signs
        the cashier out and we route back to the PIN screen. If the register
        shift closes but clock-out fails, we surface a retry toast and leave
        the closed shift alone (do NOT reopen).
      */}
      {openShift && me.data?.user?.id && (
        <CloseShiftDialog
          open={shiftReviewOpen}
          onOpenChange={(v) => setShiftReviewOpen(v)}
          session={{
            id: openShift.id,
            store_id: openShift.store_id,
            opened_by: openShift.opened_by,
            opened_at: openShift.opened_at,
            opening_cash: Number(openShift.opening_cash ?? 0),
          }}
          store={me.data?.store ?? null}
          cashierUserId={me.data.user.id}
          beforeSignOut={async () => {
            try {
              await clockOut.mutateAsync();
              void logAudit({
                action: "clock_out",
                entity: "time_entry",
                entity_id: open?.id,
                details: { channel: "native_shell", stage: "clock_out_completed", shift_id: openShift.id },
              });
            } catch (e) {
              void logAudit({
                action: "system.error",
                entity: "time_entry",
                entity_id: open?.id,
                details: {
                  stage: "clock_out_failed_after_close",
                  shift_id: openShift.id,
                  channel: "native_shell",
                  message: e instanceof Error ? e.message : String(e),
                },
              });
              toast.error(
                "Your register shift is closed, but employee clock-out could not be completed. Try again from Time Clock.",
              );
              throw e;
            }
          }}
          onClosed={() => {
            setShiftReviewOpen(false);
            qc.invalidateQueries({ queryKey: ["timeclock", "open-shift"] });
            invalidate();
          }}
        />
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-mono font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function computeTotals(entries: TimeEntry[]) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = now.getDay(); // 0..6, treat Sunday as start
  const startOfWeek = startOfDay - day * 86400000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const sum = (fromMs: number) =>
    entries.reduce((acc, e) => {
      const inMs = new Date(e.clock_in).getTime();
      const outMs = e.clock_out ? new Date(e.clock_out).getTime() : Date.now();
      if (outMs < fromMs) return acc;
      const startMs = Math.max(inMs, fromMs);
      const mins = Math.max(0, Math.round((outMs - startMs) / 60000) - (e.break_minutes ?? 0));
      return acc + mins / 60;
    }, 0);

  return { today: sum(startOfDay), week: sum(startOfWeek), month: sum(startOfMonth) };
}
