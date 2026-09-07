import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LogIn, LogOut, Coffee, PlayCircle, Loader2 } from "lucide-react";
import { format, formatDistanceStrict } from "date-fns";
import { useState } from "react";
import { CloseShiftDialog } from "@/components/pos/CloseShiftDialog";
import { cacheMeta, readMeta, saveOfflineAction, deleteMeta } from "@/lib/offline/db";
import { isOnlineNow } from "@/lib/offline/useOnline";
import type { EmployeeTimeClockAction } from "@/lib/employees.functions";
import { logAudit } from "@/lib/audit-log";
import { userFacingError } from "@/lib/user-error";
import { testDrawer } from "@/lib/hardware/native-receipt";

// Native APK shell detection  -  Clock Out on the APK routes through the
// existing Shift Review flow when a register shift is open, and enforces
// the offline-sale / payment-busy guardrails. Web POS behavior is unchanged.

const isNativeShell =
  typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();

export const Route = createFileRoute("/_pos/timeclock")({
  head: () => ({
    meta: [
      { title: "Time Clock  -  SEZA POS" },
      {
        name: "description",
        content: "Clock in, take breaks, and clock out for the current shift.",
      },
    ],
  }),
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
  const navigate = useNavigate();
  const me = useMe();
  const canManage = me.data?.roles.some((r) => r === "owner" || r === "manager");
  const storeId = me.data?.profile?.store_id ?? me.data?.store?.id ?? null;
  const userId = me.data?.user?.id ?? null;

  // Resolve THIS employee's own open register shift. Scoping by store alone
  // could close a coworker's shift on a shared device  -  always narrow by
  // `opened_by = auth.uid()`. If more than one open shift matches (a stuck
  // record from a prior crash), refuse to auto-close and surface a clear
  // ambiguity error with a correlation ID; only a manager should intervene
  // via the existing management workflow.
  const openShiftQ = useQuery({
    enabled: !!storeId && !!userId,
    queryKey: ["timeclock", "open-shift", storeId, userId],
    staleTime: 15_000,
    queryFn: async () => {
      type OpenShift = {
        id: string;
        store_id: string;
        opened_by: string;
        opened_at: string;
        opening_cash: number;
        status: string;
        terminal_id: string | null;
      };
      if (!isOnlineNow()) {
        const cached = await readMeta<OpenShift | null>(`open_register_session:${userId}`);
        return {
          rows: cached && cached.opened_by === userId && cached.status === "open" ? [cached] : [],
        };
      }

      const { data, error } = await (supabase as any)
        .from("register_sessions")
        .select("id, store_id, opened_by, opened_at, opening_cash, status, terminal_id")
        .eq("store_id", storeId)
        .eq("opened_by", userId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(5);
      if (error) {
        const cached = await readMeta<OpenShift | null>(`open_register_session:${userId}`);
        return {
          rows: cached && cached.opened_by === userId && cached.status === "open" ? [cached] : [],
        };
      }
      const rows = (data ?? []) as OpenShift[];
      if (rows[0]) {
        await cacheMeta(`open_register_session:${userId}`, rows[0]).catch(() => {});
        return { rows };
      }

      // Opening the local register and syncing it are intentionally separate.
      // Until the queued register_open reaches Supabase, keep the employee's
      // local session visible instead of flashing "no open shift".
      const cached = await readMeta<OpenShift | null>(`open_register_session:${userId}`);
      return {
        rows: cached && cached.opened_by === userId && cached.status === "open" ? [cached] : [],
      };
    },
  });
  const openShift = openShiftQ.data?.rows?.[0] ?? null;
  const shiftAmbiguous = (openShiftQ.data?.rows?.length ?? 0) > 1;

  const [shiftReviewOpen, setShiftReviewOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState(() => {
    const saved = Number(localStorage.getItem("pos.register.lastOpeningCash") ?? "100");
    return Number.isFinite(saved) && saved >= 0 ? saved.toFixed(2) : "100.00";
  });

  const returnToPin = async () => {
    if (userId) {
      await Promise.all([
        deleteMeta(`timeclock_open:${userId}`).catch(() => {}),
        deleteMeta(`open_register_session:${userId}`).catch(() => {}),
      ]);
    }
    await Promise.all([
      deleteMeta("authenticated_me_current_user").catch(() => {}),
      deleteMeta("authenticated_me").catch(() => {}),
      deleteMeta("profile").catch(() => {}),
      deleteMeta("timeclock_open").catch(() => {}),
      deleteMeta("open_register_session").catch(() => {}),
    ]);
    try {
      localStorage.setItem("seza.forcePinLogin", "1");
    } catch {
      // localStorage may be unavailable; auth cleanup must still continue.
    }
    qc.clear();
    await supabase.auth.signOut({ scope: "local" } as any).catch(() => supabase.auth.signOut());
    navigate({ to: "/auth", search: { mode: "pin" } as any, replace: true });
  };

  const { data: open } = useQuery<TimeEntry | null>({
    queryKey: ["myOpenEntry", me.data?.user.id],
    enabled: !!me.data?.user.id,
    queryFn: async () => {
      const cacheKey = `timeclock_open:${me.data!.user.id}`;
      const cached = await readMeta<TimeEntry | null>(cacheKey).catch(() => undefined);

      // Keep a newly-created local clock-in visible until background sync has
      // converted it to the server row. This is what makes the button refresh
      // instantly even on slow Ethernet/Wi-Fi.
      if (cached?.id && String(cached.id).startsWith("local-time-")) return cached;
      if (!isOnlineNow()) return cached ?? null;

      const { data, error } = await (supabase as any)
        .from("time_entries")
        .select("*")
        .eq("user_id", me.data!.user.id)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        if (cached !== undefined) return cached ?? null;
        throw error;
      }
      await cacheMeta(cacheKey, data ?? null);
      return (data as TimeEntry | null) ?? null;
    },
  });

  const { data: history = [] } = useQuery<TimeEntry[]>({
    queryKey: ["myTimeHistory", me.data?.user.id],
    enabled: !!me.data?.user.id,
    queryFn: async () => {
      if (!isOnlineNow()) return (await readMeta<TimeEntry[]>(`timeclock_history:${me.data!.user.id}`)) ?? [];

      const { data, error } = await (supabase as any)
        .from("time_entries")
        .select("*")
        .eq("user_id", me.data!.user.id)
        .order("clock_in", { ascending: false })
        .limit(20);
      if (error) return (await readMeta<TimeEntry[]>(`timeclock_history:${me.data!.user.id}`)) ?? [];
      const rows = (data as TimeEntry[]) ?? [];
      await cacheMeta(`timeclock_history:${me.data!.user.id}`, rows);
      return rows;
    },
  });

  const { data: whosIn = [] } = useQuery({
    enabled: !!canManage,
    queryKey: ["whosIn", storeId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("time_entries")
        .select("id, user_id, clock_in, break_start")
        .eq("store_id", storeId)
        .is("clock_out", null);
      const rows =
        (data as { id: string; user_id: string; clock_in: string; break_start: string | null }[]) ??
        [];
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

  const invalidate = (next?: TimeEntry | null) => {
    if (next !== undefined) {
      qc.setQueryData(["myOpenEntry", userId], next);
      qc.setQueryData(["pos-clock-status", userId], next ? { id: next.id } : null);
    }
    qc.invalidateQueries({ queryKey: ["myOpenEntry", userId] });
    qc.invalidateQueries({ queryKey: ["pos-clock-status", userId] });
    qc.invalidateQueries({ queryKey: ["myTimeHistory", userId] });
    qc.invalidateQueries({ queryKey: ["whosIn", storeId] });
    qc.invalidateQueries({ queryKey: ["pos-shell", "open-shift", storeId] });
  };

  const applyClockAction = async (action: EmployeeTimeClockAction) => {
    if (!userId) throw new Error("Not signed in");
    if (me.data?.profile?.status === "disabled") throw new Error("Account is disabled");

    const occurredAt = new Date().toISOString();
    const openKey = `timeclock_open:${userId}`;
    const historyKey = `timeclock_history:${userId}`;
    const current = (await readMeta<TimeEntry | null>(openKey)) ?? open ?? null;

    if (action === "clock_in" && current) return current;
    if (action !== "clock_in" && !current) {
      if (action === "clock_out") return null;
      throw new Error("You are not currently clocked in");
    }

    let next: TimeEntry | null = current;
    if (action === "clock_in") {
      next = {
        id: `local-time-${crypto.randomUUID()}`,
        user_id: userId,
        store_id: storeId,
        clock_in: occurredAt,
        clock_out: null,
        break_start: null,
        break_minutes: 0,
        notes: isOnlineNow() ? null : "Pending offline sync",
      };
    } else if (action === "clock_out" && current) {
      const extraBreak = current.break_start
        ? Math.max(0, Math.round((Date.now() - new Date(current.break_start).getTime()) / 60000))
        : 0;
      const closed = {
        ...current,
        clock_out: occurredAt,
        break_start: null,
        break_minutes: (current.break_minutes ?? 0) + extraBreak,
      };
      const cachedHistory = (await readMeta<TimeEntry[]>(historyKey)) ?? [];
      await cacheMeta(
        historyKey,
        [closed, ...cachedHistory.filter((entry) => entry.id !== closed.id)].slice(0, 20),
      );
      next = null;
    } else if (action === "start_break" && current) {
      next = current.break_start ? current : { ...current, break_start: occurredAt };
    } else if (action === "end_break" && current?.break_start) {
      const mins = Math.max(
        0,
        Math.round((Date.now() - new Date(current.break_start).getTime()) / 60000),
      );
      next = {
        ...current,
        break_start: null,
        break_minutes: (current.break_minutes ?? 0) + mins,
      };
    }

    // Local state is authoritative for the register UI. Queue the cloud write
    // and sync it in the background instead of making the cashier wait for
    // Ethernet/Wi-Fi before the screen refreshes.
    await cacheMeta(openKey, next);
    qc.setQueryData(["myOpenEntry", userId], next);
    qc.setQueryData(["pos-clock-status", userId], next ? { id: next.id } : null);

    await saveOfflineAction({
      id: crypto.randomUUID(),
      idempotency_key: `timeclock:${userId}:${action}:${occurredAt}`,
      kind: "timeclock",
      store_id: storeId,
      user_id: userId,
      payload: { action, occurredAt },
      local_created_at: occurredAt,
      status: "pending",
      attempts: 0,
    });

    if (isOnlineNow()) {
      void import("@/lib/offline/sync").then(({ syncNow }) => syncNow().catch(() => {}));
    }
    return next;
  };

  const ensureRegisterOpen = async (requestedOpeningCash?: number) => {
    if (!storeId || !userId || openShiftQ.data?.rows?.[0]) return;
    const openedAt = new Date().toISOString();
    const savedOpening = Number(localStorage.getItem("pos.register.lastOpeningCash") ?? "0");
    const openingCash = Number.isFinite(requestedOpeningCash) && Number(requestedOpeningCash) >= 0
      ? Number(requestedOpeningCash)
      : Number.isFinite(savedOpening) && savedOpening >= 0
        ? savedOpening
        : 0;
    localStorage.setItem("pos.register.lastOpeningCash", String(openingCash));

    const local = {
      id: crypto.randomUUID(),
      store_id: storeId,
      opened_by: userId,
      opened_at: openedAt,
      opening_cash: openingCash,
      status: "open" as const,
      terminal_id: null,
    };

    await cacheMeta(`open_register_session:${userId}`, local);
    // Keep the legacy alias empty so a different employee cannot inherit it.
    await cacheMeta("open_register_session", null).catch(() => {});
    await saveOfflineAction({
      id: crypto.randomUUID(),
      idempotency_key: `register-open:${local.id}`,
      kind: "register_open",
      store_id: storeId,
      user_id: userId,
      payload: {
        id: local.id,
        opened_at: openedAt,
        opening_cash: openingCash,
        notes: "Opened at clock-in",
      },
      local_created_at: openedAt,
      status: "pending",
      attempts: 0,
    });
    qc.setQueryData(["timeclock", "open-shift", storeId, userId], { rows: [local] });
    qc.setQueryData(["pos-shell", "open-shift", storeId, userId], {
      id: local.id,
      opened_at: local.opened_at,
    });

    // Opening the register means the cashier is about to count/use the drawer.
    // Fire the real printer-driven ESC/POS drawer pulse immediately. Failure is
    // non-fatal: the register stays open and hardware can be retried separately.
    if (isNativeShell) void testDrawer().catch(() => {});

    if (isOnlineNow()) {
      void import("@/lib/offline/sync").then(({ syncNow }) => syncNow().catch(() => {}));
    }
  };

  const clockIn = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      const next = await applyClockAction("clock_in");
      await ensureRegisterOpen(Number(openingCash));
      return next;
    },
    onSuccess: (next) => {
      invalidate(next);
      toast.success("Clocked in and register opened");
      navigate({ to: "/pos" as any, replace: true });
    },
    onError: (e) => toast.error(userFacingError(e, "Could not clock in. Try again.")),
  });

  const clockOut = useMutation({
    networkMode: "always",
    mutationFn: () => applyClockAction("clock_out"),
    onSuccess: (next) => {
      invalidate(next);
      toast.success(
        isOnlineNow() ? "Clocked out" : "Clocked out offline  -  will sync automatically",
      );
    },
    onError: (e) => toast.error(userFacingError(e, "Could not clock out. Try again.")),
  });

  const startBreak = useMutation({
    networkMode: "always",
    mutationFn: () => applyClockAction("start_break"),
    onSuccess: (next) => {
      invalidate(next);
      toast.success(isOnlineNow() ? "Break started" : "Break started offline");
    },
    onError: (e) => toast.error(userFacingError(e, "Could not update the break. Try again.")),
  });

  const endBreak = useMutation({
    networkMode: "always",
    mutationFn: () => applyClockAction("end_break"),
    onSuccess: (next) => {
      invalidate(next);
      toast.success(isOnlineNow() ? "Break ended" : "Break ended offline");
    },
    onError: (e) => toast.error(userFacingError(e, "Could not update the break. Try again.")),
  });

  const anyBusy =
    clockIn.isPending || clockOut.isPending || startBreak.isPending || endBreak.isPending;

  const totals = computeTotals(history);

  // Native APK Clock Out decision flow. Web POS keeps the direct
  // clockOut.mutate() call so nothing changes on the desktop dashboard.
  const handleClockOut = async () => {
    if (!open) return;
    if (isNativeShell) {
      // Ambiguous open shifts: refuse to auto-close either one.
      if (shiftAmbiguous) {
        const correlationId =
          (crypto as { randomUUID?: () => string }).randomUUID?.() ??
          `cc-${Date.now().toString(36)}`;
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
          // tender  -  the register broadcasts paymentBusy for all of them
          // via useNativeActivitySignal. Recovery lives in the POS itself.
          toast.error(
            "A transaction is in progress. Complete or cancel it in the register before clocking out.",
          );
          return;
        }
        if (flags.hasCart) {
          // Never silently discard a cart. Send the user back to the
          // register  -  they can complete the sale or use the register's
          // existing (permission-gated) cancel flow, which already routes
          // through ManagerOverrideDialog for cashiers.
          toast.error(
            "You have an active cart. Complete or cancel the sale in the register before clocking out.",
          );
          return;
        }
      } catch {
        /* module unavailable  -  proceed */
      }

      // If a register shift is open under THIS cashier, force Shift Review
      // first. CloseShiftDialog re-checks pending offline sales and manager
      // approval; the clock-out mutation is chained into beforeSignOut.
      if (openShift?.id) {
        // Offline cash sales are included in the local shift totals and the
        // close action is queued after them, so the cashier can finish the
        // complete shift without an internet connection.
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
    if (isNativeShell) {
      try {
        await clockOut.mutateAsync();
        await returnToPin();
      } catch {
        // Clock-out errors are handled by the mutation/UI; remain on this screen.
      }
      return;
    }
    clockOut.mutate();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Time Clock" subtitle="Clock in, take breaks, clock out." />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 space-y-4 md:p-6 md:pb-10">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
              Your status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              {!open && <Badge variant="secondary">Clocked out</Badge>}
              {open && !open.break_start && (
                <Badge className="bg-success text-success-foreground">On the clock</Badge>
              )}
              {open?.break_start && (
                <Badge variant="outline" className="border-warning text-warning">
                  On break
                </Badge>
              )}
              {open && (
                <span className="text-sm text-muted-foreground">
                  Since {format(new Date(open.clock_in), "p")} ·{" "}
                  {formatDistanceStrict(new Date(open.clock_in), new Date())}
                </span>
              )}
            </div>
            {!open && (
              <div className="grid w-full max-w-xl gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[180px_1fr] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="opening-cash">Opening cash</Label>
                  <Input
                    id="opening-cash"
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingCash}
                    onChange={(event) => setOpeningCash(event.target.value)}
                  />
                </div>
                <Button size="lg" onClick={() => clockIn.mutate()} disabled={anyBusy || Number(openingCash) < 0}>
                  <LogIn className="size-4 mr-2" /> Clock in & open register
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                variant="outline"
                onClick={() => void handleClockOut()}
                disabled={!open || anyBusy}
              >
                <LogOut className="size-4 mr-2" /> Clock out
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => startBreak.mutate()}
                disabled={!open || !!open.break_start || anyBusy}
              >
                <Coffee className="size-4 mr-2" /> Start break
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => endBreak.mutate()}
                disabled={!open?.break_start || anyBusy}
              >
                <PlayCircle className="size-4 mr-2" /> End break
              </Button>
              {anyBusy && (
                <Loader2 className="size-5 animate-spin text-muted-foreground self-center" />
              )}
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
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No one is currently clocked in.
                </div>
              ) : (
                whosIn.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                  >
                    <div>
                      <div className="font-semibold text-sm">
                        {r.profile?.full_name ||
                          `${r.profile?.first_name ?? ""} ${r.profile?.last_name ?? ""}`.trim() ||
                          r.profile?.email}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        ID {r.profile?.employee_id}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div>
                        {r.break_start ? (
                          <Badge variant="outline">On break</Badge>
                        ) : (
                          <Badge>Active</Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-1">
                        In at {format(new Date(r.clock_in), "p")}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent entries</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {history.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No time entries yet.
              </div>
            )}
            {history.map((e) => {
              const inD = new Date(e.clock_in);
              const outD = e.clock_out ? new Date(e.clock_out) : null;
              const mins = outD
                ? Math.max(
                    0,
                    Math.round((outD.getTime() - inD.getTime()) / 60000) - (e.break_minutes ?? 0),
                  )
                : null;
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between px-4 py-2 border-b last:border-b-0 text-xs"
                >
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {format(inD, "EEE, MMM d")}
                      {e.late && (
                        <Badge variant="outline" className="border-warning text-warning">
                          Late {e.late_minutes ?? 0}m
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {format(inD, "p")} – {outD ? format(outD, "p") : "…"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono">
                      {mins != null ? `${(mins / 60).toFixed(2)} h` : " - "}
                    </div>
                    {(e.break_minutes ?? 0) > 0 && (
                      <div className="text-muted-foreground">Break {e.break_minutes}m</div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/*
        Native-shell Shift Review  -  reuses the production CloseShiftDialog.
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
                details: {
                  channel: "native_shell",
                  stage: "clock_out_completed",
                  shift_id: openShift.id,
                },
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
            void returnToPin();
          }}
        />
      )}
    </div>
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
