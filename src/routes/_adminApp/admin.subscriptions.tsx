import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListSubscriptions, adminRefreshSubscription } from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getStripeEnvironment } from "@/lib/stripe";

export const Route = createFileRoute("/_adminApp/admin/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const env = getStripeEnvironment();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const list = useServerFn(adminListSubscriptions);
  const refresh = useServerFn(adminRefreshSubscription);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin_subscriptions", filter, page],
    queryFn: () => list({ data: { filter, page, pageSize: 50 } }),
  });

  async function doRefresh(id: string) {
    try {
      const r = await refresh({ data: { subscriptionId: id, environment: env } });
      if ("error" in r) toast.error(r.error); else { toast.success("Refreshed"); qc.invalidateQueries({ queryKey: ["admin_subscriptions"] }); }
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">Backed by Stripe records.</p>
      </div>
      <div className="flex gap-2">
        <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
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
                <thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Business</th><th className="p-3">Plan</th><th className="p-3">Status</th><th className="p-3">Period end</th><th className="p-3">Env</th><th className="p-3">Stripe</th><th className="p-3"></th></tr></thead>
                <tbody>
                  {data!.rows.map((s: any) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-3">
                        {s.store_id ? (
                          <Link to="/admin/businesses/$storeId" params={{ storeId: s.store_id }} className="text-primary hover:underline">{s.store_name}</Link>
                        ) : "—"}
                        <div className="text-xs text-muted-foreground">{s.store_email ?? ""}</div>
                      </td>
                      <td className="p-3 text-xs">{s.price_id}</td>
                      <td className="p-3">
                        <Badge variant="outline">{s.status}</Badge>
                        {s.cancel_at_period_end && <Badge variant="outline" className="ml-1">cancel@end</Badge>}
                      </td>
                      <td className="p-3 text-xs">{s.current_period_end ? format(new Date(s.current_period_end), "MMM d, yyyy") : "—"}</td>
                      <td className="p-3 text-xs">{s.environment}</td>
                      <td className="p-3 text-xs font-mono truncate max-w-[180px]">{s.stripe_subscription_id ?? "—"}</td>
                      <td className="p-3">
                        {s.stripe_subscription_id && (
                          <Button size="sm" variant="outline" onClick={() => doRefresh(s.id)}>Refresh</Button>
                        )}
                      </td>
                    </tr>
                  ))}
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
    </div>
  );
}
