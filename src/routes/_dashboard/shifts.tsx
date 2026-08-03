import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useMe } from "@/hooks/useMe";
import { ShiftSummaryReport } from "@/components/reports/ShiftSummaryReport";
import { ArrowLeft, Loader2, Download } from "lucide-react";
import { format } from "date-fns";
import { fmtCurrency } from "@/lib/format";

const sb = supabase as any;

export const Route = createFileRoute("/_dashboard/shifts")({
  head: () => ({
    meta: [
      { title: "Shifts  -  SEZA POS" },
      {
        name: "description",
        content: "Employee shifts from clock-in to clock-out, with register session reports.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    id: (s.id as string | undefined) ?? undefined,
    session: (s.session as string | undefined) ?? undefined,
  }),
  component: ShiftsPage,
});

export function ShiftsPage() {
  // `strict: false` so this component works inside both the dashboard route
  // tree (`/_dashboard/shifts`) and the bundled Capacitor shell router
  // (`/shifts`). A hardcoded `from` throws "Invariant failed" when the route
  // ID does not exist in the active router.
  const search = useSearch({ strict: false }) as { id?: string; session?: string };
  if (search.session) return <SessionDetail id={search.session} />;
  if (search.id) return <ShiftDetail id={search.id} />;
  return <ShiftsList />;
}

type TimeEntry = {
  id: string;
  user_id: string;
  store_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  late: boolean;
  late_minutes: number;
  profiles?: {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    employee_id: string | null;
    email: string | null;
  } | null;
};

type Sale = {
  id: string;
  cashier_id: string | null;
  created_at: string;
  total: number;
  status: string;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function ShiftsList() {
  const me = useMe();
  const canSeeAll = me.data?.roles.some((r) => r === "owner" || r === "manager" || r === "admin");
  const myId = me.data?.user.id;
  const storeId = (me.data?.profile?.store_id ?? me.data?.store?.id) as string | undefined;

  const [range, setRange] = useState<"today" | "week" | "month" | "year" | "custom">("week");
  const [from, setFrom] = useState(daysAgoStr(7));
  const [to, setTo] = useState(todayStr());
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "open" | "closed">("all");

  const dateFrom =
    range === "today"
      ? todayStr()
      : range === "week"
        ? daysAgoStr(7)
        : range === "month"
          ? daysAgoStr(30)
          : range === "year"
            ? daysAgoStr(365)
            : from;
  const dateTo = range === "custom" ? to : todayStr();
  // Convert the user-facing yyyy-MM-dd range to an inclusive UTC window
  // based on the local business day, so a shift that clocked in at 11pm
  // local still shows up on the correct day.
  const fromIso = useMemo(() => new Date(`${dateFrom}T00:00:00`).toISOString(), [dateFrom]);
  const toIso = useMemo(() => {
    const d = new Date(`${dateTo}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }, [dateTo]);

  const employeesQ = useQuery({
    enabled: !!canSeeAll,
    queryKey: ["shift-employees"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name, employee_id, email")
        .order("full_name");
      return data ?? [];
    },
  });

  const shiftsQ = useQuery<TimeEntry[]>({
    queryKey: ["shifts-list", storeId, fromIso, toIso, employeeId, status, canSeeAll, myId],
    enabled: !!myId && !!storeId,
    queryFn: async () => {
      // time_entries.user_id does not have a database FK to profiles, so a
      // PostgREST embedded join silently fails. Load entries and employees
      // separately and join them in memory instead.
      let q = sb
        .from("time_entries")
        .select("id,user_id,store_id,clock_in,clock_out,break_minutes,late,late_minutes")
        .eq("store_id", storeId)
        .gte("clock_in", fromIso)
        .lt("clock_in", toIso)
        .order("clock_in", { ascending: false })
        .limit(500);
      if (!canSeeAll) q = q.eq("user_id", myId);
      else if (employeeId !== "all") q = q.eq("user_id", employeeId);
      if (status === "open") q = q.is("clock_out", null);
      if (status === "closed") q = q.not("clock_out", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      const entries = (data ?? []) as Omit<TimeEntry, "profiles">[];
      const ids = Array.from(new Set(entries.map((entry) => entry.user_id)));
      if (ids.length === 0) return [];
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id,full_name,first_name,last_name,employee_id,email")
        .in("id", ids);
      if (profileError) throw profileError;
      const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return entries.map((entry) => ({
        ...entry,
        profiles: byId.get(entry.user_id) ?? null,
      })) as TimeEntry[];
    },
  });

  const salesQ = useQuery<Sale[]>({
    queryKey: ["shifts-sales", fromIso, toIso],
    enabled: !!shiftsQ.data && shiftsQ.data.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, cashier_id, created_at, total, status")
        .gte("created_at", fromIso)
        .lt("created_at", toIso)
        .limit(5000);
      return (data as Sale[]) ?? [];
    },
  });

  const rows = useMemo(() => {
    const sales = salesQ.data ?? [];
    return (shiftsQ.data ?? []).map((s) => {
      const inMs = new Date(s.clock_in).getTime();
      const outMs = s.clock_out ? new Date(s.clock_out).getTime() : Date.now();
      const totalMin = Math.max(0, Math.round((outMs - inMs) / 60000));
      const workedMin = Math.max(0, totalMin - (s.break_minutes ?? 0));
      const overtimeMin = Math.max(0, workedMin - 8 * 60);
      const shiftSales = sales.filter(
        (x) =>
          x.cashier_id === s.user_id &&
          x.status !== "voided" &&
          new Date(x.created_at).getTime() >= inMs &&
          new Date(x.created_at).getTime() <= outMs,
      );
      const salesTotal = shiftSales.reduce((a, b) => a + Number(b.total ?? 0), 0);
      return { ...s, totalMin, workedMin, overtimeMin, txCount: shiftSales.length, salesTotal };
    });
  }, [shiftsQ.data, salesQ.data]);

  const totals = rows.reduce(
    (acc, r) => ({
      hours: acc.hours + r.workedMin / 60,
      ot: acc.ot + r.overtimeMin / 60,
      sales: acc.sales + r.salesTotal,
      tx: acc.tx + r.txCount,
    }),
    { hours: 0, ot: 0, sales: 0, tx: 0 },
  );

  const exportCsv = () => {
    const header = [
      "Shift ID",
      "Employee ID",
      "Employee",
      "Date",
      "Clock In",
      "Clock Out",
      "Break (min)",
      "Hours",
      "Overtime",
      "Status",
      "Sales",
      "Transactions",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const name =
        r.profiles?.full_name ||
        `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim();
      lines.push(
        [
          r.id.slice(0, 8),
          r.profiles?.employee_id ?? "",
          `"${name.replace(/"/g, '""')}"`,
          format(new Date(r.clock_in), "yyyy-MM-dd"),
          format(new Date(r.clock_in), "HH:mm"),
          r.clock_out ? format(new Date(r.clock_out), "HH:mm") : "",
          r.break_minutes ?? 0,
          (r.workedMin / 60).toFixed(2),
          (r.overtimeMin / 60).toFixed(2),
          r.clock_out ? "closed" : "open",
          r.salesTotal.toFixed(2),
          r.txCount,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shifts_${dateFrom}_${dateTo}.csv`;
    a.click();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Shift History"
        subtitle="Employee shifts from clock-in to clock-out."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="size-4 mr-2" />
            Export CSV
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 space-y-4 md:p-6 md:pb-10">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Range</Label>
                <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 days</SelectItem>
                    <SelectItem value="month">Last 30 days</SelectItem>
                    <SelectItem value="year">This year</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {range === "custom" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">From</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">To</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                </>
              )}
              {canSeeAll && (
                <div className="space-y-1">
                  <Label className="text-xs">Employee</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All employees</SelectItem>
                      {(employeesQ.data ?? []).map(
                        (p: { id: string; full_name: string | null; email: string | null }) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name || p.email || p.id.slice(0, 8)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="open">On the clock</SelectItem>
                    <SelectItem value="closed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Shifts" value={String(rows.length)} />
          <Metric label="Hours" value={totals.hours.toFixed(2)} />
          <Metric label="Overtime" value={totals.ot.toFixed(2)} />
          <Metric label="Sales" value={fmtCurrency(totals.sales, "USD")} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Shifts</CardTitle>
            <CardDescription>
              {rows.length} record{rows.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {shiftsQ.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : shiftsQ.isError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Could not load shift history:{" "}
                {shiftsQ.error instanceof Error ? shiftsQ.error.message : "Unknown error"}
              </div>
            ) : rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="py-2">Date</th>
                      <th>Employee</th>
                      <th>Clock In</th>
                      <th>Clock Out</th>
                      <th className="text-right">Break</th>
                      <th className="text-right">Hours</th>
                      <th className="text-right">Overtime</th>
                      <th className="text-right">Sales</th>
                      <th className="text-right">Tx</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const inD = new Date(r.clock_in);
                      const outD = r.clock_out ? new Date(r.clock_out) : null;
                      const name =
                        r.profiles?.full_name ||
                        `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() ||
                        r.profiles?.email;
                      return (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-2">{format(inD, "MMM d, yyyy")}</td>
                          <td>
                            {r.profiles ? (
                              <Link
                                to="/employees/$id"
                                params={{ id: r.user_id }}
                                className="hover:underline"
                              >
                                {name}{" "}
                                <span className="text-xs text-muted-foreground font-mono">
                                  {r.profiles.employee_id}
                                </span>
                              </Link>
                            ) : (
                              name
                            )}
                            {r.late && (
                              <Badge variant="outline" className="ml-2 border-warning text-warning">
                                Late {r.late_minutes}m
                              </Badge>
                            )}
                          </td>
                          <td>{format(inD, "p")}</td>
                          <td>
                            {outD ? format(outD, "p") : <span className="text-primary"> - </span>}
                          </td>
                          <td className="text-right tabular-nums">{r.break_minutes ?? 0}m</td>
                          <td className="text-right tabular-nums font-medium">
                            {(r.workedMin / 60).toFixed(2)}
                          </td>
                          <td
                            className={`text-right tabular-nums ${r.overtimeMin > 0 ? "text-warning" : ""}`}
                          >
                            {(r.overtimeMin / 60).toFixed(2)}
                          </td>
                          <td className="text-right tabular-nums">
                            {fmtCurrency(r.salesTotal, "USD")}
                          </td>
                          <td className="text-right tabular-nums">{r.txCount}</td>
                          <td>
                            {outD ? (
                              <Badge variant="outline">Closed</Badge>
                            ) : (
                              <Badge className="bg-success text-success-foreground">Open</Badge>
                            )}
                          </td>
                          <td className="text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link to="/shifts" search={{ id: r.id }}>
                                Details
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No shifts in this range.</p>
            )}
          </CardContent>
        </Card>

        <RegisterSessionsCard dateFrom={dateFrom} dateTo={dateTo} />
      </div>
    </div>
  );
}

type RegisterSession = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string | null;
  closed_by: string | null;
  status: string;
  opening_cash: number;
  cash_sales: number | null;
  expected_cash: number | null;
  closing_cash: number | null;
  variance: number | null;
};

function RegisterSessionsCard({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data = [], isLoading } = useQuery<RegisterSession[]>({
    queryKey: ["register-sessions-history", dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await sb
        .from("register_sessions")
        .select(
          "id, opened_at, closed_at, opened_by, closed_by, status, opening_cash, cash_sales, expected_cash, closing_cash, variance",
        )
        .gte("opened_at", `${dateFrom}T00:00:00Z`)
        .lte("opened_at", `${dateTo}T23:59:59Z`)
        .order("opened_at", { ascending: false })
        .limit(200);
      return (data ?? []) as RegisterSession[];
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Register sessions</CardTitle>
        <CardDescription>Closed and open cash register sessions in this range.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No register sessions in this range.</p>
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
                {data.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2">{format(new Date(s.opened_at), "MMM d, p")}</td>
                    <td>{s.closed_at ? format(new Date(s.closed_at), "MMM d, p") : " - "}</td>
                    <td className="text-right tabular-nums">
                      {fmtCurrency(Number(s.opening_cash ?? 0), "USD")}
                    </td>
                    <td className="text-right tabular-nums">
                      {fmtCurrency(Number(s.cash_sales ?? 0), "USD")}
                    </td>
                    <td className="text-right tabular-nums">
                      {s.expected_cash != null
                        ? fmtCurrency(Number(s.expected_cash), "USD")
                        : " - "}
                    </td>
                    <td className="text-right tabular-nums">
                      {s.closing_cash != null ? fmtCurrency(Number(s.closing_cash), "USD") : " - "}
                    </td>
                    <td
                      className={`text-right tabular-nums ${s.variance == null || s.variance === 0 ? "" : s.variance > 0 ? "text-success" : "text-destructive"}`}
                    >
                      {s.variance != null
                        ? `${s.variance > 0 ? "+" : ""}${fmtCurrency(Number(s.variance), "USD")}`
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

function ShiftDetail({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["shift-detail", id],
    queryFn: async () => {
      const { data: entry, error } = await sb
        .from("time_entries")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!entry) return null;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, first_name, last_name, employee_id, email, phone, photo_url, hire_date")
        .eq("id", entry.user_id)
        .maybeSingle();
      if (profileError) throw profileError;
      return { ...entry, profiles: profile ?? null };
    },
  });
  const entry = q.data as
    | (TimeEntry & {
        profiles: NonNullable<TimeEntry["profiles"]> & {
          phone: string | null;
          photo_url: string | null;
          hire_date: string | null;
        };
      })
    | undefined;

  const salesQ = useQuery<Sale[]>({
    enabled: !!entry,
    queryKey: ["shift-detail-sales", id],
    queryFn: async () => {
      const inMs = new Date(entry!.clock_in).toISOString();
      const outMs = (entry!.clock_out ? new Date(entry!.clock_out) : new Date()).toISOString();
      const { data } = await supabase
        .from("sales")
        .select("id, cashier_id, created_at, total, status, receipt_number")
        .eq("cashier_id", entry!.user_id)
        .gte("created_at", inMs)
        .lte("created_at", outMs)
        .order("created_at", { ascending: false });
      return (data as Sale[]) ?? [];
    },
  });

  if (q.isLoading || !entry) {
    return (
      <>
        <PageHeader title="Shift" />
        <div className="p-6">
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const inD = new Date(entry.clock_in);
  const outD = entry.clock_out ? new Date(entry.clock_out) : null;
  const totalMin = Math.max(
    0,
    Math.round(((outD?.getTime() ?? Date.now()) - inD.getTime()) / 60000),
  );
  const workedMin = Math.max(0, totalMin - (entry.break_minutes ?? 0));
  const overtimeMin = Math.max(0, workedMin - 8 * 60);
  const sales = salesQ.data ?? [];
  const salesTotal = sales.reduce((a, b) => a + Number(b.total ?? 0), 0);
  const name =
    entry.profiles?.full_name ||
    `${entry.profiles?.first_name ?? ""} ${entry.profiles?.last_name ?? ""}`.trim() ||
    entry.profiles?.email;

  return (
    <>
      <PageHeader title="Shift Report" subtitle={`Shift ${id.slice(0, 8).toUpperCase()}`} />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <Button asChild variant="ghost" size="sm" className="print:hidden">
          <Link to="/shifts">
            <ArrowLeft className="size-4 mr-2" /> Back to shifts
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>{name}</CardTitle>
            <CardDescription>
              Employee ID {entry.profiles?.employee_id} · {format(inD, "EEEE, MMMM d, yyyy")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KV k="Clock In" v={format(inD, "p")} />
            <KV k="Clock Out" v={outD ? format(outD, "p") : " - "} />
            <KV k="Break" v={`${entry.break_minutes ?? 0} min`} />
            <KV k="Total Duration" v={`${(totalMin / 60).toFixed(2)} h`} />
            <KV k="Hours Worked" v={`${(workedMin / 60).toFixed(2)} h`} />
            <KV k="Overtime" v={`${(overtimeMin / 60).toFixed(2)} h`} />
            <KV k="Status" v={outD ? "Closed" : "Open"} />
            <KV k="Late" v={entry.late ? `Yes (${entry.late_minutes}m)` : "No"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales during shift</CardTitle>
            <CardDescription>
              {sales.length} transactions · {fmtCurrency(salesTotal, "USD")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales in this shift.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Receipt</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 font-mono">
                        #{(s as { receipt_number?: number }).receipt_number ?? s.id.slice(0, 6)}
                      </td>
                      <td>{format(new Date(s.created_at), "p")}</td>
                      <td>
                        <Badge variant="outline">{s.status}</Badge>
                      </td>
                      <td className="text-right tabular-nums">
                        {fmtCurrency(Number(s.total), "USD")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="text-lg font-mono font-semibold">{v}</div>
    </div>
  );
}

function SessionDetail({ id }: { id: string }) {
  return (
    <>
      <PageHeader
        title="Register Session Report"
        subtitle={`Session ${id.slice(0, 8).toUpperCase()}`}
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <Button asChild variant="ghost" size="sm" className="print:hidden">
          <Link to="/shifts">
            <ArrowLeft className="size-4 mr-2" /> Back to shifts
          </Link>
        </Button>
        <ShiftSummaryReport sessionId={id} />
      </div>
    </>
  );
}
