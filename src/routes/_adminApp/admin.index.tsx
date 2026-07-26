import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminOperationsOverview } from "@/lib/admin/company-admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Monitor,
  LifeBuoy,
  MessageSquare,
  CreditCard,
  TrendingUp,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_adminApp/admin/")({
  head: () => ({
    meta: [
      { title: "Operations Center  -  SEZA Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OperationsCenter,
});

type MetricCardProps = {
  label: string;
  value: string | number;
  description: string;
  icon: any;
  to: string;
  search?: Record<string, unknown>;
  tone?: string;
};

function MetricCard({ label, value, description, icon: Icon, to, search, tone }: MetricCardProps) {
  return (
    <Link to={to as any} search={search as any} className="group block">
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-bold">
                {typeof value === "number" ? value.toLocaleString() : value}
              </div>
              <div className="text-sm font-medium mt-0.5">{label}</div>
              <div className="text-xs text-muted-foreground mt-1">{description}</div>
            </div>
            <div className={`rounded-lg p-2 bg-muted ${tone ?? "text-primary"}`}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Open queue <ArrowRight className="ml-1 h-3 w-3" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents || 0) / 100,
  );
}

function OperationsCenter() {
  const load = useServerFn(adminOperationsOverview);
  const query = useQuery({
    queryKey: ["admin_operations_overview"],
    queryFn: () => load(),
    refetchInterval: 60_000,
    retry: 1,
    staleTime: 10_000,
  });
  const data = query.data;
  const t = data?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operations Center</h1>
          <p className="text-sm text-muted-foreground">
            Live SEZA company operations - not merchant checkout activity.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {query.isError ? (
        <Card className="border-destructive">
          <CardContent className="p-8">
            <div className="text-sm text-destructive">
              {(query.error as any)?.message ?? "Could not load platform operations"}
            </div>
            <Button className="mt-3" variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : !t ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground">
            Loading platform operations… This now stops safely instead of hanging if one service is
            unavailable.
          </CardContent>
        </Card>
      ) : (
        <>
          {data?.partial && (
            <Card className="border-amber-400">
              <CardContent className="p-3 text-sm">
                Some service metrics were temporarily unavailable. The Operations Center loaded the
                available data instead of remaining stuck.
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <MetricCard
              label="Businesses"
              value={t.businesses}
              description="All merchant companies"
              icon={Building2}
              to="/admin/businesses"
              search={{
                q: "",
                filter: "all",
                sortBy: "created_at",
                sortDir: "desc",
                page: 1,
                pageSize: 25,
              }}
            />
            <MetricCard
              label="Active merchants"
              value={t.active}
              description="Currently paying and active"
              icon={CheckCircle2}
              tone="text-emerald-600"
              to="/admin/businesses"
              search={{
                q: "",
                filter: "active",
                sortBy: "updated_at",
                sortDir: "desc",
                page: 1,
                pageSize: 25,
              }}
            />
            <MetricCard
              label="Free trials"
              value={t.trialing}
              description="Merchants still in trial"
              icon={Clock3}
              tone="text-blue-600"
              to="/admin/businesses"
              search={{
                q: "",
                filter: "trial",
                sortBy: "trial_ends_at",
                sortDir: "asc",
                page: 1,
                pageSize: 25,
              }}
            />
            <MetricCard
              label="Past due"
              value={t.past_due}
              description="Subscription payment attention"
              icon={AlertTriangle}
              tone="text-amber-600"
              to="/admin/subscriptions"
              search={{ status: "past_due" }}
            />
            <MetricCard
              label="New merchant sales"
              value={t.conversions_30d}
              description="First paid conversions in 30 days"
              icon={TrendingUp}
              tone="text-emerald-600"
              to="/admin/sales"
            />
            <MetricCard
              label="Merchant payments"
              value={money(t.payment_volume_cents)}
              description={`${t.payments_this_month} successful payments this month`}
              icon={CreditCard}
              to="/admin/payments"
            />
            <MetricCard
              label="POS registers"
              value={t.registers}
              description={`${t.offline_registers} currently offline`}
              icon={Monitor}
              tone={t.offline_registers ? "text-amber-600" : "text-primary"}
              to="/admin/registers"
            />
            <MetricCard
              label="Open support cases"
              value={t.open_cases}
              description={`${t.urgent_cases} urgent cases`}
              icon={LifeBuoy}
              tone={t.urgent_cases ? "text-red-600" : "text-primary"}
              to="/admin/support"
              search={{
                status: "active",
                priority: "all",
                assignee: "any",
                q: "",
                sort: "updated_at",
                dir: "desc",
                page: 1,
              }}
            />
            <MetricCard
              label="Active live chats"
              value={t.active_chats}
              description="Remain visible until explicitly ended"
              icon={MessageSquare}
              to="/admin/communications"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>Cases requiring attention</CardTitle>
                  <CardDescription>Newest support work across every merchant.</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/admin/support">View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data.recent_cases ?? []).length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No support cases.
                  </div>
                ) : (
                  data.recent_cases.map((ticket: any) => (
                    <Link
                      key={ticket.id}
                      to="/admin/support/$ticketId"
                      params={{ ticketId: ticket.id }}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          #{ticket.ticket_number} · {ticket.subject}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ticket.store_name ?? "No business"} ·{" "}
                          {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {ticket.priority === "urgent" && (
                          <Badge variant="destructive">urgent</Badge>
                        )}
                        <Badge variant="outline">{ticket.status}</Badge>
                        {ticket.chat_status !== "ended" && <Badge>chat live</Badge>}
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>Latest merchant payments</CardTitle>
                  <CardDescription>Subscription money paid to SEZA.</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/admin/payments">View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data.recent_payments ?? []).length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No Stripe invoice payments recorded yet. New webhook payments will appear here.
                  </div>
                ) : (
                  data.recent_payments.map((payment: any) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {payment.store_name ?? "Unmatched Stripe customer"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(payment.occurred_at).toLocaleString()} · {payment.environment}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{money(payment.amount_paid_cents)}</div>
                        <Badge variant={payment.status === "paid" ? "default" : "outline"}>
                          {payment.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
