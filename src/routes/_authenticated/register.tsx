import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMe } from "@/hooks/useMe";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, Wallet, LockOpen, Lock, AlertTriangle } from "lucide-react";
import { logAudit } from "@/lib/audit-log";
import { ManagerOverrideDialog, type ManagerOverrideResult } from "@/components/pos/ManagerOverrideDialog";

export const Route = createFileRoute("/_authenticated/register")({
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
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState(session.notes ?? "");

  const totals = useQuery({
    queryKey: ["register", "totals", session.id],
    queryFn: async () => {
      const [salesRes, refundRes] = await Promise.all([
        sb.from("sales").select("total, payment_method").eq("register_session_id", session.id),
        sb.from("refunds").select("total, payment_method, sale_id, sales!inner(register_session_id)").eq("sales.register_session_id", session.id),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cashSales = (salesRes.data ?? []).filter((s: any) => s.payment_method === "cash").reduce((a: number, s: any) => a + Number(s.total || 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cashRefunds = (refundRes.data ?? []).filter((r: any) => r.payment_method === "cash").reduce((a: number, r: any) => a + Number(r.total || 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cardSales = (salesRes.data ?? []).filter((s: any) => s.payment_method !== "cash").reduce((a: number, s: any) => a + Number(s.total || 0), 0);
      return { cashSales, cashRefunds, cardSales };
    },
  });

  const expected = useMemo(() => {
    const cs = totals.data?.cashSales ?? 0;
    const cr = totals.data?.cashRefunds ?? 0;
    return Number(session.opening_cash) + cs - cr;
  }, [session.opening_cash, totals.data]);

  const variance = closingCash !== "" ? Number(closingCash) - expected : null;

  const close = useMutation({
    mutationFn: async () => {
      const cc = Number(closingCash);
      if (!Number.isFinite(cc) || cc < 0) throw new Error("Enter the counted cash");
      const { error } = await sb.from("register_sessions").update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: me?.user?.id,
        closing_cash: cc,
        expected_cash: expected,
        variance: cc - expected,
        cash_sales: totals.data?.cashSales ?? 0,
        cash_refunds: totals.data?.cashRefunds ?? 0,
        notes: notes || null,
      }).eq("id", session.id);
      if (error) throw error;
      void logAudit({
        action: "register.close",
        entity: "register_session",
        entity_id: session.id,
        details: { closing_cash: cc, expected, variance: cc - expected },
      });
    },
    onSuccess: () => { toast.success("Register closed"); onChanged(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to close"),
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Wallet className="size-5" /> Open Shift</span>
          <Badge className="bg-success/15 text-success border-success/30" variant="outline">
            Opened {new Date(session.opened_at).toLocaleString()}
          </Badge>
        </CardTitle>
        <CardDescription>Current shift totals. Count the drawer and close when the shift ends.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Opening float" value={fmt(session.opening_cash)} />
          <Stat label="Cash sales" value={fmt(totals.data?.cashSales ?? 0)} />
          <Stat label="Cash refunds" value={fmt(totals.data?.cashRefunds ?? 0)} />
          <Stat label="Card / other" value={fmt(totals.data?.cardSales ?? 0)} muted />
        </div>
        <div className="rounded-md border p-3 bg-surface/40 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Expected in drawer</div>
            <div className="text-2xl font-semibold tabular-nums">{fmt(expected)}</div>
          </div>
          {variance !== null && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Variance</div>
              <div className={`text-2xl font-semibold tabular-nums ${variance === 0 ? "" : variance > 0 ? "text-success" : "text-destructive"}`}>
                {variance > 0 ? "+" : ""}{fmt(variance)}
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Counted cash ($)</Label>
            <Input type="number" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Close notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => close.mutate()} disabled={close.isPending} className="w-full" variant="destructive">
          {close.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : <Lock className="size-4 mr-2" />}
          Close Register
        </Button>
      </CardContent>
    </Card>
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
