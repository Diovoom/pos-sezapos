import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/hooks/useMe";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Wallet,
  LockOpen,
  ArrowUpFromLine,
  ArrowDownToLine,
  DoorOpen,
  Clock,
  Lock,
} from "lucide-react";
import { logAudit } from "@/lib/audit-log";
import { openCashDrawer } from "@/lib/pos/hardware";
import { CloseShiftDialog } from "@/components/pos/CloseShiftDialog";
import { OpenDrawerDialog } from "@/components/pos/OpenDrawerDialog";
import {
  cacheMeta,
  readMeta,
  saveOfflineAction,
  saveOfflineCashMovement,
  getAllOfflineCashMovements,
  getAllOfflineSales,
  employeeMetaKey,
} from "@/lib/offline/db";
import { isOnlineNow } from "@/lib/offline/useOnline";
import { userFacingError } from "@/lib/user-error";
import { ManagerSupportFooter } from "@/components/pos/ManagerSupportFooter";

export const Route = createFileRoute("/_pos/register")({
  head: () => ({
    meta: [
      { title: "Register  -  SEZA POS" },
      {
        name: "description",
        content: "Open and close the cash register for the current shift with cash reconciliation.",
      },
    ],
  }),
  component: RegisterPage,
});

const sb = supabase as any;

type Session = {
  id: string;
  store_id: string;
  opened_by: string;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_sales: number;
  cash_refunds: number;
  variance: number | null;
  status: string;
  notes: string | null;
};

type CashMovement = {
  id: string;
  register_session_id: string;
  type: "payout" | "deposit" | "safe_drop";
  amount: number;
  reason: string;
  notes: string | null;
  created_at: string;
};

const PAYOUT_REASONS = [
  "Supplier payment",
  "Store expense",
  "Refund adjustment",
  "Petty cash",
  "Other",
];

const DEPOSIT_REASONS = ["Cash drop from safe", "Owner deposit", "Change fund top-up", "Other"];

export function RegisterPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const storeId = me?.store?.id as string | undefined;
  const userId = me?.user?.id as string | undefined;
  const registerKey = employeeMetaKey("open_register_session", userId);

  const openSession = useQuery({
    queryKey: ["register", "open", storeId, userId],
    enabled: !!storeId && !!userId,
    queryFn: async (): Promise<Session | null> => {
      if (!isOnlineNow()) return (await readMeta<Session | null>(registerKey)) ?? null;
      const { data, error } = await sb
        .from("register_sessions")
        .select("*")
        .eq("store_id", storeId)
        .eq("opened_by", userId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return (await readMeta<Session | null>(registerKey)) ?? null;
      await cacheMeta(registerKey, data ?? null).catch(() => {});
      return data ?? null;
    },
  });

  const historyKey = employeeMetaKey("register_history", userId);
  const history = useQuery({
    queryKey: ["register", "history", storeId, userId],
    enabled: !!storeId && !!userId,
    queryFn: async (): Promise<Session[]> => {
      if (!isOnlineNow()) return (await readMeta<Session[]>(historyKey)) ?? [];
      const { data, error } = await sb
        .from("register_sessions")
        .select("*")
        .eq("store_id", storeId)
        .eq("opened_by", userId)
        .order("opened_at", { ascending: false })
        .limit(20);
      if (error) return (await readMeta<Session[]>(historyKey)) ?? [];
      const rows = (data ?? []) as Session[];
      await cacheMeta(historyKey, rows).catch(() => {});
      return rows;
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Register" subtitle="Cash drawer controls for the current shift." />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 space-y-4 md:p-6 md:pb-10">
        {openSession.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : openSession.data ? (
          <OpenSessionCard
            session={openSession.data}
            onChanged={() => qc.invalidateQueries({ queryKey: ["register"] })}
          />
        ) : (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>No open register shift</CardTitle>
              <CardDescription>
                Clock in from Clock &amp; Shift review before using register cash controls.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate({ to: "/timeclock" as any })}>
                Open Clock &amp; Shift review
              </Button>
            </CardContent>
          </Card>
        )}
        <ManagerSupportFooter />
      </div>
    </div>
  );
}

function OpenRegisterCard({ storeId, onOpened }: { storeId?: string; onOpened: () => void }) {
  const [opening, setOpening] = useState("100");
  const [notes, setNotes] = useState("");
  const { data: me } = useMe();
  const registerKey = employeeMetaKey("open_register_session", me?.user?.id);

  const mut = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!storeId || !me?.user?.id) throw new Error("No store");
      const amt = Number(opening);
      if (!Number.isFinite(amt) || amt < 0) throw new Error("Invalid opening amount");
      const openedAt = new Date().toISOString();
      // Opening a register is a local operation first. The cashier should
      // never wait on Supabase/RLS just to start a shift. Queue the exact
      // operation and sync it immediately when cloud connectivity is healthy.
      const local: Session = {
        id: crypto.randomUUID(),
        store_id: storeId,
        opened_by: me.user.id,
        closed_by: null,
        opened_at: openedAt,
        closed_at: null,
        opening_cash: amt,
        closing_cash: null,
        expected_cash: null,
        cash_sales: 0,
        cash_refunds: 0,
        variance: null,
        status: "open",
        notes: notes || null,
      };
      await cacheMeta(registerKey, local);
      await saveOfflineAction({
        id: crypto.randomUUID(),
        idempotency_key: `register-open:${local.id}`,
        kind: "register_open",
        store_id: storeId,
        user_id: me.user.id,
        payload: { id: local.id, opened_at: openedAt, opening_cash: amt, notes: notes || null },
        local_created_at: openedAt,
        status: "pending",
        attempts: 0,
      });
      if (isOnlineNow()) {
        void import("@/lib/offline/sync").then(({ syncNow }) =>
          syncNow().catch((error) => console.warn("[SEZA POS] register open sync deferred", error)),
        );
      }
      return local;
    },
    onSuccess: () => {
      try { localStorage.setItem("pos.register.lastOpeningCash", String(Number(opening) || 0)); } catch { /* ignore */ }
      toast.success(
        isOnlineNow()
          ? "Register opened"
          : "Register opened offline  -  changes will sync automatically",
      );
      onOpened();
    },
    onError: (e) => toast.error(userFacingError(e, "Could not open the register. Try again.")),
  });

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockOpen className="size-5" /> Open Register
        </CardTitle>
        <CardDescription>
          Count the starting cash float in the drawer and open the shift.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Opening cash ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="w-full">
          {mut.isPending && <Loader2 className="size-4 animate-spin mr-2" />} Open Register
        </Button>
      </CardContent>
    </Card>
  );
}

function OpenSessionCard({ session, onChanged }: { session: Session; onChanged: () => void }) {
  const { data: me } = useMe();
  const userId = me?.user?.id as string | undefined;
  const storeId = me?.store?.id as string | undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const totals = useQuery({
    queryKey: ["register", "totals", session.id],
    queryFn: async () => {
      if (!isOnlineNow()) {
        const local = (await getAllOfflineSales()).filter(
          (sale) => sale.register_session_id === session.id && sale.status !== "conflict",
        );
        return {
          cashSales: local.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
          cashRefunds: 0,
          cardSales: 0,
          salesCount: local.length,
        };
      }
      const [salesRes, refundRes] = await Promise.all([
        sb
          .from("sales")
          .select("total, payment_method, status")
          .eq("register_session_id", session.id),
        sb
          .from("refunds")
          .select("total, payment_method, refund_type, sale_id, sales!inner(register_session_id)")
          .eq("sales.register_session_id", session.id),
      ]);

      const sales = (salesRes.data ?? []).filter((row: any) => row.status === "completed");

      const refunds = (refundRes.data ?? []).filter((row: any) => row.refund_type !== "void");

      const cashSales = sales
        .filter((row: any) => row.payment_method === "cash")
        .reduce((sum: number, row: any) => sum + Number(row.total || 0), 0);

      const cardSales = sales
        .filter((row: any) => row.payment_method !== "cash")
        .reduce((sum: number, row: any) => sum + Number(row.total || 0), 0);

      const cashRefunds = refunds
        .filter((row: any) => row.payment_method === "cash")
        .reduce((sum: number, row: any) => sum + Number(row.total || 0), 0);
      return { cashSales, cashRefunds, cardSales, salesCount: sales.length };
    },
  });

  const movements = useQuery({
    queryKey: ["register", "movements", session.id],
    queryFn: async (): Promise<CashMovement[]> => {
      if (!isOnlineNow()) {
        const local = await getAllOfflineCashMovements();
        return local
          .filter((movement) => movement.register_session_id === session.id)
          .map((movement) => ({
            id: movement.id,
            register_session_id: movement.register_session_id ?? session.id,
            type: movement.type as CashMovement["type"],
            amount: movement.amount,
            reason: movement.reason ?? "Offline movement",
            notes: movement.notes ?? null,
            created_at: movement.local_created_at,
          }))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
      }
      const { data, error } = await sb
        .from("cash_movements")
        .select("*")
        .eq("register_session_id", session.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CashMovement[];
    },
  });

  const noSaleCount = useQuery({
    queryKey: ["register", "no-sale-count", session.id],
    queryFn: async () => {
      if (!isOnlineNow()) {
        const local = await getAllOfflineCashMovements();
        return local.filter(
          (movement) => movement.register_session_id === session.id && movement.type === "no_sale",
        ).length;
      }
      const { count } = await sb
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("action", "drawer.no_sale_open")
        .eq("entity_id", session.id);
      return count ?? 0;
    },
  });

  // Live time-worked ticker.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const workedMin = Math.max(0, Math.round((now - new Date(session.opened_at).getTime()) / 60_000));

  const payouts = (movements.data ?? []).filter((m) => m.type === "payout");
  const deposits = (movements.data ?? []).filter((m) => m.type === "deposit");
  const safeDropRows = (movements.data ?? []).filter((m) => m.type === "safe_drop");
  const payoutsTotal = payouts.reduce((a, m) => a + Number(m.amount), 0);
  const depositsTotal = deposits.reduce((a, m) => a + Number(m.amount), 0);
  const safeDropTotal = safeDropRows.reduce((a, m) => a + Number(m.amount), 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["register", "movements", session.id] });
    qc.invalidateQueries({ queryKey: ["register", "totals", session.id] });
    qc.invalidateQueries({ queryKey: ["register", "no-sale-count", session.id] });
  };

  return (
    <>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-5" /> Register
          </CardTitle>
          <CardDescription>
            Cash controls for {me?.profile?.full_name || me?.user?.email} at {me?.store?.name ?? "this register"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button size="lg" variant="outline" onClick={() => setDrawerOpen(true)} className="h-20 justify-start text-base">
              <DoorOpen className="mr-3 size-5" /> Open cash drawer
            </Button>
            <Button size="lg" variant="outline" onClick={() => setPayoutOpen(true)} className="h-20 justify-start text-base">
              <ArrowUpFromLine className="mr-3 size-5" /> Payout
            </Button>
            <Button size="lg" variant="outline" onClick={() => setDepositOpen(true)} className="h-20 justify-start text-base">
              <ArrowDownToLine className="mr-3 size-5" /> Deposit
            </Button>
          </div>
        </CardContent>
      </Card>

      <OpenDrawerDialog
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        session={{ id: session.id, store_id: session.store_id }}
        storeId={session.store_id}
        cashierId={me?.user?.id}
        onCountShift={() => navigate({ to: "/timeclock" as any })}
        onSafeDropRecorded={invalidate}
      />

      <CashMovementDialog
        open={payoutOpen}
        onOpenChange={setPayoutOpen}
        type="payout"
        session={session}
        currentBalance={
          Number(session.opening_cash) +
          (totals.data?.cashSales ?? 0) -
          (totals.data?.cashRefunds ?? 0) -
          payoutsTotal +
          depositsTotal -
          safeDropTotal
        }
        onDone={invalidate}
      />
      <CashMovementDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        type="deposit"
        session={session}
        currentBalance={
          Number(session.opening_cash) +
          (totals.data?.cashSales ?? 0) -
          (totals.data?.cashRefunds ?? 0) -
          payoutsTotal +
          depositsTotal -
          safeDropTotal
        }
        onDone={invalidate}
      />
    </>
  );
}

function CashMovementDialog({
  open,
  onOpenChange,
  type,
  session,
  currentBalance,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: "payout" | "deposit";
  session: Session;
  currentBalance: number;
  onDone: () => void;
}) {
  const { data: me } = useMe();
  const reasons = type === "payout" ? PAYOUT_REASONS : DEPOSIT_REASONS;
  const [reason, setReason] = useState(reasons[0]);
  const [customReason, setCustomReason] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const isPayout = type === "payout";
  const label = isPayout ? "Cash Payout" : "Cash Deposit";
  const amt = Number(amount);
  const valid = Number.isFinite(amt) && amt > 0;
  const projected = isPayout ? currentBalance - amt : currentBalance + amt;
  const effectiveReason = reason === "Other" ? customReason.trim() : reason;

  const reset = () => {
    setReason(reasons[0]);
    setCustomReason("");
    setAmount("");
    setNotes("");
  };

  const mut = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!valid) throw new Error("Enter a valid amount");
      if (!effectiveReason) throw new Error("Reason is required");
      if (isPayout && amt > currentBalance) throw new Error("Payout exceeds available cash");
      if (!me?.user?.id) throw new Error("Not signed in");
      const rounded = Math.round(amt * 100) / 100;
      const localId = crypto.randomUUID();
      await saveOfflineCashMovement({
        id: localId,
        idempotency_key: `cash:${type}:${localId}`,
        register_session_id: session.id,
        store_id: session.store_id,
        user_id: me.user.id,
        type,
        amount: rounded,
        reason: effectiveReason,
        notes: notes || null,
        local_created_at: new Date().toISOString(),
        status: "pending",
        attempts: 0,
      });
      openCashDrawer(`cash.${type}`);
      if (isOnlineNow()) {
        void import("@/lib/offline/sync").then(({ syncNow }) =>
          syncNow().catch((error) => console.warn("[SEZA POS] cash movement sync deferred", error)),
        );
      }
      return { id: localId };
    },
    onSuccess: () => {
      toast.success(
        isOnlineNow()
          ? `${label} recorded`
          : `${label} recorded offline  -  will sync automatically`,
      );
      reset();
      onOpenChange(false);
      onDone();
    },
    onError: (e) => toast.error(userFacingError(e, `${label} could not be completed. Try again.`)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPayout ? (
              <ArrowUpFromLine className="size-5 text-destructive" />
            ) : (
              <ArrowDownToLine className="size-5 text-success" />
            )}
            {label}
          </DialogTitle>
          <DialogDescription>
            {isPayout
              ? "Record cash leaving the drawer (supplier, expense, petty cash…)."
              : "Record cash added to the drawer mid-shift."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Reason {isPayout && <span className="text-destructive">*</span>}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reason === "Other" && (
              <Input
                placeholder="Specify reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          <div className="space-y-1">
            <Label>Amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="rounded-md border p-3 space-y-1 text-sm bg-surface/40">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current drawer balance</span>
              <span className="font-mono">{fmt(currentBalance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{isPayout ? "Payout" : "Deposit"}</span>
              <span className={`font-mono ${isPayout ? "text-destructive" : "text-success"}`}>
                {isPayout ? "-" : "+"}
                {fmt(valid ? amt : 0)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Expected after {isPayout ? "payout" : "deposit"}</span>
              <span className={`font-mono ${projected < 0 ? "text-destructive" : ""}`}>
                {fmt(projected)}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Invoice #, recipient, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={
              mut.isPending || !valid || !effectiveReason || (isPayout && amt > currentBalance)
            }
            variant={isPayout ? "destructive" : "default"}
          >
            {mut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
            Confirm {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryCard({ sessions }: { sessions: Session[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent shifts</CardTitle>
        <CardDescription>Last 20 register sessions for this store.</CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shifts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2">Opened</th>
                  <th>Closed</th>
                  <th className="text-right">Opening</th>
                  <th className="text-right">Cash sales</th>
                  <th className="text-right">Expected</th>
                  <th className="text-right">Counted</th>
                  <th className="text-right">Variance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2">{new Date(s.opened_at).toLocaleString()}</td>
                    <td>{s.closed_at ? new Date(s.closed_at).toLocaleString() : " - "}</td>
                    <td className="text-right tabular-nums">{fmt(s.opening_cash)}</td>
                    <td className="text-right tabular-nums">{fmt(s.cash_sales)}</td>
                    <td className="text-right tabular-nums">
                      {s.expected_cash != null ? fmt(s.expected_cash) : " - "}
                    </td>
                    <td className="text-right tabular-nums">
                      {s.closing_cash != null ? fmt(s.closing_cash) : " - "}
                    </td>
                    <td
                      className={`text-right tabular-nums ${s.variance == null ? "" : s.variance === 0 ? "" : s.variance > 0 ? "text-success" : "text-destructive"}`}
                    >
                      {s.variance != null
                        ? `${s.variance > 0 ? "+" : ""}${fmt(s.variance)}`
                        : " - "}
                    </td>
                    <td>
                      <Badge
                        variant="outline"
                        className={
                          s.status === "open"
                            ? "text-success border-success/30"
                            : "text-muted-foreground"
                        }
                      >
                        {s.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/shifts" search={{ session: s.id }}>
                          Report
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${muted ? "bg-muted/20" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function fmt(n: number) {
  return `$${Number(n).toFixed(2)}`;
}
