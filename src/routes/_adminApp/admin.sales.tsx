import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminListTrialConversions } from "@/lib/admin/company-admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, Building2, DollarSign, CalendarCheck, RefreshCw, Search } from "lucide-react";

export const Route = createFileRoute("/_adminApp/admin/sales")({
  head: () => ({
    meta: [
      { title: "New Merchant Sales  -  SEZA Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MerchantSalesPage,
});

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    (Number(cents) || 0) / 100,
  );
}

function MerchantSalesPage() {
  const load = useServerFn(adminListTrialConversions);
  const [days, setDays] = useState("90");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["admin_trial_conversions", days, search],
    queryFn: () => load({ data: { days: Number(days), search } }),
    refetchInterval: 60_000,
  });

  const rows = query.data?.rows ?? [];
  const summary = query.data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Merchant Sales</h1>
          <p className="text-sm text-muted-foreground">
            Merchants who completed their first paid SEZA POS subscription after the free trial.
            Store checkout sales are not shown here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary
          label="First-time paid merchants"
          value={summary?.conversions ?? 0}
          icon={Building2}
        />
        <Summary
          label="First-payment revenue"
          value={money(summary?.revenue_cents ?? 0)}
          icon={DollarSign}
          tone="text-emerald-600"
        />
        <Summary
          label="Live conversions"
          value={summary?.live ?? 0}
          icon={TrendingUp}
          tone="text-emerald-600"
        />
        <Summary
          label="Sandbox conversions"
          value={summary?.sandbox ?? 0}
          icon={CalendarCheck}
          tone="text-blue-600"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trial-to-paid conversion ledger</CardTitle>
          <CardDescription>
            Each merchant appears once, using their earliest successful subscription invoice
            recorded by SEZA.
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search merchant name or email…"
              />
            </div>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
                <SelectItem value="3650">All recorded time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {query.isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading merchant conversions…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <div className="font-medium">No first paid conversions recorded in this period</div>
              <p className="mt-1 text-sm text-muted-foreground">
                New successful Stripe subscription invoices will automatically create conversion
                records.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Merchant</th>
                  <th className="p-3">First payment</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Converted</th>
                  <th className="p-3">Environment</th>
                  <th className="p-3">Subscription status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.store_id} className="border-t hover:bg-muted/20">
                    <td className="p-3">
                      <Link
                        to="/admin/businesses/$storeId"
                        params={{ storeId: row.store_id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.store?.name ?? "Unknown merchant"}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {row.store?.email ?? " - "}
                      </div>
                    </td>
                    <td className="p-3 font-semibold">
                      {money(
                        row.amount_cents,
                        String(row.first_payment?.currency ?? "usd").toUpperCase(),
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">
                        {row.store?.plan_tier ?? row.subscription?.price_id ?? " - "}
                      </Badge>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div>{new Date(row.converted_at).toLocaleDateString()}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(row.converted_at).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant={row.environment === "live" ? "default" : "secondary"}>
                        {row.environment}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">
                        {row.subscription?.status ?? row.store?.plan_status ?? " - "}
                      </Badge>
                      {row.store?.trial_ends_at && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Trial ended {new Date(row.store.trial_ends_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: any;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
        <Icon className={`h-7 w-7 ${tone ?? "text-primary"}`} />
      </CardContent>
    </Card>
  );
}
