import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminListPlatformIncidents, adminTransitionSupportCase } from "@/lib/admin/company-admin.functions";
import { AlertTriangle, CreditCard, LifeBuoy, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminApp/admin/incidents")({
  head: () => ({ meta: [{ title: "Incidents — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: IncidentsPage,
});

function IncidentsPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["incidents.view", "diagnostics.view"]) ?? false;
  const canManage = perms?.hasAny(["incidents.manage", "support.manage"]) ?? false;
  const list = useServerFn(adminListPlatformIncidents);
  const transition = useServerFn(adminTransitionSupportCase);
  const qc = useQueryClient();
  const [days, setDays] = useState(7);
  const [resolveTarget, setResolveTarget] = useState<any | null>(null);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["admin_platform_incidents", days],
    queryFn: () => list({ data: { days } }),
    enabled: canView,
    refetchInterval: 60_000,
    retry: 1,
  });

  async function resolveIncident() {
    if (!resolveTarget) return;
    if (summary.trim().length < 5) return toast.error("Describe how the problem was fixed");
    setBusy(true);
    try {
      await transition({ data: { ticketId: resolveTarget.id, status: "resolved", resolutionSummary: summary.trim(), resolutionCode: "incident_resolved", reason: "Resolved from Incident Center" } });
      toast.success("Incident resolved");
      setResolveTarget(null); setSummary("");
      await qc.invalidateQueries({ queryKey: ["admin_platform_incidents"] });
      await qc.invalidateQueries({ queryKey: ["admin_support_case"] });
      await qc.invalidateQueries({ queryKey: ["admin_support_queue"] });
    } catch (error: any) { toast.error(error?.message ?? "Could not resolve incident"); }
    finally { setBusy(false); }
  }

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;
  const tickets = query.data?.tickets ?? [];
  const billing = query.data?.billing_alerts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Incident Center</h1><p className="text-sm text-muted-foreground">Resolve urgent merchant problems and review failed SEZA subscription payments.</p></div>
        <div className="flex gap-2">{[1, 7, 30].map((value) => <Button key={value} size="sm" variant={days === value ? "default" : "outline"} onClick={() => setDays(value)}>{value}d</Button>)}<Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh</Button></div>
      </div>

      {query.isLoading ? <Card><CardContent className="p-8 text-sm text-muted-foreground">Loading incidents…</CardContent></Card> : query.isError ? <Card className="border-destructive"><CardContent className="p-6"><div className="text-sm text-destructive">{(query.error as any)?.message ?? "Could not load incidents"}</div><Button className="mt-3" variant="outline" onClick={() => query.refetch()}>Retry</Button></CardContent></Card> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3"><Stat icon={AlertTriangle} label="Active incidents" value={tickets.length} /><Stat icon={LifeBuoy} label="Urgent support" value={tickets.filter((ticket: any) => ticket.priority === "urgent").length} /><Stat icon={CreditCard} label="Billing alerts" value={billing.length} /></div>

          <Card>
            <CardHeader><CardTitle>Urgent merchant incidents</CardTitle><CardDescription>These remain active until an admin records a resolution.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {tickets.length === 0 ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> No active urgent incidents.</div> : tickets.map((ticket: any) => (
                <div key={ticket.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0"><div className="font-semibold">#{ticket.ticket_number} · {ticket.subject}</div><div className="text-sm text-muted-foreground">{ticket.store?.name ?? "Unknown merchant"} · Updated {new Date(ticket.updated_at).toLocaleString()}</div>{ticket.description && <p className="mt-2 line-clamp-2 text-sm">{ticket.description}</p>}</div>
                    <div className="flex gap-1"><Badge variant={ticket.priority === "urgent" ? "destructive" : "default"}>{ticket.priority}</Badge><Badge variant="outline">{ticket.status}</Badge></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link to="/admin/support/$ticketId" params={{ ticketId: ticket.id }}>Open full case</Link></Button>{canManage && <Button size="sm" onClick={() => { setResolveTarget(ticket); setSummary(""); }}><CheckCircle2 className="mr-2 h-4 w-4" /> Resolve incident</Button>}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Merchant billing alerts</CardTitle><CardDescription>Failed subscription payments to SEZA. These are not customer checkout transactions.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {billing.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No failed merchant subscription payments in this window.</div> : billing.map((alert: any) => (
                <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><div className="font-medium">{alert.store?.name ?? "Unmatched Stripe customer"}</div><div className="text-xs text-muted-foreground">{alert.failure_message || alert.status} · {new Date(alert.occurred_at).toLocaleString()}</div></div><div className="flex items-center gap-2"><Badge variant="destructive">{alert.status}</Badge><Button asChild size="sm" variant="outline"><Link to="/admin/payments">Review payment</Link></Button></div></div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!resolveTarget} onOpenChange={(open) => !open && setResolveTarget(null)}>
        <DialogContent><DialogHeader><DialogTitle>Resolve incident</DialogTitle><DialogDescription>Record the actual fix. The case will move to Resolved and remain available in history.</DialogDescription></DialogHeader><Field label="Resolution summary"><Textarea rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What failed, what was changed, and how you verified the fix…" /></Field><DialogFooter><Button variant="outline" onClick={() => setResolveTarget(null)}>Cancel</Button><Button disabled={busy || summary.trim().length < 5} onClick={resolveIncident}>{busy ? "Resolving…" : "Resolve incident"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) { return <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4" /></div><div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div></CardContent></Card>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
