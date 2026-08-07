import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ChevronLeft, ChevronRight, Lock, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit-log";
import {
  ManagerOverrideDialog,
  type ManagerOverrideResult,
} from "@/components/pos/ManagerOverrideDialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  hasUnsyncedOfflineSales,
  getAllOfflineSales,
  getAllOfflineCashMovements,
  saveOfflineCashMovement,
  saveOfflineAction,
  cacheMeta,
  readMeta,
  employeeMetaKey,
} from "@/lib/offline/db";
import { isOnlineNow } from "@/lib/offline/useOnline";
import { userFacingError } from "@/lib/user-error";

const sb = supabase as any;

type Session = {
  id: string;
  store_id: string;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
};

type Store = {
  id: string;
  name?: string | null;
  starting_cash_float?: number | null;
  show_expected_before_count?: boolean | null;
  variance_alert_threshold?: number | null;
};

const DENOMS: { key: string; label: string; value: number }[] = [
  { key: "b100", label: "$100", value: 100 },
  { key: "b50", label: "$50", value: 50 },
  { key: "b20", label: "$20", value: 20 },
  { key: "b10", label: "$10", value: 10 },
  { key: "b5", label: "$5", value: 5 },
  { key: "b1", label: "$1", value: 1 },
  { key: "q", label: "25¢", value: 0.25 },
  { key: "d", label: "10¢", value: 0.1 },
  { key: "n", label: "5¢", value: 0.05 },
  { key: "p", label: "1¢", value: 0.01 },
];

const fmt = (n: number) => `$${Number(n || 0).toFixed(2)}`;

export function CloseShiftDialog({
  open,
  onOpenChange,
  session,
  store,
  cashierUserId,
  cashierName,
  onClosed,
  beforeSignOut,
  skipSignOut,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: Session;
  store: Store | null;
  cashierUserId?: string;
  cashierName?: string | null;
  onClosed: () => void;
  /** Runs AFTER the shift closes but BEFORE sign-out (e.g. clock-out). */
  beforeSignOut?: () => Promise<void>;
  /** Skip the built-in signOut  -  caller handles session teardown. */
  skipSignOut?: boolean;
}) {
  const qc = useQueryClient();
  const { isSuper } = usePermissions();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [mode, setMode] = useState<"total" | "denom">("total");
  const [totalInput, setTotalInput] = useState("");
  const [denomCounts, setDenomCounts] = useState<Record<string, string>>({});
  const [safeDrop, setSafeDrop] = useState("");
  const [safeDropNote, setSafeDropNote] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [approver, setApprover] = useState<ManagerOverrideResult | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  // Post-close hook failure (e.g. clock-out mutation threw AFTER register
  // shift already closed). Blocks sign-out, keeps summary visible, offers
  // retry. Do NOT re-run the shift-close mutation from this state.
  const [postCloseFailed, setPostCloseFailed] = useState<null | {
    message: string;
    correlationId: string;
  }>(null);
  const [retrying, setRetrying] = useState(false);

  const registerKey = employeeMetaKey("open_register_session", cashierUserId);
  const registerHistoryKey = employeeMetaKey("register_history", cashierUserId);
  const threshold = Number(store?.variance_alert_threshold ?? 5);
  const startingFloat = Number(store?.starting_cash_float ?? 100);
  const showExpectedEarly = !!store?.show_expected_before_count;

  useEffect(() => {
    if (open) {
      setStep(1);
      setMode("total");
      setTotalInput("");
      setDenomCounts({});
      setSafeDrop("");
      setSafeDropNote("");
      setCloseNotes("");
      setConfirm(false);
      setApprover(null);
      setPostCloseFailed(null);
      setRetrying(false);
    }
  }, [open]);

  const runPostCloseHook = async () => {
    if (!beforeSignOut) return true;
    try {
      await beforeSignOut();
      return true;
    } catch (e) {
      const correlationId =
        (crypto as { randomUUID?: () => string }).randomUUID?.() ?? `cc-${Date.now().toString(36)}`;
      const message = e instanceof Error ? e.message : "Post-close step failed";
      setPostCloseFailed({ message, correlationId });
      void logAudit({
        action: "system.error",
        entity: "register_session",
        entity_id: session.id,
        details: {
          stage: "post_close_hook_failed",
          correlation_id: correlationId,
          message,
        },
      });
      toast.error("Shift closed, but post-close step failed.");
      return false;
    }
  };

  const retryPostClose = async () => {
    if (retrying || !postCloseFailed) return;
    setRetrying(true);
    const ok = await runPostCloseHook();
    setRetrying(false);
    if (ok) {
      setPostCloseFailed(null);
      qc.clear();
      if (!skipSignOut) await supabase.auth.signOut();
      onClosed();
    }
  };

  // Live totals for this shift (sales + refunds + movements).
  const totals = useQuery({
    enabled: open,
    queryKey: ["close-shift", "totals", session.id],
    queryFn: async () => {
      if (!isOnlineNow()) {
        const [sales, movements] = await Promise.all([
          getAllOfflineSales(),
          getAllOfflineCashMovements(),
        ]);
        const localSales = sales.filter(
          (sale) => sale.register_session_id === session.id && sale.status !== "conflict",
        );
        const localMovements = movements.filter(
          (movement) => movement.register_session_id === session.id,
        );
        const cashSales = localSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
        const grossSales = localSales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0);
        const totalDiscount = localSales.reduce((sum, sale) => sum + Number(sale.discount || 0), 0);
        const deposits = localMovements
          .filter((movement) => movement.type === "deposit")
          .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
        const payouts = localMovements
          .filter((movement) => movement.type === "payout")
          .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
        const safeDrops = localMovements
          .filter((movement) => movement.type === "safe_drop")
          .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
        const expected = Number(session.opening_cash) + cashSales + deposits - payouts - safeDrops;
        return {
          salesCount: localSales.length,
          grossSales,
          totalDiscount,
          cashSales,
          cardSales: 0,
          cashRefunds: 0,
          totalRefunds: 0,
          voids: 0,
          deposits,
          payouts,
          safeDrops,
          expected,
          noSaleCount: localMovements.filter((movement) => movement.type === "no_sale").length,
          noSaleEvents: [],
        };
      }

      const [salesRes, refundRes, movRes, noSaleRes] = await Promise.all([
        sb
          .from("sales")
          .select("total, tax, subtotal, discount, payment_method, status")
          .eq("register_session_id", session.id),
        sb
          .from("refunds")
          .select("total, payment_method, refund_type, sale_id, sales!inner(register_session_id)")
          .eq("sales.register_session_id", session.id),
        sb
          .from("cash_movements")
          .select("type, amount, reason, notes, created_at")
          .eq("register_session_id", session.id),
        sb
          .from("audit_log")
          .select("id, details, created_at")
          .eq("action", "drawer.no_sale_open")
          .eq("entity_id", session.id),
      ]);

      const sales = (salesRes.data ?? []) as any[];

      const refunds = (refundRes.data ?? []) as any[];

      const movs = (movRes.data ?? []) as any[];

      const noSales = (noSaleRes.data ?? []) as any[];
      const completed = sales.filter((sale) => sale.status === "completed");
      const voided = sales.filter((sale) => sale.status === "voided");
      const cashSales = completed
        .filter((sale) => sale.payment_method === "cash")
        .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
      const cardSales = completed
        .filter((sale) => sale.payment_method !== "cash")
        .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
      const cashRefunds = refunds
        .filter((refund) => refund.payment_method === "cash" && refund.refund_type !== "void")
        .reduce((sum, refund) => sum + Number(refund.total || 0), 0);
      const totalRefunds = refunds
        .filter((refund) => refund.refund_type !== "void")
        .reduce((sum, refund) => sum + Number(refund.total || 0), 0);
      const grossSales = completed.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0);
      const totalDiscount = completed.reduce((sum, sale) => sum + Number(sale.discount || 0), 0);
      const deposits = movs
        .filter((movement) => movement.type === "deposit")
        .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
      const payouts = movs
        .filter((movement) => movement.type === "payout")
        .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
      const safeDrops = movs
        .filter((movement) => movement.type === "safe_drop")
        .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
      const expected =
        Number(session.opening_cash) + cashSales + deposits - cashRefunds - payouts - safeDrops;
      return {
        salesCount: completed.length,
        grossSales,
        totalDiscount,
        cashSales,
        cardSales,
        cashRefunds,
        totalRefunds,
        voids: voided.length,
        deposits,
        payouts,
        safeDrops,
        expected,
        noSaleCount: noSales.length,
        noSaleEvents: noSales,
      };
    },
  });

  const denomTotal = useMemo(() => {
    return DENOMS.reduce((a, d) => a + Number(denomCounts[d.key] || 0) * d.value, 0);
  }, [denomCounts]);

  const counted = mode === "denom" ? Math.round(denomTotal * 100) / 100 : Number(totalInput || 0);
  const expected = totals.data?.expected ?? 0;
  const variance = counted - expected;
  const status: "over" | "short" | "balanced" =
    variance === 0 ? "balanced" : variance > 0 ? "over" : "short";
  const needsApproval = Math.abs(variance) > threshold && !isSuper;

  const suggestedDrop = Math.max(0, counted - startingFloat);
  const dropAmt = Number(safeDrop || 0);
  const dropValid = Number.isFinite(dropAmt) && dropAmt >= 0 && dropAmt <= counted;
  const remaining = counted - (Number.isFinite(dropAmt) ? dropAmt : 0);

  const closeMut = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!confirm) throw new Error("Confirm the drawer count before closing");
      if (!dropValid) throw new Error("Safe drop amount is invalid");
      if (needsApproval && !approver) throw new Error("Manager approval required");
      if (!cashierUserId) throw new Error("Not signed in");
      const closedAt = new Date().toISOString();
      if (!isOnlineNow()) {
        if (dropAmt > 0) {
          const movementId = crypto.randomUUID();
          await saveOfflineCashMovement({
            id: movementId,
            idempotency_key: `safe-drop:${movementId}`,
            register_session_id: session.id,
            store_id: session.store_id,
            user_id: cashierUserId,
            type: "safe_drop",
            amount: Math.round(dropAmt * 100) / 100,
            reason: "Shift close",
            notes: safeDropNote.trim() || null,
            local_created_at: closedAt,
            status: "pending",
            attempts: 0,
          });
        }
        await saveOfflineAction({
          id: crypto.randomUUID(),
          idempotency_key: `register-close:${session.id}`,
          kind: "register_close",
          store_id: session.store_id,
          user_id: cashierUserId,
          payload: {
            id: session.id,
            closed_at: closedAt,
            closing_cash: counted,
            expected_cash: expected,
            variance,
            cash_sales: totals.data?.cashSales ?? 0,
            cash_refunds: totals.data?.cashRefunds ?? 0,
            safe_drop_amount: Math.round(dropAmt * 100) / 100,
            close_notes: closeNotes.trim() || null,
          },
          local_created_at: closedAt,
          status: "pending",
          attempts: 0,
        });
        const closedLocal = {
          ...session,
          status: "closed",
          closed_at: closedAt,
          closed_by: cashierUserId,
          closing_cash: counted,
          expected_cash: expected,
          variance,
        };
        const history = (await readMeta<any[]>(registerHistoryKey)) ?? [];
        await cacheMeta(
          registerHistoryKey,
          [closedLocal, ...history.filter((row) => row.id !== session.id)].slice(0, 20),
        );
        await cacheMeta(registerKey, null);
        return { ...closedLocal, offline: true };
      }

      // When a connection is available, give queued sales one immediate sync
      // attempt before closing. This preserves server-side register totals.
      try {
        if (await hasUnsyncedOfflineSales(session.id)) {
          const { syncNow } = await import("@/lib/offline/sync");
          await syncNow();
        }
        if (await hasUnsyncedOfflineSales(session.id)) {
          throw new Error(
            "Some offline sales still need attention. Open Pending Sync before closing this shift.",
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes("offline sales") || error.message.includes("Pending Sync"))
        )
          throw error;
      }

      // Idempotent close: if a prior tap already closed this shift, treat that
      // state as success instead of showing "Shift already closed" forever.
      const { data: existingSession, error: existingError } = await sb
        .from("register_sessions")
        .select("*")
        .eq("id", session.id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existingSession?.status === "closed") {
        await cacheMeta(registerKey, null);
        return { ...existingSession, alreadyClosed: true };
      }

      // 1. Record safe drop as a cash_movements row when > 0.
      if (dropAmt > 0) {
        const { error: cmErr } = await sb.from("cash_movements").insert({
          register_session_id: session.id,
          store_id: session.store_id,
          user_id: cashierUserId,
          type: "safe_drop",
          amount: Math.round(dropAmt * 100) / 100,
          reason: "Shift close",
          notes: safeDropNote.trim() || null,
        });
        if (cmErr) throw cmErr;
      }

      // 2. Atomic close: WHERE status='open' → double-click cannot close twice.
      const { data: closed, error } = await sb
        .from("register_sessions")
        .update({
          status: "closed",
          closed_at: closedAt,
          closed_by: cashierUserId,
          closing_cash: counted,
          expected_cash: expected,
          variance,
          cash_sales: totals.data?.cashSales ?? 0,
          cash_refunds: totals.data?.cashRefunds ?? 0,
          safe_drop_amount: Math.round(dropAmt * 100) / 100,
          approver_id: approver?.manager_id ?? null,
          close_notes: closeNotes.trim() || null,
          denominations: mode === "denom" ? denomCounts : null,
        })
        .eq("id", session.id)
        .eq("status", "open")
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!closed) {
        const { data: current, error: currentError } = await sb
          .from("register_sessions")
          .select("*")
          .eq("id", session.id)
          .maybeSingle();
        if (currentError) throw currentError;
        if (current?.status === "closed") {
          await cacheMeta(registerKey, null);
          return { ...current, alreadyClosed: true };
        }
        throw new Error("The shift could not be closed. Try again.");
      }
      await cacheMeta(registerKey, null);

      void logAudit({
        action: "register.close",
        entity: "register_session",
        entity_id: session.id,
        details: {
          expected,
          counted,
          variance,
          safe_drop_amount: dropAmt,
          cash_remaining: remaining,
          approver_id: approver?.manager_id ?? null,
          approver_name: approver?.manager_name ?? null,
          mode,
        },
      });

      return closed;
    },
    onSuccess: async (closed) => {
      const offlineClosed = Boolean((closed as any)?.offline);
      toast.success(
        offlineClosed ? "Shift closed offline  -  it will sync automatically" : "Shift closed",
      );

      // Print immediately from the locally calculated close totals. A printer
      // problem must never undo or re-run a successfully closed shift.
      try {
        const { printShiftCloseSummary } = await import("@/lib/hardware/native-receipt");
        const printed = await printShiftCloseSummary({
          shiftId: session.id,
          storeName: store?.name ?? "SEZA POS",
          cashierName,
          openedAt: session.opened_at,
          closedAt: String((closed as any)?.closed_at ?? new Date().toISOString()),
          openingCash: Number(session.opening_cash ?? 0),
          cashSales: Number(totals.data?.cashSales ?? 0),
          cardSales: Number(totals.data?.cardSales ?? 0),
          refunds: Number(totals.data?.totalRefunds ?? 0),
          expectedCash: expected,
          countedCash: counted,
          variance,
          safeDrop: Number.isFinite(dropAmt) ? dropAmt : 0,
          cashRemaining: remaining,
          notes: closeNotes,
        });
        if (!printed.ok && printed.reason !== "not_native" && printed.reason !== "no_driver") {
          toast.error("Shift closed, but the close report could not print. You can retry from reports.");
        }
      } catch {
        // Closing the shift remains successful even when printing is unavailable.
      }

      const ok = await runPostCloseHook();
      if (!ok) return;
      qc.clear();
      // Preserve the cached authenticated session while offline. The PIN lock
      // screen still protects the register, and queued records need the same
      // authenticated employee session when connectivity returns.
      if (!skipSignOut && !offlineClosed) {
        await supabase.auth.signOut();
      }
      onClosed();
    },
    onError: (e) => toast.error(userFacingError(e, "The shift could not be closed. Try again.")),
  });

  const attemptClose = () => {
    if (!confirm) {
      toast.error("Confirm the drawer count first");
      return;
    }
    if (needsApproval && !approver) {
      setManagerOpen(true);
      return;
    }
    closeMut.mutate();
  };

  const next = () => setStep((s) => (s < 5 ? ((s + 1) as typeof s) : s));
  const back = () => setStep((s) => (s > 1 ? ((s - 1) as typeof s) : s));

  const canAdvance = (() => {
    if (step === 2) return counted >= 0 && (mode === "total" ? totalInput !== "" : denomTotal >= 0);
    if (step === 4) return dropValid;
    return true;
  })();

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!closeMut.isPending && !postCloseFailed && !retrying) onOpenChange(v);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {postCloseFailed
                ? "Shift Closed  -  Action Required"
                : `Review & Close Shift · Step ${step} of 5`}
            </DialogTitle>
            <DialogDescription>
              {postCloseFailed ? (
                "Your register shift is closed. One follow-up step did not complete."
              ) : (
                <>
                  {step === 1 && "Review your shift activity."}
                  {step === 2 && "Count all cash currently in the drawer."}
                  {step === 3 && "Variance is calculated by the server."}
                  {step === 4 && "Remove cash for the safe."}
                  {step === 5 && "Confirm and close."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {postCloseFailed && (
            <div className="space-y-4">
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">
                      Your register shift is closed, but employee clock-out could not be completed.
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {postCloseFailed.message}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      Ref: {postCloseFailed.correlationId}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="font-medium">Final shift summary</div>
                <Row label="Expected cash" value={fmt(expected)} />
                <Row label="Counted cash" value={fmt(counted)} />
                <Row
                  label={`Variance (${status})`}
                  value={`${variance > 0 ? "+" : ""}${fmt(variance)}`}
                  bold
                />
                <Row label="Safe drop" value={fmt(dropAmt)} />
                <Row label="Cash remaining" value={fmt(remaining)} bold />
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" asChild>
                  <a href="/support" target="_blank" rel="noreferrer">
                    Contact Support
                  </a>
                </Button>
                <Button onClick={() => void retryPostClose()} disabled={retrying}>
                  {retrying ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Retry Clock Out
                </Button>
              </DialogFooter>
            </div>
          )}

          {!postCloseFailed && (
            <>
              {totals.isLoading ? (
                <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading shift totals…
                </div>
              ) : (
                <div className="space-y-4">
                  {step === 1 && totals.data && (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <Row label="Completed sales" value={String(totals.data.salesCount)} />
                      <Row label="Gross sales" value={fmt(totals.data.grossSales)} />
                      <Row label="Discounts" value={fmt(totals.data.totalDiscount)} />
                      <Row label="Refunds" value={fmt(totals.data.totalRefunds)} />
                      <Row label="Voids" value={String(totals.data.voids)} />
                      <Row label="Cash sales" value={fmt(totals.data.cashSales)} />
                      <Row label="Card sales" value={fmt(totals.data.cardSales)} />
                      <Row label="Cash refunds" value={fmt(totals.data.cashRefunds)} />
                      <Row label="Deposits" value={fmt(totals.data.deposits)} />
                      <Row label="Payouts" value={fmt(totals.data.payouts)} />
                      <Row label="Safe drops" value={fmt(totals.data.safeDrops)} />
                      <Row label="No-sale drawer opens" value={String(totals.data.noSaleCount)} />
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={mode === "total" ? "default" : "outline"}
                          onClick={() => setMode("total")}
                        >
                          Enter total
                        </Button>
                        <Button
                          size="sm"
                          variant={mode === "denom" ? "default" : "outline"}
                          onClick={() => setMode("denom")}
                        >
                          Count by denomination
                        </Button>
                      </div>

                      {mode === "total" ? (
                        <div className="space-y-1">
                          <Label>Counted cash ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            autoFocus
                            value={totalInput}
                            onChange={(e) => setTotalInput(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            {DENOMS.map((d) => (
                              <div key={d.key} className="flex items-center gap-2">
                                <Label className="w-14 text-right">{d.label}</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  inputMode="numeric"
                                  value={denomCounts[d.key] ?? ""}
                                  onChange={(e) =>
                                    setDenomCounts((p) => ({
                                      ...p,
                                      [d.key]: e.target.value.replace(/\D/g, ""),
                                    }))
                                  }
                                  placeholder="0"
                                />
                                <span className="w-16 text-right tabular-nums text-xs text-muted-foreground">
                                  {fmt(Number(denomCounts[d.key] || 0) * d.value)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between border-t pt-2 font-semibold">
                            <span>Counted total</span>
                            <span className="tabular-nums">{fmt(denomTotal)}</span>
                          </div>
                        </div>
                      )}

                      {showExpectedEarly && (
                        <div className="rounded-md border p-2 text-xs text-muted-foreground flex justify-between">
                          <span>Expected in drawer</span>
                          <span className="tabular-nums">{fmt(expected)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {step === 3 && (
                    <div className="space-y-2">
                      <Row label="Expected cash" value={fmt(expected)} bold />
                      <Row label="Counted cash" value={fmt(counted)} bold />
                      <div
                        className={`rounded-md border p-3 flex items-center justify-between ${
                          status === "balanced"
                            ? "border-success/40 bg-success/5"
                            : Math.abs(variance) > threshold
                              ? "border-destructive/50 bg-destructive/5"
                              : "border-warning/40 bg-warning/5"
                        }`}
                      >
                        <span className="font-medium capitalize flex items-center gap-2">
                          {status !== "balanced" && <AlertTriangle className="size-4" />}
                          {status}
                        </span>
                        <span className="text-xl font-bold tabular-nums">
                          {variance > 0 ? "+" : ""}
                          {fmt(variance)}
                        </span>
                      </div>
                      {needsApproval && (
                        <div className="text-xs text-muted-foreground flex items-start gap-2">
                          <ShieldCheck className="size-4 mt-0.5" />
                          Variance exceeds the ${threshold.toFixed(2)} threshold - a manager must
                          approve at close.
                        </div>
                      )}
                    </div>
                  )}

                  {step === 4 && (
                    <div className="space-y-3">
                      <div className="rounded-md border p-3 space-y-1 text-sm bg-surface/40">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Suggested removal</span>
                          <span className="tabular-nums">{fmt(suggestedDrop)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Counted cash</span>
                          <span className="tabular-nums">{fmt(counted)}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Amount removed for safe ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={counted}
                          inputMode="decimal"
                          autoFocus
                          value={safeDrop}
                          onChange={(e) => setSafeDrop(e.target.value)}
                          placeholder={suggestedDrop.toFixed(2)}
                        />
                        {!dropValid && (
                          <p className="text-xs text-destructive">
                            Removed amount cannot exceed counted cash.
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label>Note (optional)</Label>
                        <Input
                          value={safeDropNote}
                          onChange={(e) => setSafeDropNote(e.target.value)}
                          placeholder="e.g. bag #12"
                        />
                      </div>
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                        Place the removed cash and shift report in the assigned cash bag or
                        envelope, then secure it in the safe.
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>Cash remaining for next shift</span>
                        <span className="tabular-nums">{fmt(remaining)}</span>
                      </div>
                    </div>
                  )}

                  {step === 5 && (
                    <div className="space-y-3 text-sm">
                      <Row label="Opening cash" value={fmt(session.opening_cash)} />
                      <Row label="Cash sales" value={fmt(totals.data?.cashSales ?? 0)} />
                      <Row label="Card sales" value={fmt(totals.data?.cardSales ?? 0)} />
                      <Row label="Refunds" value={fmt(totals.data?.totalRefunds ?? 0)} />
                      <Row label="No-sale opens" value={String(totals.data?.noSaleCount ?? 0)} />
                      <Row label="Expected cash" value={fmt(expected)} bold />
                      <Row label="Counted cash" value={fmt(counted)} bold />
                      <Row
                        label={`Variance (${status})`}
                        value={`${variance > 0 ? "+" : ""}${fmt(variance)}`}
                        bold
                      />
                      <Row label="Safe drop" value={fmt(dropAmt)} />
                      <Row label="Cash remaining" value={fmt(remaining)} bold />
                      <div className="space-y-1">
                        <Label>Close notes (optional)</Label>
                        <Textarea
                          rows={2}
                          value={closeNotes}
                          onChange={(e) => setCloseNotes(e.target.value)}
                        />
                      </div>
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={confirm}
                          onCheckedChange={(v) => setConfirm(!!v)}
                          className="mt-0.5"
                        />
                        <span>
                          I confirm that I counted the drawer and secured the removed cash.
                        </span>
                      </label>
                      {approver && (
                        <div className="text-xs text-muted-foreground">
                          Approved by {approver.manager_name}.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {step > 1 && (
                  <Button variant="outline" onClick={back} disabled={closeMut.isPending}>
                    <ChevronLeft className="size-4 mr-1" /> Back
                  </Button>
                )}
                {step < 5 ? (
                  <Button onClick={next} disabled={!canAdvance || totals.isLoading}>
                    Next <ChevronRight className="size-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    onClick={attemptClose}
                    disabled={closeMut.isPending || !confirm || !dropValid}
                    variant="destructive"
                  >
                    {closeMut.isPending ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <Lock className="size-4 mr-2" />
                    )}
                    {needsApproval && !approver
                      ? "Request Approval & Close"
                      : "Close Shift & Sign Out"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ManagerOverrideDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        action="register.close.override"
        description={`Cash variance ${variance > 0 ? "+" : ""}${fmt(variance)} exceeds the $${threshold.toFixed(2)} threshold.`}
        details={{ expected, counted, variance }}
        onApprove={(r) => {
          setApprover(r);
          setTimeout(() => closeMut.mutate(), 0);
        }}
      />
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
