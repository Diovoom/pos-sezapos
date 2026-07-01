import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtCurrency } from "@/lib/format";
import { ArrowLeft, Clock, DollarSign, RotateCcw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/employees/$id")({
  component: EmployeeProfile,
});

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  employee_id: string | null;
  status: string;
  hire_date: string | null;
  photo_url: string | null;
  created_at: string;
};

function EmployeeProfile() {
  const { id } = Route.useParams();

  const { data: profile } = useQuery<Profile | null>({
    queryKey: ["employee", id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      return (data as unknown as Profile) ?? null;
    },
  });

  const { data: roles } = useQuery<string[]>({
    queryKey: ["employee-roles", id],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", id);
      return (data ?? []).map((r) => r.role as string);
    },
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ["employee-time", id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("time_entries")
        .select("*")
        .eq("user_id", id)
        .order("clock_in", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["employee-sales", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id,total,created_at,status,receipt_number")
        .eq("cashier_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const { data: refunds = [] } = useQuery({
    queryKey: ["employee-refunds", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("refunds")
        .select("id,total,created_at,reason")
        .eq("cashier_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const salesTotal = sales.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const refundsTotal = refunds.reduce((s, r) => s + Number(r.total ?? 0), 0);

  if (!profile) {
    return (
      <>
        <PageHeader title="Employee" />
        <div className="p-6"><Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card></div>
      </>
    );
  }

  const displayName = profile.full_name || `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email || "—";

  return (
    <>
      <PageHeader
        title={displayName}
        subtitle={`Employee · ${profile.employee_id ?? "—"}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/employees"><ArrowLeft className="size-4 mr-2" />All employees</Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardContent className="p-6 text-center space-y-3">
              <div className="size-24 rounded-full bg-muted grid place-items-center text-3xl font-bold mx-auto">
                {profile.photo_url ? (
                  <img src={profile.photo_url} alt="" className="size-24 rounded-full object-cover" />
                ) : (
                  (profile.first_name?.[0] ?? profile.email?.[0] ?? "?").toUpperCase()
                )}
              </div>
              <div>
                <div className="font-semibold">{displayName}</div>
                <div className="text-xs text-muted-foreground font-mono">ID {profile.employee_id}</div>
              </div>
              <div className="flex justify-center gap-2 flex-wrap">
                <Badge variant={profile.status === "active" ? "default" : "secondary"}>{profile.status}</Badge>
                {roles?.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
              </div>
              <dl className="text-left text-xs space-y-1 pt-3 border-t">
                <Row label="Email" value={profile.email ?? "—"} />
                <Row label="Phone" value={profile.phone ?? "—"} />
                <Row label="Hire date" value={profile.hire_date ?? "—"} />
                <Row label="Joined" value={format(new Date(profile.created_at), "MMM d, yyyy")} />
              </dl>
            </CardContent>
          </Card>

          <div className="md:col-span-2 grid grid-cols-3 gap-3">
            <Stat icon={DollarSign} label="Sales (recent)" value={fmtCurrency(salesTotal, "USD")} sub={`${sales.length} sales`} />
            <Stat icon={RotateCcw} label="Refunds issued" value={fmtCurrency(refundsTotal, "USD")} sub={`${refunds.length} refunds`} />
            <Stat icon={Clock} label="Time entries" value={String(timeEntries.length)} sub="last 30" />

            <Card className="col-span-3">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Recent time entries</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="text-xs">
                  {timeEntries.length === 0 && <div className="p-6 text-center text-muted-foreground">No clock-ins yet.</div>}
                  {timeEntries.slice(0, 10).map((e: { id: string; clock_in: string; clock_out: string | null; break_minutes: number }) => {
                    const inD = new Date(e.clock_in);
                    const outD = e.clock_out ? new Date(e.clock_out) : null;
                    const mins = outD ? Math.max(0, Math.round((outD.getTime() - inD.getTime()) / 60000) - (e.break_minutes ?? 0)) : null;
                    return (
                      <div key={e.id} className="flex items-center justify-between px-4 py-2 border-b last:border-b-0">
                        <div>
                          <div className="font-medium">{format(inD, "MMM d, yyyy")}</div>
                          <div className="text-muted-foreground">
                            {format(inD, "p")} – {outD ? format(outD, "p") : <span className="text-primary">Clocked in</span>}
                          </div>
                        </div>
                        <div className="font-mono">{mins != null ? `${(mins / 60).toFixed(2)} h` : "—"}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <PayScheduleCard userId={profile.id} />
          </div>
        </div>
      </div>
    </>
  );
}

function PayScheduleCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["employee-pay", userId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from as any)("profiles")
        .select("hourly_wage, scheduled_start_time, scheduled_end_time, late_threshold_minutes")
        .eq("id", userId).maybeSingle();
      return data as {
        hourly_wage: number | null; scheduled_start_time: string | null;
        scheduled_end_time: string | null; late_threshold_minutes: number | null;
      } | null;
    },
  });
  const [wage, setWage] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [threshold, setThreshold] = useState("5");
  useEffect(() => {
    if (!data) return;
    setWage(data.hourly_wage != null ? String(data.hourly_wage) : "");
    setStart(data.scheduled_start_time ?? "");
    setEnd(data.scheduled_end_time ?? "");
    setThreshold(String(data.late_threshold_minutes ?? 5));
  }, [data]);
  const save = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)("profiles").update({
        hourly_wage: wage === "" ? null : Number(wage),
        scheduled_start_time: start || null,
        scheduled_end_time: end || null,
        late_threshold_minutes: Number(threshold) || 5,
      }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pay & schedule saved");
      qc.invalidateQueries({ queryKey: ["employee-pay", userId] });
      qc.invalidateQueries({ queryKey: ["payroll-profiles"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  return (
    <Card className="col-span-3">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Pay & schedule</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div className="space-y-1"><Label>Hourly wage</Label>
          <Input type="number" step="0.01" min="0" value={wage} onChange={(e) => setWage(e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1"><Label>Scheduled start</Label>
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1"><Label>Scheduled end</Label>
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="space-y-1"><Label>Late grace (min)</Label>
          <Input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
        <div className="col-span-2 md:col-span-4">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono">{value}</dd></div>;
}

function Stat({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="text-2xl font-bold mt-1 font-mono">{value}</div>
        <div className="text-[10px] text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
