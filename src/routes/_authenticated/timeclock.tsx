import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LogIn, LogOut, Coffee, PlayCircle, Loader2 } from "lucide-react";
import { format, formatDistanceStrict } from "date-fns";

export const Route = createFileRoute("/_authenticated/timeclock")({
  component: TimeclockPage,
});

type TimeEntry = {
  id: string;
  user_id: string;
  store_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_start: string | null;
  break_minutes: number;
  notes: string | null;
  late?: boolean;
  late_minutes?: number;
};

function TimeclockPage() {
  const qc = useQueryClient();
  const me = useMe();
  const canManage = me.data?.roles.some((r) => r === "owner" || r === "manager");

  const { data: open } = useQuery<TimeEntry | null>({
    queryKey: ["myOpenEntry", me.data?.user.id],
    enabled: !!me.data?.user.id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("time_entries")
        .select("*")
        .eq("user_id", me.data!.user.id)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as TimeEntry | null) ?? null;
    },
  });

  const { data: history = [] } = useQuery<TimeEntry[]>({
    queryKey: ["myTimeHistory", me.data?.user.id],
    enabled: !!me.data?.user.id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("time_entries")
        .select("*")
        .eq("user_id", me.data!.user.id)
        .order("clock_in", { ascending: false })
        .limit(20);
      return (data as TimeEntry[]) ?? [];
    },
  });

  const { data: whosIn = [] } = useQuery({
    enabled: !!canManage,
    queryKey: ["whosIn"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("time_entries")
        .select("id, user_id, clock_in, break_start")
        .is("clock_out", null);
      const rows = (data as { id: string; user_id: string; clock_in: string; break_start: string | null }[]) ?? [];
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name, employee_id, email")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id as string, p]));
      return rows.map((r) => ({ ...r, profile: map.get(r.user_id) }));
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["myOpenEntry"] });
    qc.invalidateQueries({ queryKey: ["myTimeHistory"] });
    qc.invalidateQueries({ queryKey: ["whosIn"] });
  };

  const clockIn = useMutation({
    mutationFn: async () => {
      if (!me.data?.user.id) throw new Error("Not signed in");
      if (me.data?.profile?.status === "disabled") throw new Error("Account is disabled");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("time_entries").insert({
        user_id: me.data.user.id,
        store_id: me.data.profile?.store_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Clocked in"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (!open) throw new Error("Not clocked in");
      // If a break was still open, close it now.
      let extraBreak = 0;
      if (open.break_start) {
        extraBreak = Math.max(0, Math.round((Date.now() - new Date(open.break_start).getTime()) / 60000));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("time_entries")
        .update({
          clock_out: new Date().toISOString(),
          break_start: null,
          break_minutes: (open.break_minutes ?? 0) + extraBreak,
        })
        .eq("id", open.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Clocked out"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const startBreak = useMutation({
    mutationFn: async () => {
      if (!open) throw new Error("Not clocked in");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("time_entries")
        .update({ break_start: new Date().toISOString() })
        .eq("id", open.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Break started"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const endBreak = useMutation({
    mutationFn: async () => {
      if (!open || !open.break_start) throw new Error("Not on break");
      const mins = Math.max(0, Math.round((Date.now() - new Date(open.break_start).getTime()) / 60000));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("time_entries")
        .update({ break_start: null, break_minutes: (open.break_minutes ?? 0) + mins })
        .eq("id", open.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Break ended"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const anyBusy = clockIn.isPending || clockOut.isPending || startBreak.isPending || endBreak.isPending;

  const totals = computeTotals(history);

  return (
    <>
      <PageHeader title="Time Clock" subtitle="Clock in, take breaks, clock out." />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Your status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              {!open && <Badge variant="secondary">Clocked out</Badge>}
              {open && !open.break_start && <Badge className="bg-success text-success-foreground">On the clock</Badge>}
              {open?.break_start && <Badge variant="outline" className="border-warning text-warning">On break</Badge>}
              {open && (
                <span className="text-sm text-muted-foreground">
                  Since {format(new Date(open.clock_in), "p")} · {formatDistanceStrict(new Date(open.clock_in), new Date())}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => clockIn.mutate()} disabled={!!open || anyBusy}>
                <LogIn className="size-4 mr-2" /> Clock in
              </Button>
              <Button size="lg" variant="outline" onClick={() => clockOut.mutate()} disabled={!open || anyBusy}>
                <LogOut className="size-4 mr-2" /> Clock out
              </Button>
              <Button size="lg" variant="outline" onClick={() => startBreak.mutate()} disabled={!open || !!open.break_start || anyBusy}>
                <Coffee className="size-4 mr-2" /> Start break
              </Button>
              <Button size="lg" variant="outline" onClick={() => endBreak.mutate()} disabled={!open?.break_start || anyBusy}>
                <PlayCircle className="size-4 mr-2" /> End break
              </Button>
              {anyBusy && <Loader2 className="size-5 animate-spin text-muted-foreground self-center" />}
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-3 gap-3">
          <Metric label="Today" value={`${totals.today.toFixed(2)} h`} />
          <Metric label="This week" value={`${totals.week.toFixed(2)} h`} />
          <Metric label="This month" value={`${totals.month.toFixed(2)} h`} />
        </div>

        {canManage && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Who's on the clock</CardTitle>
              <CardDescription>Live view for managers and owners.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {whosIn.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No one is currently clocked in.</div>
              ) : (
                whosIn.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b last:border-b-0">
                    <div>
                      <div className="font-semibold text-sm">
                        {r.profile?.full_name || `${r.profile?.first_name ?? ""} ${r.profile?.last_name ?? ""}`.trim() || r.profile?.email}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">ID {r.profile?.employee_id}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div>{r.break_start ? <Badge variant="outline">On break</Badge> : <Badge>Active</Badge>}</div>
                      <div className="text-muted-foreground mt-1">In at {format(new Date(r.clock_in), "p")}</div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recent entries</CardTitle></CardHeader>
          <CardContent className="p-0">
            {history.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No time entries yet.</div>}
            {history.map((e) => {
              const inD = new Date(e.clock_in);
              const outD = e.clock_out ? new Date(e.clock_out) : null;
              const mins = outD ? Math.max(0, Math.round((outD.getTime() - inD.getTime()) / 60000) - (e.break_minutes ?? 0)) : null;
              return (
                <div key={e.id} className="flex items-center justify-between px-4 py-2 border-b last:border-b-0 text-xs">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {format(inD, "EEE, MMM d")}
                      {e.late && (
                        <Badge variant="outline" className="border-warning text-warning">
                          Late {e.late_minutes ?? 0}m
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground">{format(inD, "p")} – {outD ? format(outD, "p") : "…"}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono">{mins != null ? `${(mins / 60).toFixed(2)} h` : "—"}</div>
                    {(e.break_minutes ?? 0) > 0 && <div className="text-muted-foreground">Break {e.break_minutes}m</div>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
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

function computeTotals(entries: TimeEntry[]) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = now.getDay(); // 0..6, treat Sunday as start
  const startOfWeek = startOfDay - day * 86400000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const sum = (fromMs: number) =>
    entries.reduce((acc, e) => {
      const inMs = new Date(e.clock_in).getTime();
      const outMs = e.clock_out ? new Date(e.clock_out).getTime() : Date.now();
      if (outMs < fromMs) return acc;
      const startMs = Math.max(inMs, fromMs);
      const mins = Math.max(0, Math.round((outMs - startMs) / 60000) - (e.break_minutes ?? 0));
      return acc + mins / 60;
    }, 0);

  return { today: sum(startOfDay), week: sum(startOfWeek), month: sum(startOfMonth) };
}
