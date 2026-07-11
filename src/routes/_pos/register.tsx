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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/hooks/useMe";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Wallet, LockOpen, ArrowUpFromLine, ArrowDownToLine, DoorOpen, Clock, Lock } from "lucide-react";
import { logAudit } from "@/lib/audit-log";
import { openCashDrawer } from "@/lib/pos/hardware";
import { CloseShiftDialog } from "@/components/pos/CloseShiftDialog";
import { OpenDrawerDialog } from "@/components/pos/OpenDrawerDialog";

export const Route = createFileRoute("/_pos/register")({
  head: () => ({ meta: [{ title: "Register — SEZA POS" }, { name: "description", content: "Open and close the cash register for the current shift with cash reconciliation." }] }),
  component: RegisterPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  type: "payout" | "deposit";
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

const DEPOSIT_REASONS = [
  "Cash drop from safe",
  "Owner deposit",
  "Change fund top-up",
  "Other",
];

function RegisterPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const storeId = me?.store?.id as string | undefined;

  const openSession = useQuery({
    queryKey: ["register", "open", storeId],
    enabled: !!storeId,
    queryFn: async (): Promise<Session | null> => {
      const { data } = await sb
        .from("register_sessions")
        .select("*")
        .eq("store_id", storeId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const history = useQuery({
    queryKey: ["register", "history", storeId],
    enabled: !!storeId,
    queryFn: async (): Promise<Session[]> => {
      const { data } = await sb
        .from("register_sessions")
        .select("*")
        .eq("store_id", storeId)
        .order("opened_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Session[];
    },
  });

  return (
    <>
      <PageHeader title="Register" subtitle="Open and close the cash register for this shift" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {openSession.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : openSession.data ? (
          <OpenSessionCard session={openSession.data} onChanged={() => qc.invalidateQueries({ queryKey: ["register"] })} />
        ) : (
          <OpenRegisterCard storeId={storeId} onOpened={() => qc.invalidateQueries({ queryKey: ["register"] })} />
        )}

        <HistoryCard sessions={history.data ?? []} />
      </div>
    </>
  );
}

function OpenRegisterCard({ storeId, onOpened }: { storeId?: string; onOpened: () => void }) {
  const [opening, setOpening] = useState("100");
  const [notes, setNotes] = useState("");
  const { data: me } = useMe();

  const mut = useMutation({
    mutationFn: async () => {
      if (!storeId || !me?.user?.id) throw new Error("No store");
      const amt = Number(opening);
      if (!Number.isFinite(amt) || amt < 0) throw new Error("Invalid opening amount");
      const { data, error } = await sb.from("register_sessions").insert({
        store_id: storeId,
        opened_by: me.user.id,
        opening_cash: amt,
        notes: notes || null,
        status: "open",
      }).select().single();
      if (error) throw error;
      void logAudit({ action: "register.open", entity: "register_session", entity_id: data.id, details: { opening_cash: amt } });
    },
    onSuccess: () => { toast.success("Register opened"); onOpened(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to open register"),
  });

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><LockOpen className="size-5" /> Open Register</CardTitle>
        <CardDescription>Count the starting cash float in the drawer and open the shift.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Opening cash ($)</Label>
          <Input type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} />
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const totals = useQuery({
    queryKey: ["register", "totals", session.id],
    queryFn: async () => {
      const [salesRes, refundRes] = await Promise.all([
        sb.from("sales").select("total, payment_method, status").eq("register_session_id", session.id),
        sb.from("refunds").select("total, payment_method, refund_type, sale_id, sales!inner(register_session_id)").eq("sales.register_session_id", session.id),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sales = (salesRes.data ?? []).filter((s: any) => s.status === "completed");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refunds = (refundRes.data ?? []).filter((r: any) => r.refund_type !== "void");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cashSales = sales.filter((s: any) => s.payment_method === "cash").reduce((a: number, s: any) => a + Number(s.total || 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cardSales = sales.filter((s: any) => s.payment_method !== "cash").reduce((a: number, s: any) => a + Number(s.total || 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cashRefunds = refunds.filter((r: any) => r.payment_method === "cash").reduce((a: number, r: any) => a + Number(r.total || 0), 0);
      return { cashSales, cashRefunds, cardSales, salesCount: sales.length };
    },
  });

  const movements = useQuery({
    queryKey: ["register", "movements", session.id],
    queryFn: async (): Promise<CashMovement[]> => {
      const { data } = await sb
        .from("cash_movements")
        .select("*")
        .eq("register_session_id", session.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as CashMovement[];
    },
  });

  const noSaleCount = useQuery({
    queryKey: ["register", "no-sale-count", session.id],
    queryFn: async () => {
      const { count } = await sb.from("audit_log").select("id", { count: "exact", head: true })
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
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2"><Wallet className="size-5" /> Current Shift</span>
          <Badge className="bg-success/15 text-success border-success/30" variant="outline">
            Opened {new Date(session.opened_at).toLocaleString()}
          </Badge>
        </CardTitle>
        <CardDescription>
          {me?.profile?.full_name || me?.user?.email} · {me?.store?.name ?? "Register"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Opening float" value={fmt(session.opening_cash)} />
          <Stat label="Time worked" value={`${Math.floor(workedMin / 60)}h ${workedMin % 60}m`} />
          <Stat label="Sales" value={String(totals.data?.salesCount ?? 0)} />
          <Stat label="Cash sales" value={fmt(totals.data?.cashSales ?? 0)} />
          <Stat label="Card / other" value={fmt(totals.data?.cardSales ?? 0)} muted />
          <Stat label="No-sale opens" value={String(noSaleCount.data ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCloseOpen(true)} className="flex-1 min-w-[220px]" variant="destructive">
            <Lock className="size-4 mr-2" /> Review &amp; Close Shift
          </Button>
          <Button variant="outline" onClick={() => setDrawerOpen(true)}>
            <DoorOpen className="size-4 mr-2" /> Open Cash Drawer
          </Button>
          <Button variant="outline" onClick={() => setPayoutOpen(true)}>
            <ArrowUpFromLine className="size-4 mr-2" /> Payout
          </Button>
          <Button variant="outline" onClick={() => setDepositOpen(true)}>
            <ArrowDownToLine className="size-4 mr-2" /> Deposit
          </Button>
        </div>

        {safeDropRows.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-2">Safe drops this shift · {fmt(safeDropTotal)}</div>
            <div className="rounded-md border divide-y">
              {safeDropRows.map((m) => (
                <div key={m.id} className="p-2 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{m.reason}</div>
                    {m.notes && <div className="text-xs text-muted-foreground">{m.notes}</div>}
                    <div className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
                  </div>
                  <div className="font-mono text-destructive">-{fmt(Number(m.amount))}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(payouts.length > 0 || deposits.length > 0) && (
          <div>
            <div className="text-sm font-medium mb-2">Cash movements · +{fmt(depositsTotal)} / -{fmt(payoutsTotal)}</div>
            <div className="rounded-md border divide-y">
              {movements.data!.filter((m) => m.type !== "safe_drop").map((m) => (
                <div key={m.id} className="p-2 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {m.type === "payout"
                      ? <ArrowUpFromLine className="size-4 text-destructive" />
                      : <ArrowDownToLine className="size-4 text-success" />}
                    <div>
                      <div className="font-medium capitalize">{m.type} — {m.reason}</div>
                      {m.notes && <div className="text-xs text-muted-foreground">{m.notes}</div>}
                      <div className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className={`font-mono ${m.type === "payout" ? "text-destructive" : "text-success"}`}>
                    {m.type === "payout" ? "-" : "+"}{fmt(Number(m.amount))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    <CloseShiftDialog
      open={closeOpen}
      onOpenChange={setCloseOpen}
      session={session}
      store={me?.store ?? null}
      cashierUserId={me?.user?.id}
      onClosed={() => {
        setCloseOpen(false);
        onChanged();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({ to: "/auth", search: { mode: "pin" } as any, replace: true });
      }}
    />

    <OpenDrawerDialog
      open={drawerOpen}
      onOpenChange={setDrawerOpen}
      session={{ id: session.id, store_id: session.store_id }}
      storeId={session.store_id}
      cashierId={me?.user?.id}
      onCountShift={() => setCloseOpen(true)}
      onSafeDropRecorded={invalidate}
    />

    <CashMovementDialog
      open={payoutOpen}
      onOpenChange={setPayoutOpen}
      type="payout"
      session={session}
      currentBalance={Number(session.opening_cash) + (totals.data?.cashSales ?? 0) - (totals.data?.cashRefunds ?? 0) - payoutsTotal + depositsTotal - safeDropTotal}
      onDone={invalidate}
    />
    <CashMovementDialog
      open={depositOpen}
      onOpenChange={setDepositOpen}
      type="deposit"
      session={session}
      currentBalance={Number(session.opening_cash) + (totals.data?.cashSales ?? 0) - (totals.data?.cashRefunds ?? 0) - payoutsTotal + depositsTotal - safeDropTotal}
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
    mutationFn: async () => {
      if (!valid) throw new Error("Enter a valid amount");
      if (!effectiveReason) throw new Error("Reason is required");
      if (isPayout && amt > currentBalance) throw new Error("Payout exceeds available cash");
      if (!me?.user?.id) throw new Error("Not signed in");
      const { data, error } = await sb.from("cash_movements").insert({
        register_session_id: session.id,
        store_id: session.store_id,
        user_id: me.user.id,
        type,
        amount: Math.round(amt * 100) / 100,
        reason: effectiveReason,
        notes: notes || null,
      }).select().single();
      if (error) throw error;

      const drawer = openCashDrawer(`cash.${type}`);
      void logAudit({
        action: isPayout ? "cash.payout" : "cash.deposit",
        entity: "cash_movement",
        entity_id: data.id,
        details: {
          amount: amt,
          reason: effectiveReason,
          notes: notes || null,
          balance_before: currentBalance,
          balance_after: projected,
          drawer_simulated: drawer.simulated,
        },
      });
      return data;
    },
    onSuccess: () => {
      toast.success(`${label} recorded`);
      reset();
      onOpenChange(false);
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : `${label} failed`),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPayout ? <ArrowUpFromLine className="size-5 text-destructive" /> : <ArrowDownToLine className="size-5 text-success" />}
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
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {reasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
              type="number" step="0.01" min="0" autoFocus
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
                {isPayout ? "-" : "+"}{fmt(valid ? amt : 0)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Expected after {isPayout ? "payout" : "deposit"}</span>
              <span className={`font-mono ${projected < 0 ? "text-destructive" : ""}`}>{fmt(projected)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Invoice #, recipient, etc." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Cancel</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !valid || !effectiveReason || (isPayout && amt > currentBalance)}
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
                    <td>{s.closed_at ? new Date(s.closed_at).toLocaleString() : "—"}</td>
                    <td className="text-right tabular-nums">{fmt(s.opening_cash)}</td>
                    <td className="text-right tabular-nums">{fmt(s.cash_sales)}</td>
                    <td className="text-right tabular-nums">{s.expected_cash != null ? fmt(s.expected_cash) : "—"}</td>
                    <td className="text-right tabular-nums">{s.closing_cash != null ? fmt(s.closing_cash) : "—"}</td>
                    <td className={`text-right tabular-nums ${s.variance == null ? "" : s.variance === 0 ? "" : s.variance > 0 ? "text-success" : "text-destructive"}`}>
                      {s.variance != null ? `${s.variance > 0 ? "+" : ""}${fmt(s.variance)}` : "—"}
                    </td>
                    <td>
                      <Badge variant="outline" className={s.status === "open" ? "text-success border-success/30" : "text-muted-foreground"}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/shifts" search={{ session: s.id }}>Report</Link>
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
