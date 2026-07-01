import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";
import { ShiftSummaryReport } from "@/components/reports/ShiftSummaryReport";
import { ArrowLeft, Loader2 } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/shifts")({
  validateSearch: (s: Record<string, unknown>) => ({ id: (s.id as string | undefined) ?? undefined }),
  component: ShiftsPage,
});

function ShiftsPage() {
  const { id } = useSearch({ from: "/_authenticated/shifts" });
  if (id) return <ShiftDetail id={id} />;
  return <ShiftsList />;
}

function ShiftsList() {
  const { data: me } = useMe();
  const storeId = me?.store?.id as string | undefined;

  const q = useQuery({
    queryKey: ["shifts", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data } = await sb.from("register_sessions")
        .select("*, profiles:opened_by(full_name, employee_id)")
        .eq("store_id", storeId)
        .order("opened_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader title="Shifts" subtitle="Register shift reports" />
      <div className="flex-1 overflow-y-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>All Shifts</CardTitle>
            <CardDescription>Open a shift to see the full end-of-shift report.</CardDescription>
          </CardHeader>
          <CardContent>
            {q.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</div>
            ) : q.data && q.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="py-2">Opened</th>
                      <th>Employee</th>
                      <th>Status</th>
                      <th className="text-right">Cash sales</th>
                      <th className="text-right">Variance</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.map((s: {
                      id: string; opened_at: string; status: string; cash_sales: number; variance: number | null;
                      profiles?: { full_name?: string; employee_id?: string } | null;
                    }) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2">{new Date(s.opened_at).toLocaleString()}</td>
                        <td>{s.profiles?.full_name ?? "—"} <span className="text-xs text-muted-foreground">{s.profiles?.employee_id}</span></td>
                        <td>
                          <Badge variant="outline" className={s.status === "open" ? "text-success border-success/30" : "text-muted-foreground"}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="text-right tabular-nums">${Number(s.cash_sales ?? 0).toFixed(2)}</td>
                        <td className={`text-right tabular-nums ${s.variance == null ? "" : s.variance === 0 ? "" : Math.abs(s.variance) > 5 ? "text-destructive" : "text-warning"}`}>
                          {s.variance != null ? `${s.variance > 0 ? "+" : ""}$${Number(s.variance).toFixed(2)}` : "—"}
                        </td>
                        <td className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link to="/shifts" search={{ id: s.id }}>View report</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No shifts yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ShiftDetail({ id }: { id: string }) {
  return (
    <>
      <PageHeader title="Shift Report" subtitle={`Session ${id.slice(0, 8).toUpperCase()}`} />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <Button asChild variant="ghost" size="sm" className="print:hidden">
          <Link to="/shifts"><ArrowLeft className="size-4 mr-2" /> Back to shifts</Link>
        </Button>
        <ShiftSummaryReport sessionId={id} />
      </div>
    </>
  );
}
