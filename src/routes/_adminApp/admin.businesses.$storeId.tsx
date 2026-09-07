import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminSuspendBusiness,
  adminUnsuspendBusiness,
  adminExtendTrial,
  adminEndTrial,
  adminSendPasswordReset,
  adminResendVerification,
  adminRevokeSessions,
  adminRefreshSubscription,
  adminCancelSubscription,
  adminRestoreSubscription,
  adminUpdateBusinessContact,
  adminStartSupportSession,
  adminCancelSupportRequest,
  adminEndSupportSession,
  adminCreateTicket,
} from "@/lib/admin/admin.functions";
import { adminGetPrivateBusinessWorkspace } from "@/lib/admin/company-admin.functions";
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
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  ShieldCheck,
  Monitor,
  LifeBuoy,
  CreditCard,
  Activity,
  Building2,
} from "lucide-react";
import { getStripeEnvironment } from "@/lib/stripe";

export const Route = createFileRoute("/_adminApp/admin/businesses/$storeId")({
  head: () => ({
    meta: [{ title: "Business  -  SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: BusinessWorkspace,
});

function useReasonDialog() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    description: string;
    reason: string;
    run?: (reason: string) => Promise<void>;
  }>({ open: false, title: "", description: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const ask = (title: string, description: string, run: (reason: string) => Promise<void>) =>
    setState({ open: true, title, description, reason: "", run });
  async function confirm() {
    if (state.reason.trim().length < 4)
      return toast.error("Enter a reason of at least 4 characters");
    setBusy(true);
    try {
      await state.run?.(state.reason.trim());
      setState((value) => ({ ...value, open: false }));
    } catch (error: any) {
      toast.error(error?.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }
  return {
    ask,
    dialog: (
      <Dialog open={state.open} onOpenChange={(open) => setState((value) => ({ ...value, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{state.title}</DialogTitle>
            <DialogDescription>{state.description}</DialogDescription>
          </DialogHeader>
          <Field label="Reason">
            <Textarea
              rows={3}
              value={state.reason}
              onChange={(event) => setState((value) => ({ ...value, reason: event.target.value }))}
            />
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setState((value) => ({ ...value, open: false }))}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={confirm}>
              {busy ? "Working…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  };
}

function BusinessWorkspace() {
  const { storeId } = Route.useParams();
  const qc = useQueryClient();
  let env: "sandbox" | "live" = "live";
  try {
    env = getStripeEnvironment();
  } catch {
    // The support workspace must not depend on a browser Stripe key being present.
  }
  const { ask, dialog } = useReasonDialog();
  const getWorkspace = useServerFn(adminGetPrivateBusinessWorkspace);
  const query = useQuery({
    queryKey: ["admin_workspace", storeId],
    queryFn: () => getWorkspace({ data: { storeId } }),
    retry: 1,
  });

  const suspend = useServerFn(adminSuspendBusiness);
  const unsuspend = useServerFn(adminUnsuspendBusiness);
  const extendTrial = useServerFn(adminExtendTrial);
  const endTrial = useServerFn(adminEndTrial);
  const passwordReset = useServerFn(adminSendPasswordReset);
  const resendVerify = useServerFn(adminResendVerification);
  const revokeSessions = useServerFn(adminRevokeSessions);
  const refreshSub = useServerFn(adminRefreshSubscription);
  const cancelSub = useServerFn(adminCancelSubscription);
  const restoreSub = useServerFn(adminRestoreSubscription);
  const updateContact = useServerFn(adminUpdateBusinessContact);
  const startSupport = useServerFn(adminStartSupportSession);
  const cancelSupport = useServerFn(adminCancelSupportRequest);
  const endSupport = useServerFn(adminEndSupportSession);
  const createTicket = useServerFn(adminCreateTicket);

  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState<any>({});
  const [contactReason, setContactReason] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticket, setTicket] = useState({ subject: "", body: "", priority: "normal" });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin_workspace", storeId] });
  };

  if (query.isLoading)
    return (
      <Card>
        <CardContent className="p-8 text-sm text-muted-foreground">
          Loading merchant account workspace…
        </CardContent>
      </Card>
    );
  if (query.isError || !query.data)
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <div className="text-sm text-destructive">
            {(query.error as any)?.message ?? "Could not load business"}
          </div>
          <Button className="mt-3" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );

  const {
    store,
    owners,
    devices,
    subscription,
    subscriptions,
    tickets,
    open_tickets,
    recent_activity,
    counts,
    offline_devices,
    last_activity,
    active_support_session,
    support_sessions,
  } = query.data as any;

  function audited(
    title: string,
    description: string,
    run: (reason: string) => Promise<any>,
    success: string,
  ) {
    ask(title, description, async (reason) => {
      const result = await run(reason);
      if (result?.error) throw new Error(result.error);
      toast.success(success);
      await refresh();
    });
  }

  async function saveContact() {
    if (contactReason.trim().length < 4) return toast.error("Enter a reason for the audit log");
    try {
      await updateContact({
        data: {
          storeId,
          reason: contactReason,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          address: contact.address,
          city: contact.city,
          state: contact.state,
          zip: contact.zip,
        },
      });
      toast.success("Business contact updated");
      setContactOpen(false);
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update contact");
    }
  }

  async function saveTicket() {
    if (!ticket.subject.trim()) return toast.error("Enter a subject");
    try {
      await createTicket({
        data: { storeId, subject: ticket.subject, body: ticket.body, priority: ticket.priority },
      });
      toast.success("Support case created");
      setTicketOpen(false);
      setTicket({ subject: "", body: "", priority: "normal" });
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not create case");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-3">
            <Link to="/admin/businesses">
              <ArrowLeft className="mr-2 h-4 w-4" /> Businesses
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{store.name}</h1>
            <Badge variant={store.suspended_at ? "destructive" : "outline"}>
              {store.suspended_at ? "suspended" : (store.plan_status ?? "unknown")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Merchant account support workspace · {store.store_code ?? store.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setContact({
                name: store.name ?? "",
                email: store.email ?? "",
                phone: store.phone ?? "",
                address: store.address ?? "",
                city: store.city ?? "",
                state: store.state ?? "",
                zip: store.zip ?? "",
              });
              setContactReason("");
              setContactOpen(true);
            }}
          >
            Edit account contact
          </Button>
          <Button variant="outline" onClick={() => setTicketOpen(true)}>
            New support case
          </Button>
          <Button
            onClick={() =>
              audited(
                "Request screen share",
                "The register will receive an Allow / Decline prompt. Nothing is shared until the merchant approves Android screen capture.",
                (reason) => startSupport({ data: { storeId, reason } }),
                "Screen-share request sent",
              )
            }
          >
            <Eye className="mr-2 h-4 w-4" /> Request screen share
          </Button>
        </div>
      </div>

      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
        <CardContent className="flex gap-3 p-4 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <div className="font-medium">Privacy-first view</div>
            <div className="text-muted-foreground">
              This page intentionally excludes merchant sales, refunds, register shifts, cash
              movements, products, and employee records. Those remain inside the merchant’s own
              dashboard.
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={CreditCard}
          label="Subscription"
          value={subscription?.status ?? store.plan_status ?? " - "}
        />
        <Metric
          icon={Monitor}
          label="POS devices"
          value={String(counts.devices ?? 0)}
          note={`${offline_devices ?? 0} offline`}
        />
        <Metric icon={LifeBuoy} label="Open support cases" value={String(counts.open_cases ?? 0)} />
        <Metric
          icon={Activity}
          label="Last platform activity"
          value={last_activity ? new Date(last_activity).toLocaleString() : "No activity"}
          small
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="devices">POS Devices</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Health
                label="Account active"
                ok={!store.suspended_at}
                note={
                  store.suspended_at
                    ? (store.suspended_reason ?? "Suspended")
                    : "No platform suspension"
                }
              />
              <Health
                label="Subscription usable"
                ok={["active", "trialing"].includes(store.plan_status)}
                note={store.plan_status ?? "Unknown"}
              />
              <Health
                label="Device connectivity"
                ok={(offline_devices ?? 0) === 0}
                note={`${offline_devices ?? 0} offline device(s)`}
              />
              <Health
                label="Support workload"
                ok={(open_tickets?.length ?? 0) < 3}
                note={`${open_tickets?.length ?? 0} open case(s)`}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Safe account actions</CardTitle>
              <CardDescription>Every action is server-authorized and audited.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {store.suspended_at ? (
                <Button
                  onClick={() =>
                    audited(
                      "Restore business",
                      "Remove the platform suspension.",
                      (reason) => unsuspend({ data: { storeId, reason } }),
                      "Business restored",
                    )
                  }
                >
                  Unsuspend
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() =>
                    audited(
                      "Suspend business",
                      "This blocks merchant access until restored.",
                      (reason) => suspend({ data: { storeId, reason } }),
                      "Business suspended",
                    )
                  }
                >
                  Suspend
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() =>
                  audited(
                    "Extend trial",
                    "Add 14 days to the current trial.",
                    (reason) => extendTrial({ data: { storeId, days: 14, reason } }),
                    "Trial extended",
                  )
                }
              >
                Extend trial +14d
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  audited(
                    "End trial",
                    "End this merchant trial immediately.",
                    (reason) => endTrial({ data: { storeId, reason } }),
                    "Trial ended",
                  )
                }
              >
                End trial
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Business account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Business" value={store.name} />
              <Row label="Email" value={store.email} />
              <Row label="Phone" value={store.phone} />
              <Row
                label="Location"
                value={[store.city, store.state, store.country].filter(Boolean).join(", ")}
              />
              <Row
                label="Created"
                value={store.created_at ? new Date(store.created_at).toLocaleString() : null}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Authorized owners</CardTitle>
              <CardDescription>
                Only account identity and recovery controls are shown.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(owners ?? []).length ? (
                owners.map((owner: any) => (
                  <div key={owner.id} className="rounded-lg border p-3">
                    <div className="font-medium">{owner.full_name || owner.email}</div>
                    <div className="text-xs text-muted-foreground">{owner.email}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          audited(
                            "Send password reset",
                            `Generate a recovery link for ${owner.email}.`,
                            (reason) => passwordReset({ data: { userId: owner.id, reason } }),
                            "Password recovery prepared",
                          )
                        }
                      >
                        Password reset
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          audited(
                            "Resend verification",
                            `Generate a verification link for ${owner.email}.`,
                            (reason) => resendVerify({ data: { userId: owner.id, reason } }),
                            "Verification prepared",
                          )
                        }
                      >
                        Verify email
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          audited(
                            "Revoke sessions",
                            `Sign ${owner.email} out everywhere.`,
                            (reason) => revokeSessions({ data: { userId: owner.id, reason } }),
                            "Sessions revoked",
                          )
                        }
                      >
                        Revoke sessions
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No owner profile found.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SEZA subscription</CardTitle>
              <CardDescription>
                Merchant billing relationship with SEZA - not checkout sales.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(subscriptions ?? []).length ? (
                subscriptions.map((sub: any) => (
                  <div key={sub.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{sub.status}</div>
                        <div className="text-xs text-muted-foreground">
                          {sub.environment} · period ends{" "}
                          {sub.current_period_end
                            ? new Date(sub.current_period_end).toLocaleDateString()
                            : " - "}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const result = await refreshSub({
                              data: { subscriptionId: sub.id, environment: sub.environment ?? env },
                            });
                            if ((result as any)?.error) toast.error((result as any).error);
                            else {
                              toast.success("Subscription refreshed");
                              refresh();
                            }
                          }}
                        >
                          Refresh
                        </Button>
                        {sub.cancel_at_period_end ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              audited(
                                "Restore subscription",
                                "Remove scheduled cancellation.",
                                (reason) =>
                                  restoreSub({
                                    data: {
                                      subscriptionId: sub.id,
                                      environment: sub.environment ?? env,
                                      reason,
                                    },
                                  }),
                                "Subscription restored",
                              )
                            }
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              audited(
                                "Cancel subscription",
                                "Schedule cancellation at the current period end.",
                                (reason) =>
                                  cancelSub({
                                    data: {
                                      subscriptionId: sub.id,
                                      environment: sub.environment ?? env,
                                      reason,
                                      atPeriodEnd: true,
                                    },
                                  }),
                                "Cancellation scheduled",
                              )
                            }
                          >
                            Cancel at period end
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No Stripe subscription record.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paired POS devices</CardTitle>
              <CardDescription>
                Connectivity and application health only. No register shifts or sales are exposed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(devices ?? []).length ? (
                devices.map((device: any) => (
                  <div
                    key={device.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <div className="font-medium">{device.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {device.platform ?? "Android"} · app {device.app_version ?? " - "}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={device.status === "active" ? "outline" : "destructive"}>
                        {device.status}
                      </Badge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Last seen{" "}
                        {device.last_seen_at
                          ? new Date(device.last_seen_at).toLocaleString()
                          : "never"}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No paired POS devices.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support" className="space-y-4">
          {active_support_session && (
            <Card className="border-amber-300">
              <CardHeader>
                <CardTitle className="text-base">
                  Support View: {active_support_session.status}
                </CardTitle>
                <CardDescription>{active_support_session.reason}</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                {active_support_session.status === "pending" && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await cancelSupport({ data: { sessionId: active_support_session.id } });
                      toast.success("Request canceled");
                      refresh();
                    }}
                  >
                    Cancel request
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await endSupport({
                      data: {
                        sessionId: active_support_session.id,
                        reason: "Ended from business workspace",
                      },
                    });
                    toast.success("Support View ended");
                    refresh();
                  }}
                >
                  End session
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Support cases</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(tickets ?? []).length ? (
                tickets.map((item: any) => (
                  <Link
                    key={item.id}
                    to="/admin/support/$ticketId"
                    params={{ ticketId: item.id }}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/40"
                  >
                    <div>
                      <div className="font-medium">
                        #{item.ticket_number} · {item.subject}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Updated {new Date(item.updated_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant={item.priority === "urgent" ? "destructive" : "outline"}>
                        {item.priority}
                      </Badge>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No support cases.</div>
              )}
            </CardContent>
          </Card>
          {(support_sessions ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Support View history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {support_sessions.map((session: any) => (
                  <div key={session.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span>{session.reason}</span>
                      <Badge variant="outline">{session.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Requested {new Date(session.requested_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audited platform activity</CardTitle>
              <CardDescription>
                SEZA administrative actions and account events only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(recent_activity ?? []).length ? (
                recent_activity.map((event: any) => (
                  <div key={event.id} className="rounded-lg border p-3 text-sm">
                    <div className="font-medium">{event.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {event.actor_email ?? "system"} ·{" "}
                      {new Date(event.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No audited activity.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit business contact</DialogTitle>
            <DialogDescription>
              Account contact only. Merchant operational records are not edited here.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name">
              <Input
                value={contact.name ?? ""}
                onChange={(e) => setContact((v: any) => ({ ...v, name: e.target.value }))}
              />
            </Field>
            <Field label="Email">
              <Input
                value={contact.email ?? ""}
                onChange={(e) => setContact((v: any) => ({ ...v, email: e.target.value }))}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={contact.phone ?? ""}
                onChange={(e) => setContact((v: any) => ({ ...v, phone: e.target.value }))}
              />
            </Field>
            <Field label="Address">
              <Input
                value={contact.address ?? ""}
                onChange={(e) => setContact((v: any) => ({ ...v, address: e.target.value }))}
              />
            </Field>
            <Field label="City">
              <Input
                value={contact.city ?? ""}
                onChange={(e) => setContact((v: any) => ({ ...v, city: e.target.value }))}
              />
            </Field>
            <Field label="State">
              <Input
                value={contact.state ?? ""}
                onChange={(e) => setContact((v: any) => ({ ...v, state: e.target.value }))}
              />
            </Field>
            <Field label="ZIP">
              <Input
                value={contact.zip ?? ""}
                onChange={(e) => setContact((v: any) => ({ ...v, zip: e.target.value }))}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Reason">
                <Textarea
                  value={contactReason}
                  onChange={(e) => setContactReason(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveContact}>Save audited change</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create support case</DialogTitle>
            <DialogDescription>The case stays visible until resolved and closed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Subject">
              <Input
                value={ticket.subject}
                onChange={(e) => setTicket((v) => ({ ...v, subject: e.target.value }))}
              />
            </Field>
            <Field label="Priority">
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={ticket.priority}
                onChange={(e) => setTicket((v) => ({ ...v, priority: e.target.value }))}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
            <Field label="Problem details">
              <Textarea
                rows={5}
                value={ticket.body}
                onChange={(e) => setTicket((v) => ({ ...v, body: e.target.value }))}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTicketOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveTicket}>Create case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || " - "}</span>
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  note,
  small,
}: {
  icon: any;
  label: string;
  value: string;
  note?: string;
  small?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-muted p-2">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={small ? "truncate text-sm font-semibold" : "text-xl font-bold"}>
            {value}
          </div>
          {note && <div className="text-xs text-muted-foreground">{note}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
function Health({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
      <Badge variant={ok ? "outline" : "destructive"}>{ok ? "OK" : "Attention"}</Badge>
    </div>
  );
}
