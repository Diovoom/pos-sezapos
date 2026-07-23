import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminListMerchantBillingPayments } from "@/lib/admin/company-admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, CircleCheck, CircleX, DollarSign, ExternalLink, RefreshCw, Search } from "lucide-react";

export const Route = createFileRoute("/_adminApp/admin/payments")({
  head: () => ({
    meta: [
      { title: "Merchant Payments — SEZA Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MerchantPaymentsPage,
});

function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "usd").toUpperCase(),
  }).format((Number(cents) || 0) / 100);
}

function MerchantPaymentsPage() {
  const list = useServerFn(adminListMerchantBillingPayments);
  const [status, setStatus] = useState("all");
  const [environment, setEnvironment] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["admin_merchant_billing_payments", status, environment, search, page],
    queryFn: () => list({ data: { status, environment, search, page, pageSize: 25 } }),
    refetchInterval: 30_000,
  });

  const summary = query.data?.summary;
  const rows = query.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((query.data?.count ?? 0) / 25));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Merchant Payments</h1>
          <p className="text-sm text-muted-foreground">
            Subscription invoices merchants pay to SEZA for the POS software. Customer checkout transactions are not shown here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Billing events" value={summary?.total ?? 0} icon={CreditCard} />
        <SummaryCard label="Successful payments" value={summary?.paid ?? 0} icon={CircleCheck} tone="text-emerald-600" />
        <SummaryCard label="Failed payments" value={summary?.failed ?? 0} icon={CircleX} tone="text-red-600" />
        <SummaryCard label="Collected by SEZA" value={money(summary?.collected_cents ?? 0)} icon={DollarSign} tone="text-emerald-600" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stripe subscription payment ledger</CardTitle>
          <CardDescription>
            New invoice.payment_succeeded and invoice.payment_failed webhooks are stored here permanently.
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Invoice, customer, subscription…"
              />
            </div>
            <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="void">Void</SelectItem>
                <SelectItem value="uncollectible">Uncollectible</SelectItem>
              </SelectContent>
            </Select>
            <Select value={environment} onValueChange={(value) => { setEnvironment(value); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All environments</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="sandbox">Sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {query.isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading merchant payments…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <div className="font-medium">No merchant billing payments recorded yet</div>
              <p className="mt-1 text-sm text-muted-foreground">
                New Stripe invoice events appear here automatically. Current subscription status remains available on the Subscriptions page.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Merchant</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Billing reason</th>
                  <th className="p-3">Environment</th>
                  <th className="p-3">Stripe invoice</th>
                  <th className="p-3">When</th>
                  <th className="p-3">Links</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((payment: any) => (
                  <tr key={payment.id} className="border-t hover:bg-muted/20">
                    <td className="p-3">
                      {payment.store ? (
                        <Link to="/admin/businesses/$storeId" params={{ storeId: payment.store.id }} className="font-medium text-primary hover:underline">
                          {payment.store.name}
                        </Link>
                      ) : (
                        <span className="font-medium">Unmatched Stripe customer</span>
                      )}
                      <div className="text-xs text-muted-foreground">{payment.store?.email ?? payment.stripe_customer_id ?? "—"}</div>
                      {payment.store?.plan_tier && <Badge variant="outline" className="mt-1">{payment.store.plan_tier}</Badge>}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold">{money(payment.amount_paid_cents || payment.amount_due_cents, payment.currency)}</div>
                      {payment.amount_due_cents !== payment.amount_paid_cents && (
                        <div className="text-xs text-muted-foreground">Due {money(payment.amount_due_cents, payment.currency)}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant={payment.status === "paid" ? "default" : payment.status === "failed" ? "destructive" : "outline"}>
                        {payment.status}
                      </Badge>
                      {payment.failure_message && <div className="mt-1 max-w-xs text-xs text-red-600">{payment.failure_message}</div>}
                    </td>
                    <td className="p-3 text-xs">{payment.billing_reason ?? "—"}</td>
                    <td className="p-3"><Badge variant="outline">{payment.environment}</Badge></td>
                    <td className="p-3 font-mono text-xs">
                      <div>{payment.stripe_invoice_id ?? "—"}</div>
                      <div className="max-w-[180px] truncate text-muted-foreground">{payment.stripe_subscription_id ?? ""}</div>
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">{new Date(payment.occurred_at).toLocaleString()}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {payment.hosted_invoice_url && (
                          <Button asChild size="sm" variant="outline">
                            <a href={payment.hosted_invoice_url} target="_blank" rel="noreferrer">Invoice <ExternalLink className="ml-1 h-3 w-3" /></a>
                          </Button>
                        )}
                        {payment.invoice_pdf_url && (
                          <Button asChild size="sm" variant="ghost">
                            <a href={payment.invoice_pdf_url} target="_blank" rel="noreferrer">PDF</a>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{query.data?.count ?? 0} payment record{(query.data?.count ?? 0) === 1 ? "" : "s"}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
          <span className="self-center text-xs">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: any; tone?: string }) {
  return (
    <Card><CardContent className="p-4 flex items-center justify-between">
      <div><div className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
      <Icon className={`h-7 w-7 ${tone ?? "text-primary"}`} />
    </CardContent></Card>
  );
}
