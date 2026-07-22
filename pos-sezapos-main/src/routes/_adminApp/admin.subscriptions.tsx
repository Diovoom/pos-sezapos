import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListSubscriptions,
  adminRefreshSubscription,
  adminCancelSubscription,
  adminRestoreSubscription,
  adminSubscriptionStats,
} from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getStripeEnvironment } from "@/lib/stripe";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_adminApp/admin/subscriptions")({
  validateSearch: (raw: Record<string, unknown>) => ({
    status: typeof raw.status === "string" ? raw.status : "all",
  }),
  head: () => ({ meta: [{ title: "Subscriptions — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SubscriptionsPage,
});

type ActionKind = "cancel_end" | "cancel_now" | "restore";

function SubscriptionsPage() {
  const env = getStripeEnvironment();
  const routeSearch = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const allowedStatuses = ["all", "active", "trialing", "past_due", "canceled", "unpaid"];
  const filter = allowedStatuses.includes(routeSearch.status) ? routeSearch.status : "all";
  const [page, setPage] = useState(1);
  const list = useServerFn(adminListSubscriptions);
  const stats = useServerFn(adminSubscriptionStats);
  const refresh = useServerFn(adminRefreshSubscription);
  const cancel = useServerFn(adminCancelSubscription);
  const restore = useServerFn(adminRestoreSubscription);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin_subscriptions", filter, page],
    queryFn: () => list({ data: { filter, page, pageSize: 50 } }),
  });
  const { data: statsData } = useQuery({
    queryKey: ["admin_subscription_stats"],
    queryFn: () => stats(),
  });

  const [dialog, setDialog] = useState<{ open: boolean; kind: ActionKind; sub: any } | null>(null);
  const [reason, setReason] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin_subscriptions"] });
    qc.invalidateQueries({ queryKey: ["admin_subscription_stats"] });
  };

  async function doRefresh(id: string) {
    try {
      const r = await refresh({ data: { subscriptionId: id, environment: env } });
      if ("error" in r) toast.error(r.error);
      else { toast.success("Refreshed from Stripe"); invalidate(); }
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function submitDialog() {
    if (!dialog) return;
    if (reason.trim().length < 4) { toast.error("Reason is required"); return; }
    try {
      const r = dialog.kind === "restore"
        ? await restore({ data: { subscriptionId: dialog.sub.id, environment: env, reason } })
        : await cancel({ data: { subscriptionId: dialog.sub.id, environment: env, reason, atPeriodEnd: dialog.kind === "cancel_end" } });
      if ("error" in r) toast.error(r.error);
      else { toast.success("Applied"); invalidate(); setDialog(null); setReason(""); }
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  const c = statsData?.counts ?? {};
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscriptions &amp; Billing</h1>
        <p className="text-sm text-muted-foreground">Live Stripe subscription records across every merchant.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total" value={c.total ?? 0} />
        <Stat label="Active" value={c.active ?? 0} />
        <Stat label="Trialing" value={c.trialing ?? 0} />
        <Stat label="Past due" value={c.past_due ?? 0} tone={(c.past_due ?? 0) > 0 ? "text-amber-600" : undefined} />
        <Stat label="MRR (live, est.)" value={`$${(statsData?.mrr_usd ?? 0).toLocaleString()}`} />
      </div>

      {statsData && statsData.past_due.length > 0 && (
        <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Past-due queue ({statsData.past_due.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Business</th><th className="p-3">Plan</th><th className="p-3">Period end</th></tr></thead>
              <tbody>
                {statsData.past_due.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">
                      {r.store_id ? <Link to="/admin/businesses/$storeId" params={{ storeId: r.store_id }} className="text-primary hover:underline">{r.store_name}</Link> : "—"}
                      <div className="text-xs text-muted-foreground">{r.store_email ?? ""}</div>
                    </td>
                    <td className="p-3 text-xs">{r.price_id ?? "—"}</td>
                    <td className="p-3 text-xs">{r.current_period_end ? format(new Date(r.current_period_end), "MMM d, yyyy") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filter} onValueChange={(v) => {
          setPage(1);
          navigate({ search: { status: v }, replace: true });
        }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="past_due">Past due</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{data?.count ?? 0} match</div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading…</div>
          ) : (data?.rows ?? []).length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">No subscriptions match.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Business</th><th className="p-3">Plan</th><th className="p-3">Status</th><th className="p-3">Period end</th><th className="p-3">Env</th><th className="p-3">Stripe</th><th className="p-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {data!.rows.map((s: any) => {
                    const active = s.status === "active" || s.status === "trialing" || s.status === "past_due";
                    return (
                      <tr key={s.id} className="border-t">
                        <td className="p-3">
                          {s.store_id ? (
                            <Link to="/admin/businesses/$storeId" params={{ storeId: s.store_id }} className="text-primary hover:underline">{s.store_name}</Link>
                          ) : "—"}
                          <div className="text-xs text-muted-foreground">{s.store_email ?? ""}</div>
                        </td>
                        <td className="p-3 text-xs">{s.price_id ?? "—"}</td>
                        <td className="p-3">
                          <Badge variant="outline">{s.status}</Badge>
                          {s.cancel_at_period_end && <Badge variant="outline" className="ml-1">cancel@end</Badge>}
                        </td>
                        <td className="p-3 text-xs">{s.current_period_end ? format(new Date(s.current_period_end), "MMM d, yyyy") : "—"}</td>
                        <td className="p-3 text-xs"><Badge variant="outline">{s.environment}</Badge></td>
                        <td className="p-3 text-xs font-mono truncate max-w-[180px]">{s.stripe_subscription_id ?? "—"}</td>
                        <td className="p-3 text-right space-x-1 whitespace-nowrap">
                          {s.stripe_subscription_id && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => doRefresh(s.id)}>Refresh</Button>
                              {active && !s.cancel_at_period_end && (
                                <Button size="sm" variant="outline" onClick={() => { setDialog({ open: true, kind: "cancel_end", sub: s }); setReason(""); }}>Cancel@end</Button>
                              )}
                              {active && (
                                <Button size="sm" variant="destructive" onClick={() => { setDialog({ open: true, kind: "cancel_now", sub: s }); setReason(""); }}>Cancel now</Button>
                              )}
                              {s.cancel_at_period_end && (
                                <Button size="sm" variant="outline" onClick={() => { setDialog({ open: true, kind: "restore", sub: s }); setReason(""); }}>Restore</Button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {(data?.count ?? 0) > 50 && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      <Dialog open={!!dialog?.open} onOpenChange={(o) => { if (!o) { setDialog(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "restore" ? "Restore subscription" : dialog?.kind === "cancel_end" ? "Cancel at period end" : "Cancel immediately"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.kind === "cancel_now"
                ? "Access is revoked immediately. This calls Stripe and is audited."
                : dialog?.kind === "cancel_end"
                ? "Merchant keeps access until the current billing period ends."
                : "Removes the scheduled cancellation. Merchant continues to be billed."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (required, logged in audit trail)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ticket #, request from merchant, chargeback, etc." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setReason(""); }}>Cancel</Button>
            <Button
              variant={dialog?.kind === "cancel_now" ? "destructive" : "default"}
              onClick={submitDialog}
            >Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone ?? ""}`}>{value}</div>
    </CardContent></Card>
  );
}
