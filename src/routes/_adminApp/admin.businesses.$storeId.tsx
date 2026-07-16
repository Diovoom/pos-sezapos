import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetBusinessWorkspace,
  adminSuspendBusiness,
  adminUnsuspendBusiness,
  adminExtendTrial,
  adminEndTrial,
  adminSendPasswordReset,
  adminResendVerification,
  adminRevokeSessions,
  adminSetEmployeeStatus,
  adminResetEmployeePin,
  adminChangeEmployeeRole,
  adminRenameTerminal,
  adminSetTerminalStatus,
  adminRevokeTerminal,
  adminRefreshSubscription,
  adminCancelSubscription,
  adminRestoreSubscription,
  adminUpdateBusinessContact,
  adminStartSupportSession,
  adminCreateTicket,
} from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { format } from "date-fns";
import { getStripeEnvironment } from "@/lib/stripe";
import { AlertTriangle, ArrowLeft, Eye } from "lucide-react";

export const Route = createFileRoute("/_adminApp/admin/businesses/$storeId")({
  head: () => ({ meta: [{ title: "Business — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: BusinessWorkspace,
});

function useReasonDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [pendingFn, setPendingFn] = useState<((r: string) => Promise<void>) | null>(null);
  const [busy, setBusy] = useState(false);

  function ask(t: string, d: string, fn: (r: string) => Promise<void>) {
    setTitle(t); setDescription(d); setReason(""); setPendingFn(() => fn); setOpen(true);
  }

  async function confirm() {
    if (reason.trim().length < 4) { toast.error("Reason required (min 4 chars)"); return; }
    setBusy(true);
    try {
      await pendingFn?.(reason.trim());
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason (required)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={busy}>{busy ? "Working…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ask, dialog };
}

function BusinessWorkspace() {
  const { storeId } = Route.useParams();
  const qc = useQueryClient();
  const env = getStripeEnvironment();
  const { ask, dialog } = useReasonDialog();

  const getWorkspace = useServerFn(adminGetBusinessWorkspace);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin_workspace", storeId],
    queryFn: () => getWorkspace({ data: { storeId } }),
  });

  const suspend = useServerFn(adminSuspendBusiness);
  const unsuspend = useServerFn(adminUnsuspendBusiness);
  const extendTrial = useServerFn(adminExtendTrial);
  const endTrial = useServerFn(adminEndTrial);
  const passwordReset = useServerFn(adminSendPasswordReset);
  const resendVerify = useServerFn(adminResendVerification);
  const revokeSessions = useServerFn(adminRevokeSessions);
  const setEmpStatus = useServerFn(adminSetEmployeeStatus);
  const resetPin = useServerFn(adminResetEmployeePin);
  const changeRole = useServerFn(adminChangeEmployeeRole);
  const renameTerm = useServerFn(adminRenameTerminal);
  const setTermStatus = useServerFn(adminSetTerminalStatus);
  const revokeTerm = useServerFn(adminRevokeTerminal);
  const refreshSub = useServerFn(adminRefreshSubscription);
  const cancelSub = useServerFn(adminCancelSubscription);
  const restoreSub = useServerFn(adminRestoreSubscription);
  const updateContact = useServerFn(adminUpdateBusinessContact);
  const startSupport = useServerFn(adminStartSupportSession);
  const createTicket = useServerFn(adminCreateTicket);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin_workspace", storeId] });

  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState<any>({});
  const [contactReason, setContactReason] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketBody, setTicketBody] = useState("");
  const [ticketPriority, setTicketPriority] = useState("normal");

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="text-sm text-destructive">{(error as any)?.message ?? "Failed to load"}</div>;
  const { store, owners, counts, employees, terminals, subscription, subscriptions, recent_sales, recent_activity, recent_issues, tickets, offline_terminals, last_activity } = data;

  async function openSupport() {
    ask("Open Support View", "Read-only view of merchant data. Expires in 30 minutes.", async (reason) => {
      await startSupport({ data: { storeId, reason } });
      toast.success("Support view started");
      qc.invalidateQueries({ queryKey: ["admin_support_session_active"] });
    });
  }

  async function doSuspend() {
    ask("Suspend business", `Prevents ${store.name} operations until unsuspended.`, async (reason) => {
      await suspend({ data: { storeId, reason } });
      toast.success("Suspended"); refresh();
    });
  }
  async function doUnsuspend() {
    ask("Remove suspension", `Restore ${store.name}.`, async (reason) => {
      await unsuspend({ data: { storeId, reason } });
      toast.success("Unsuspended"); refresh();
    });
  }
  async function doExtendTrial() {
    ask("Extend trial by 14 days", "Trial end date will be extended.", async (reason) => {
      await extendTrial({ data: { storeId, days: 14, reason } });
      toast.success("Trial extended"); refresh();
    });
  }
  async function doEndTrial() {
    ask("End trial now", "Trial will end immediately.", async (reason) => {
      await endTrial({ data: { storeId, reason } });
      toast.success("Trial ended"); refresh();
    });
  }
  async function saveContact() {
    if (contactReason.trim().length < 4) { toast.error("Reason required"); return; }
    try {
      await updateContact({ data: { storeId, reason: contactReason.trim(), ...contact } });
      toast.success("Updated"); setContactOpen(false); refresh();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function submitTicket() {
    if (!ticketSubject.trim()) { toast.error("Subject required"); return; }
    try {
      await createTicket({ data: { storeId, subject: ticketSubject, body: ticketBody, priority: ticketPriority } });
      toast.success("Ticket created"); setTicketOpen(false);
      setTicketSubject(""); setTicketBody("");
      refresh();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex items-center gap-3">
        <Link to="/admin/businesses" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Businesses
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{store.name}</h1>
          <div className="text-sm text-muted-foreground">
            <span className="font-mono">{store.store_code ?? store.id.slice(0, 8)}</span>
            {" · "}Created {format(new Date(store.created_at), "MMM d, yyyy")}
            {last_activity ? ` · Last activity ${format(new Date(last_activity), "MMM d, HH:mm")}` : ""}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Badge>{store.plan_tier}</Badge>
            <Badge variant="outline">{store.plan_status}</Badge>
            {store.suspended_at && <Badge className="bg-red-500/15 text-red-700">SUSPENDED</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openSupport}><Eye className="h-4 w-4 mr-1" />Open Support View</Button>
          {store.suspended_at ? (
            <Button variant="outline" size="sm" onClick={doUnsuspend}>Remove suspension</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={doSuspend}>Suspend</Button>
          )}
          <Button variant="outline" size="sm" onClick={doExtendTrial}>Extend trial +14d</Button>
          <Button variant="outline" size="sm" onClick={doEndTrial}>End trial</Button>
          <Button variant="outline" size="sm" onClick={() => { setContact({}); setContactReason(""); setContactOpen(true); }}>Edit contact</Button>
          <Button variant="outline" size="sm" onClick={() => setTicketOpen(true)}>New ticket</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Employees" value={counts.employees} />
        <StatCard label="Products" value={counts.products} />
        <StatCard label="Devices" value={counts.terminals} />
        <StatCard label="Open shifts" value={counts.open_shifts} />
        <StatCard label="Offline devices" value={offline_terminals} tone={offline_terminals > 0 ? "text-amber-600" : undefined} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="tickets">Tickets ({tickets.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <Card>
            <CardHeader><CardTitle>Business details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Info label="Name" value={store.name} />
              <Info label="Email" value={store.email} />
              <Info label="Phone" value={store.phone} />
              <Info label="Website" value={store.website} />
              <Info label="Address" value={[store.address, store.city, store.state, store.zip, store.country].filter(Boolean).join(", ")} />
              <Info label="Timezone" value={store.time_zone} />
              <Info label="Currency" value={store.currency} />
              <Info label="Plan period end" value={store.plan_period_end ? format(new Date(store.plan_period_end), "MMM d, yyyy") : "—"} />
              <Info label="Trial ends" value={store.trial_ends_at ? format(new Date(store.trial_ends_at), "MMM d, yyyy HH:mm") : "—"} />
              {store.suspended_at && <Info label="Suspended reason" value={store.suspended_reason ?? "—"} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Owners / admins</CardTitle></CardHeader>
            <CardContent>
              {owners.length === 0 ? (
                <div className="text-sm text-muted-foreground">No owner assigned.</div>
              ) : (
                <div className="space-y-2">
                  {owners.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between gap-2 text-sm border rounded p-2">
                      <div>
                        <div className="font-medium">{o.full_name ?? o.email}</div>
                        <div className="text-xs text-muted-foreground">{o.email} · {o.phone ?? "—"}</div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => ask("Send password reset", o.email, async (reason) => {
                          await passwordReset({ data: { userId: o.id, reason } });
                          toast.success("Password reset email sent");
                        })}>Password reset</Button>
                        <Button variant="outline" size="sm" onClick={() => ask("Resend verification email", o.email, async (reason) => {
                          await resendVerify({ data: { userId: o.id, reason } });
                          toast.success("Verification email sent");
                        })}>Resend verify</Button>
                        <Button variant="outline" size="sm" onClick={() => ask("Revoke all sessions", "Signs out on every device.", async (reason) => {
                          await revokeSessions({ data: { userId: o.id, reason } });
                          toast.success("Sessions revoked");
                        })}>Revoke sessions</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent sales</CardTitle></CardHeader>
            <CardContent>
              {recent_sales.length === 0 ? (
                <div className="text-sm text-muted-foreground">No sales yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left border-b"><th className="p-2">When</th><th className="p-2">Receipt</th><th className="p-2">Method</th><th className="p-2">Total</th><th className="p-2">Status</th></tr></thead>
                    <tbody>
                      {recent_sales.map((s: any) => (
                        <tr key={s.id} className="border-b last:border-b-0">
                          <td className="p-2 text-xs">{format(new Date(s.created_at), "MMM d, HH:mm")}</td>
                          <td className="p-2 text-xs font-mono">#{s.receipt_number ?? "—"}</td>
                          <td className="p-2 text-xs">{s.payment_method}</td>
                          <td className="p-2 text-xs">${Number(s.total).toFixed(2)}</td>
                          <td className="p-2 text-xs"><Badge variant="outline">{s.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-3">
          <Card>
            <CardHeader><CardTitle>Health signals</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <HealthRow label="Database access" ok={true} />
              <HealthRow label="Offline devices" ok={offline_terminals === 0} note={`${offline_terminals} offline`} />
              <HealthRow label="Open shifts" ok={counts.open_shifts <= 3} note={`${counts.open_shifts} open`} />
              <HealthRow label="Subscription" ok={["active","trialing"].includes(store.plan_status)} note={store.plan_status} />
              <HealthRow label="Suspended" ok={!store.suspended_at} note={store.suspended_at ? store.suspended_reason ?? "yes" : "no"} />
              <HealthRow label="Recent payment failures" ok={recent_issues.length === 0} note={`${recent_issues.length} in last activity`} />
            </CardContent>
          </Card>
          {recent_issues.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent payment failures</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="p-2">When</th><th className="p-2">Method</th><th className="p-2">Amount</th><th className="p-2">Status</th><th className="p-2">Message</th></tr></thead>
                  <tbody>
                    {recent_issues.map((r: any) => (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="p-2 text-xs">{format(new Date(r.created_at), "MMM d, HH:mm")}</td>
                        <td className="p-2 text-xs">{r.method}</td>
                        <td className="p-2 text-xs">${Number(r.amount).toFixed(2)}</td>
                        <td className="p-2 text-xs">{r.status}</td>
                        <td className="p-2 text-xs text-muted-foreground">{r.message ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="employees">
          <Card>
            <CardContent className="p-0">
              {employees.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground text-center">No employees.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Employee</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
                  <tbody>
                    {employees.map((e: any) => (
                      <tr key={e.id} className="border-t">
                        <td className="p-3">
                          <div className="font-medium">{e.full_name ?? e.email}</div>
                          <div className="text-xs text-muted-foreground">{e.email} · #{e.employee_id ?? "—"}</div>
                        </td>
                        <td className="p-3"><Badge variant={e.status === "active" ? "default" : "outline"}>{e.status}</Badge></td>
                        <td className="p-3 space-x-1">
                          {e.status === "active" ? (
                            <Button size="sm" variant="outline" onClick={() => ask("Disable employee", e.email, async (r) => { await setEmpStatus({ data: { userId: e.id, status: "disabled", reason: r } }); toast.success("Disabled"); refresh(); })}>Disable</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => ask("Reactivate employee", e.email, async (r) => { await setEmpStatus({ data: { userId: e.id, status: "active", reason: r } }); toast.success("Reactivated"); refresh(); })}>Reactivate</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => ask("Reset PIN", "Clears PIN; employee will be prompted to set a new one.", async (r) => { await resetPin({ data: { userId: e.id, reason: r } }); toast.success("PIN reset"); refresh(); })}>Reset PIN</Button>
                          <Button size="sm" variant="outline" onClick={() => ask("Revoke sessions", e.email, async (r) => { await revokeSessions({ data: { userId: e.id, reason: r } }); toast.success("Sessions revoked"); })}>Revoke sessions</Button>
                          <RoleChangeButton onSubmit={(role, reason) => changeRole({ data: { userId: e.id, storeId, role, reason } }).then(() => { toast.success("Role updated"); refresh(); })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardContent className="p-0">
              {terminals.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground text-center">No devices registered.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Device</th><th className="p-3">Status</th><th className="p-3">Last seen</th><th className="p-3">Actions</th></tr></thead>
                  <tbody>
                    {terminals.map((t: any) => (
                      <tr key={t.id} className="border-t">
                        <td className="p-3">
                          <div className="font-medium">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.provider} · {t.serial ?? "no serial"}</div>
                        </td>
                        <td className="p-3"><Badge variant="outline">{t.status}</Badge></td>
                        <td className="p-3 text-xs">{t.last_seen_at ? format(new Date(t.last_seen_at), "MMM d, HH:mm") : "never"}</td>
                        <td className="p-3 space-x-1">
                          <RenameTerminalButton current={t.label} onSubmit={(label, reason) => renameTerm({ data: { terminalId: t.id, label, reason } }).then(() => { toast.success("Renamed"); refresh(); })} />
                          {t.status === "active" ? (
                            <Button size="sm" variant="outline" onClick={() => ask("Mark inactive", t.label, async (r) => { await setTermStatus({ data: { terminalId: t.id, status: "inactive", reason: r } }); toast.success("Deactivated"); refresh(); })}>Deactivate</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => ask("Mark active", t.label, async (r) => { await setTermStatus({ data: { terminalId: t.id, status: "active", reason: r } }); toast.success("Activated"); refresh(); })}>Activate</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => ask("Revoke / unpair device", `${t.label} will need to be re-enrolled.`, async (r) => { await revokeTerm({ data: { terminalId: t.id, reason: r } }); toast.success("Revoked"); refresh(); })}>Revoke</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription">
          {!subscription ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">No Stripe subscription on file.</CardContent></Card>
          ) : (
            <Card>
              <CardHeader><CardTitle>Subscription</CardTitle><CardDescription>{subscription.environment}</CardDescription></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Info label="Price" value={subscription.price_id} />
                <Info label="Status" value={subscription.status} />
                <Info label="Period end" value={subscription.current_period_end ? format(new Date(subscription.current_period_end), "MMM d, yyyy HH:mm") : "—"} />
                <Info label="Cancel at period end" value={subscription.cancel_at_period_end ? "yes" : "no"} />
                <Info label="Stripe subscription" value={subscription.stripe_subscription_id} />
                <Info label="Stripe customer" value={subscription.stripe_customer_id} />
                <div className="flex flex-wrap gap-2 pt-3">
                  <Button size="sm" variant="outline" onClick={async () => {
                    try { const r = await refreshSub({ data: { subscriptionId: subscription.id, environment: env } });
                      if ("error" in r) toast.error(r.error); else { toast.success("Refreshed from Stripe"); refresh(); }
                    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                  }}>Refresh from Stripe</Button>
                  {subscription.stripe_subscription_id && (
                    <a
                      className="inline-flex items-center gap-1 text-sm underline"
                      href={`https://dashboard.stripe.com/${subscription.environment === "sandbox" ? "test/" : ""}subscriptions/${subscription.stripe_subscription_id}`}
                      target="_blank" rel="noopener noreferrer"
                    >Open in Stripe</a>
                  )}
                  {subscription.cancel_at_period_end ? (
                    <Button size="sm" variant="outline" onClick={() => ask("Restore cancellation", "Removes scheduled cancellation via Stripe.", async (r) => {
                      const res = await restoreSub({ data: { subscriptionId: subscription.id, environment: env, reason: r } });
                      if ("error" in res) toast.error(res.error); else { toast.success("Restored"); refresh(); }
                    })}>Restore</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => ask("Cancel at period end", "Merchant retains access until period end.", async (r) => {
                      const res = await cancelSub({ data: { subscriptionId: subscription.id, environment: env, reason: r, atPeriodEnd: true } });
                      if ("error" in res) toast.error(res.error); else { toast.success("Cancellation scheduled"); refresh(); }
                    })}>Cancel at period end</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {subscriptions.length > 1 && (
            <Card className="mt-3">
              <CardHeader><CardTitle className="text-base">All subscriptions</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                {subscriptions.map((s: any) => (
                  <div key={s.id} className="flex justify-between border-b py-1 last:border-b-0">
                    <span className="font-mono text-xs">{s.stripe_subscription_id ?? s.id.slice(0, 8)}</span>
                    <span>{s.status} · {s.environment}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="p-0">
              {recent_activity.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground text-center">No activity yet.</div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 sticky top-0"><tr className="text-left"><th className="p-2 w-40">When</th><th className="p-2">Actor</th><th className="p-2">Action</th><th className="p-2">Entity</th></tr></thead>
                    <tbody>
                      {recent_activity.map((a: any) => (
                        <tr key={a.id} className="border-t">
                          <td className="p-2 font-mono text-xs whitespace-nowrap">{format(new Date(a.created_at), "MMM d, HH:mm:ss")}</td>
                          <td className="p-2 text-xs">{a.actor_email ?? "system"}</td>
                          <td className="p-2"><Badge variant="outline" className="font-mono text-xs">{a.action}</Badge></td>
                          <td className="p-2 text-xs">{a.entity ?? "—"}{a.entity_id ? ` #${a.entity_id.slice(0, 8)}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets">
          <Card>
            <CardContent className="p-0">
              {tickets.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground text-center">No support tickets for this business.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40"><tr className="text-left"><th className="p-3">#</th><th className="p-3">Subject</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3">Opened</th></tr></thead>
                  <tbody>
                    {tickets.map((t: any) => (
                      <tr key={t.id} className="border-t">
                        <td className="p-3 font-mono text-xs">{t.ticket_number}</td>
                        <td className="p-3"><Link to="/admin/support/$ticketId" params={{ ticketId: t.id }} className="text-primary hover:underline">{t.subject}</Link></td>
                        <td className="p-3 text-xs">{t.priority}</td>
                        <td className="p-3"><Badge variant="outline">{t.status}</Badge></td>
                        <td className="p-3 text-xs">{format(new Date(t.created_at), "MMM d, HH:mm")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit business contact</DialogTitle><DialogDescription>Only public contact fields.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            {(["name","email","phone","website","address","city","state","zip"] as const).map((k) => (
              <div key={k}>
                <Label className="capitalize text-xs">{k}</Label>
                <Input value={contact[k] ?? (store as any)[k] ?? ""} onChange={(e) => setContact({ ...contact, [k]: e.target.value })} />
              </div>
            ))}
            <div>
              <Label className="text-xs">Reason</Label>
              <Textarea value={contactReason} onChange={(e) => setContactReason(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)}>Cancel</Button>
            <Button onClick={saveContact}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New support ticket</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Subject</Label>
              <Input value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={ticketPriority} onValueChange={setTicketPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>First note</Label>
              <Textarea value={ticketBody} onChange={(e) => setTicketBody(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTicketOpen(false)}>Cancel</Button>
            <Button onClick={submitTicket}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className={`text-2xl font-bold ${tone ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </CardContent></Card>
  );
}
function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-all">{value ?? "—"}</div>
    </div>
  );
}
function HealthRow({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between border rounded px-3 py-2">
      <div className="flex items-center gap-2">
        {ok ? <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
        <span>{label}</span>
      </div>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

function RenameTerminalButton({ current, onSubmit }: { current: string; onSubmit: (label: string, reason: string) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(current);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Rename</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename device</DialogTitle></DialogHeader>
          <Label>New name</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (reason.trim().length < 4) { toast.error("Reason required"); return; }
              try { await onSubmit(label.trim(), reason.trim()); setOpen(false); } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoleChangeButton({ onSubmit }: { onSubmit: (role: any, reason: string) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("cashier");
  const [reason, setReason] = useState("");
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Change role</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change role</DialogTitle></DialogHeader>
          <Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="cashier">Cashier</SelectItem>
            </SelectContent>
          </Select>
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (reason.trim().length < 4) { toast.error("Reason required"); return; }
              try { await onSubmit(role, reason.trim()); setOpen(false); } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }}>Change</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
