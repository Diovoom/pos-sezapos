import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtCurrency } from "@/lib/format";
import { format, startOfWeek, endOfWeek } from "date-fns";

export const Route = createFileRoute("/_dashboard/payroll")({
  head: () => ({ meta: [{ title: "Payroll — SEZA POS" }, { name: "description", content: "Hours worked and estimated pay per employee for the current pay period." }] }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    const roles = (data ?? []).map((r) => r.role as string);
    if (!roles.some((r) => ["owner", "admin", "manager"].includes(r))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: PayrollPage,
});

type Profile = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  employee_id: string | null;
  hourly_wage: number | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
};

type Entry = {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  late: boolean;
  late_minutes: number;
};

function PayrollPage() {
  const today = new Date();
  const [from, setFrom] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ["payroll-profiles"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from as any)("profiles")
        .select("id, full_name, first_name, last_name, email, employee_id, hourly_wage, scheduled_start_time, scheduled_end_time")
        .eq("status", "active");
      return (data ?? []) as Profile[];
    },
  });

  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () => (await supabase.from("stores").select("*").limit(1).maybeSingle()).data,
  });
  const currency = (store as { currency?: string } | null)?.currency ?? "USD";

  const { data: entries = [] } = useQuery<Entry[]>({
    queryKey: ["payroll-entries", from, to],
    queryFn: async () => {
      const fromIso = new Date(`${from}T00:00:00`).toISOString();
      const toIso = new Date(`${to}T23:59:59.999`).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from as any)("time_entries")
        .select("id, user_id, clock_in, clock_out, break_minutes, late, late_minutes")
        .gte("clock_in", fromIso)
        .lte("clock_in", toIso)
        .order("clock_in", { ascending: false });
      return (data ?? []) as Entry[];
    },
  });

  const rows = useMemo(() => {
    const byUser = new Map<string, { hours: number; breakMins: number; lateCount: number; lateMins: number; shifts: number }>();
    for (const e of entries) {
      const inMs = new Date(e.clock_in).getTime();
      const outMs = e.clock_out ? new Date(e.clock_out).getTime() : Date.now();
      const worked = Math.max(0, (outMs - inMs) / 60000 - (e.break_minutes ?? 0));
      const cur = byUser.get(e.user_id) ?? { hours: 0, breakMins: 0, lateCount: 0, lateMins: 0, shifts: 0 };
      cur.hours += worked / 60;
      cur.breakMins += e.break_minutes ?? 0;
      cur.lateCount += e.late ? 1 : 0;
      cur.lateMins += e.late_minutes ?? 0;
      cur.shifts += 1;
      byUser.set(e.user_id, cur);
    }
    return profiles.map((p) => {
      const t = byUser.get(p.id) ?? { hours: 0, breakMins: 0, lateCount: 0, lateMins: 0, shifts: 0 };
      const wage = Number(p.hourly_wage ?? 0);
      const pay = Math.round(t.hours * wage * 100) / 100;
      const name = p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email;
      return { ...p, ...t, wage, pay, name };
    });
  }, [profiles, entries]);

  const totals = rows.reduce(
    (a, r) => ({ hours: a.hours + r.hours, pay: a.pay + r.pay, late: a.late + r.lateCount }),
    { hours: 0, pay: 0, late: 0 },
  );

  return (
    <>
      <PageHeader title="Payroll" subtitle="Hours worked and estimated pay per employee." />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Pay period</CardTitle>
            <CardDescription>Hours × hourly wage. Breaks are subtracted automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-left sm:text-right">
              <Stat label="Total hours" value={`${totals.hours.toFixed(2)} h`} />
              <Stat label="Late shifts" value={String(totals.late)} />
              <Stat label="Total pay" value={fmtCurrency(totals.pay, currency)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {/* Mobile: cards */}
            <ul className="md:hidden divide-y">
              {rows.length === 0 && (
                <li className="p-6 text-center text-muted-foreground text-sm">No employees.</li>
              )}
              {rows.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">ID {r.employee_id ?? "—"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-mono font-bold">{fmtCurrency(r.pay, currency)}</div>
                      <div className="text-[10px] text-muted-foreground">{r.hours.toFixed(2)} h</div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div className="text-muted-foreground">Shifts</div><div className="text-right font-mono">{r.shifts}</div>
                    <div className="text-muted-foreground">Breaks</div><div className="text-right font-mono">{r.breakMins}m</div>
                    <div className="text-muted-foreground">Wage</div>
                    <div className="text-right font-mono">
                      {r.hourly_wage == null ? (
                        <span className="text-warning">Not set</span>
                      ) : (
                        `${fmtCurrency(r.wage, currency)}/h`
                      )}
                    </div>
                    <div className="text-muted-foreground">Late</div>
                    <div className="text-right">
                      {r.lateCount > 0
                        ? <span className="text-warning">{r.lateCount} · {r.lateMins}m</span>
                        : <span className="text-muted-foreground">On time</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead className="text-right">Shifts</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Breaks</TableHead>
                    <TableHead className="text-right">Late</TableHead>
                    <TableHead className="text-right">Wage</TableHead>
                    <TableHead className="text-right">Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No employees.</TableCell></TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.employee_id ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{r.shifts}</TableCell>
                      <TableCell className="text-right font-mono">{r.hours.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{r.breakMins}m</TableCell>
                      <TableCell className="text-right">
                        {r.lateCount > 0 ? (
                          <Badge variant="outline" className="border-warning text-warning">
                            {r.lateCount} · {r.lateMins}m
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">On time</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.hourly_wage == null
                          ? <span className="text-warning text-xs">Not set</span>
                          : `${fmtCurrency(r.wage, currency)}/h`}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">{fmtCurrency(r.pay, currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base sm:text-lg font-mono font-bold truncate">{value}</div>
    </div>
  );
}
