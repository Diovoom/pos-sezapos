import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  adminEndSupportChat,
  adminGetSupportCase,
  adminClaimSupportCase,
  adminReleaseSupportCase,
  adminTransitionSupportCase,
  adminSendSupportMessage,
} from "@/lib/admin/company-admin.functions";
import { adminStartSupportSession } from "@/lib/admin/admin.functions";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  UserCheck,
  SearchCheck,
  Clock3,
  CircleCheck,
  Archive,
  RotateCcw,
  Send,
  LockKeyhole,
  Smartphone,
  MonitorUp,
  MonitorCog,
  Building2,
  User,
  Activity,
  PhoneOff,
  UserMinus,
  X,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { rememberAdminChat } from "@/components/admin/AdminPersistentChat";

export const Route = createFileRoute("/_adminApp/admin/support/$ticketId")({
  head: () => ({
    meta: [
      { title: "Support Case  -  SEZA Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SupportCasePage,
});

const STATUS_LABELS: Record<string, string> = {
  open: "New / open",
  investigating: "Investigating",
  waiting_support: "Investigating",
  in_progress: "Investigating",
  waiting_for_merchant: "Waiting for merchant",
  waiting_customer: "Waiting for merchant",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

function SupportCasePage() {
  const { ticketId } = Route.useParams();
  const getCase = useServerFn(adminGetSupportCase);
  const claimCase = useServerFn(adminClaimSupportCase);
  const transition = useServerFn(adminTransitionSupportCase);
  const releaseCase = useServerFn(adminReleaseSupportCase);
  const sendMessage = useServerFn(adminSendSupportMessage);
  const endSupportChat = useServerFn(adminEndSupportChat);
  const startScreenSession = useServerFn(adminStartSupportSession);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin_support_case", ticketId],
    queryFn: () => getCase({ data: { ticketId } }),
    refetchInterval: 60_000,
  });

  const [message, setMessage] = useState("");
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [internalNote, setInternalNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [resolutionCode, setResolutionCode] = useState("fixed");
  const [statusReason, setStatusReason] = useState("");

  useEffect(() => {
    let active = true;
    void supabaseAdminAuth.auth.getUser().then(({ data }) => {
      if (active) setAdminUserId(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin_support_case", ticketId] });
    qc.invalidateQueries({ queryKey: ["admin_tickets"] });
    qc.invalidateQueries({ queryKey: ["admin_ticket_counts"] });
    qc.invalidateQueries({ queryKey: ["admin_communications"] });
    qc.invalidateQueries({ queryKey: ["admin_operations_overview"] });
  };

  useEffect(() => {
    const suffix = `${ticketId}-${crypto.randomUUID()}`;
    const messages = supabaseAdminAuth
      .channel(`admin-support-messages-${suffix}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_ticket_notes",
          filter: `ticket_id=eq.${ticketId}`,
        },
        refresh,
      )
      .subscribe();
    const ticket = supabaseAdminAuth
      .channel(`admin-support-ticket-${suffix}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_tickets",
          filter: `id=eq.${ticketId}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      void supabaseAdminAuth.removeChannel(messages);
      void supabaseAdminAuth.removeChannel(ticket);
    };
  }, [ticketId]);

  const data = query.data;
  const problem = useMemo(
    () => data?.problem_message ?? data?.messages?.[0] ?? null,
    [data?.problem_message, data?.messages],
  );

  useEffect(() => {
    if (!data?.ticket?.id) return;
    if (
      data.ticket.chat_status === "ended" ||
      ["resolved", "closed"].includes(String(data.ticket.status))
    ) {
      rememberAdminChat(null);
      return;
    }
    rememberAdminChat(data.ticket.id);
  }, [data?.ticket?.id, data?.ticket?.status]);

  async function claim() {
    setBusy(true);
    try {
      await claimCase({ data: { ticketId } });
      toast.success("Case assigned to you. It remains in Active work.");
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not claim case");
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    try {
      await releaseCase({
        data: { ticketId, reason: statusReason.trim() || "Released for another support admin." },
      });
      toast.success("Case released to the support queue");
      rememberAdminChat(null);
      setStatusReason("");
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not release case");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: string, extras: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await transition({ data: { ticketId, status, reason: statusReason, ...extras } as any });
      toast.success(
        status === "resolved"
          ? "Case resolved"
          : status === "closed"
            ? "Case closed"
            : `Case moved to ${STATUS_LABELS[status] ?? status}`,
      );
      setStatusReason("");
      setResolveOpen(false);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update support case");
    } finally {
      setBusy(false);
    }
  }

  async function endChat() {
    const confirmed = window.confirm(
      "End this live chat? The case and transcript will remain available for follow-up.",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await endSupportChat({
        data: { ticketId, reason: statusReason.trim() || "Live chat ended by SEZA Support." },
      });
      toast.success("Live chat ended");
      rememberAdminChat(null);
      setStatusReason("");
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not end live chat");
    } finally {
      setBusy(false);
    }
  }

  async function send(body: string, internal: boolean) {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await sendMessage({ data: { ticketId, body, internal } });
      if (internal) setInternalNote("");
      else setMessage("");
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not send message");
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading)
    return <div className="text-sm text-muted-foreground">Loading support case…</div>;
  if (query.isError || !data)
    return <div className="text-sm text-destructive">Could not load this support case.</div>;

  const { ticket, messages, internal_notes, events, store, requester, assignee, device } = data;
  const isFinal = ticket.status === "resolved" || ticket.status === "closed";
  const chatEnded = ticket.chat_status === "ended" || isFinal;
  const assignedToMe = Boolean(adminUserId && ticket.assigned_admin_id === adminUserId);
  const assignedToOther = Boolean(ticket.assigned_admin_id && !assignedToMe);

  async function requestScreen() {
    if (!store?.id) return;
    setBusy(true);
    try {
      if (!ticket.assigned_admin_id) {
        await claimCase({ data: { ticketId } });
      }
      await startScreenSession({
        data: {
          storeId: store.id,
          reason: `Support case #${ticket.ticket_number ?? ticket.id}: ${ticket.subject}`,
        },
      });
      toast.success("Screen-share request sent to the SEZA register");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not request screen access");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/admin/support"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to active support
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-muted-foreground">
            CASE #{ticket.ticket_number}
          </div>
          <h1 className="text-2xl font-bold" data-no-translate>
            {ticket.subject}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {!isFinal && (
              <Badge variant={ticket.priority === "urgent" ? "destructive" : "outline"}>
                {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
              </Badge>
            )}
            <Badge variant={ticket.status === "resolved" ? "default" : "outline"}>
              {STATUS_LABELS[ticket.status] ?? ticket.status}
            </Badge>
            <Badge variant={chatEnded ? "secondary" : "default"}>
              {chatEnded ? "Chat ended" : "Live chat active"}
            </Badge>
            {assignee ? (
              <Badge variant="secondary">Assigned to {assignee.full_name || assignee.email}</Badge>
            ) : (
              <Badge variant="outline">Unassigned</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label="Close case workspace"
            title="Close case workspace"
          >
            <Link to="/admin/support">
              <X className="h-5 w-5" />
            </Link>
          </Button>
          {!ticket.assigned_admin_id && (
            <Button onClick={claim} disabled={busy}>
              <UserCheck className="mr-2 h-4 w-4" /> Claim case
            </Button>
          )}
          {!isFinal && assignedToMe && (
            <Button variant="outline" onClick={() => void release()} disabled={busy}>
              <UserMinus className="mr-2 h-4 w-4" /> Release to queue
            </Button>
          )}
          {!isFinal && assignedToMe && ticket.status !== "investigating" && (
            <Button variant="outline" onClick={() => changeStatus("investigating")} disabled={busy}>
              <SearchCheck className="mr-2 h-4 w-4" /> Start investigating
            </Button>
          )}
          {!isFinal && assignedToMe && ticket.status !== "waiting_for_merchant" && (
            <Button
              variant="outline"
              onClick={() => changeStatus("waiting_for_merchant")}
              disabled={busy}
            >
              <Clock3 className="mr-2 h-4 w-4" /> Wait for merchant
            </Button>
          )}
          {store?.id && (
            <Button asChild variant="outline">
              <Link to="/admin/businesses/$storeId" params={{ storeId: store.id }}>
                <MonitorCog className="mr-2 h-4 w-4" /> Manage merchant & POS
              </Link>
            </Button>
          )}
          {!isFinal && !assignedToOther && store?.id && (
            <Button variant="outline" onClick={() => void requestScreen()} disabled={busy}>
              <MonitorUp className="mr-2 h-4 w-4" /> Request screen share
            </Button>
          )}
          {!chatEnded && assignedToMe && (
            <Button variant="destructive" onClick={() => void endChat()} disabled={busy}>
              <PhoneOff className="mr-2 h-4 w-4" /> End chat
            </Button>
          )}
          {!isFinal && assignedToMe && (
            <Button
              onClick={() => {
                setResolutionSummary(ticket.resolution_summary || ticket.resolution || "");
                setResolveOpen(true);
              }}
            >
              <CircleCheck className="mr-2 h-4 w-4" /> Resolve
            </Button>
          )}
          {ticket.status === "resolved" && chatEnded && (
            <Button
              variant="outline"
              onClick={() =>
                changeStatus("closed", {
                  resolutionSummary: ticket.resolution_summary || ticket.resolution,
                })
              }
            >
              <Archive className="mr-2 h-4 w-4" /> Close case
            </Button>
          )}
          {isFinal && (
            <Button variant="outline" onClick={() => changeStatus("open")}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reopen
            </Button>
          )}
        </div>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Problem reported by the merchant</CardTitle>
          <CardDescription>
            The original issue stays visible throughout the entire investigation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap text-sm" data-no-translate>
            {problem?.body || "The merchant did not include an opening message."}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Reported {format(new Date(ticket.created_at), "MMM d, yyyy 'at' h:mm a")} by{" "}
            {ticket.visitor_name ||
              requester?.full_name ||
              ticket.requester_email ||
              "merchant user"}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Live merchant conversation</CardTitle>
                <CardDescription>
                  Updates in real time and stays connected while you work anywhere in Admin.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No public messages yet.
                </div>
              ) : (
                messages.map((item: any) => {
                  const merchant = !item.author_is_platform;
                  return (
                    <div
                      key={item.id}
                      className={`flex ${merchant ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 ${merchant ? "bg-muted" : "bg-primary text-primary-foreground"}`}
                      >
                        <div
                          className={`mb-1 text-[11px] ${merchant ? "text-muted-foreground" : "text-primary-foreground/75"}`}
                        >
                          {merchant
                            ? item.author_name ||
                              ticket.visitor_name ||
                              requester?.full_name ||
                              item.author_email ||
                              "Merchant"
                            : item.author_name || item.author_email || "SEZA Support"}{" "}
                          · {format(new Date(item.created_at), "MMM d, h:mm a")}
                        </div>
                        <div className="whitespace-pre-wrap text-sm" data-no-translate>
                          {item.body}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {chatEnded && (
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="font-medium">This live chat has ended</div>
                  <div className="text-muted-foreground">
                    The transcript and support case remain saved. Reopen the case to continue the
                    conversation.
                  </div>
                </div>
              )}
              {!chatEnded && (
                <div className="space-y-2 border-t pt-3">
                  <Label>Reply to merchant</Label>
                  {!ticket.assigned_admin_id && (
                    <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      Claim this case to connect directly with the merchant.
                    </div>
                  )}
                  {assignedToOther && (
                    <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      This conversation is currently owned by{" "}
                      {assignee?.full_name || assignee?.email || "another admin"}.
                    </div>
                  )}
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    disabled={!assignedToMe}
                    placeholder={
                      assignedToMe
                        ? "Write a clear update, ask a question, or explain the fix…"
                        : "Claim the case before replying"
                    }
                  />
                  <Button
                    onClick={() => send(message, false)}
                    disabled={busy || !message.trim() || !assignedToMe}
                  >
                    <Send className="mr-2 h-4 w-4" /> Send live message
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LockKeyhole className="h-4 w-4" /> Internal investigation notes
              </CardTitle>
              <CardDescription>
                Only SEZA company staff can see these notes. Merchants cannot access them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {internal_notes.map((item: any) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                >
                  <div className="text-xs text-muted-foreground">
                    {item.author_email || "SEZA staff"} ·{" "}
                    {format(new Date(item.created_at), "MMM d, h:mm a")}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm" data-no-translate>
                    {item.body}
                  </div>
                </div>
              ))}
              <Textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                rows={3}
                placeholder="Diagnostics, suspected cause, next steps…"
              />
              <Button
                variant="outline"
                onClick={() => send(internalNote, true)}
                disabled={busy || !internalNote.trim()}
              >
                Add internal note
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Case context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ContextRow icon={Building2} label="Business" value={store?.name || " - "} />
              {store && (
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/admin/businesses/$storeId" params={{ storeId: store.id }}>
                    Open business workspace
                  </Link>
                </Button>
              )}
              <ContextRow
                icon={User}
                label="Requester"
                value={
                  ticket.visitor_name || requester?.full_name || ticket.requester_email || " - "
                }
                note={
                  ticket.visitor_phone ||
                  (requester?.employee_id ? `Employee ${requester.employee_id}` : undefined)
                }
              />
              <ContextRow
                icon={Smartphone}
                label="POS register"
                value={device?.label || "Not attached"}
                note={
                  device?.last_seen_at
                    ? `Last seen ${formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })}`
                    : undefined
                }
              />
              <ContextRow
                icon={Activity}
                label="Last message"
                value={
                  ticket.last_message_at
                    ? formatDistanceToNow(new Date(ticket.last_message_at), { addSuffix: true })
                    : "No messages"
                }
              />
              <div className="rounded-lg border p-3">
                <Label>Status reason / handoff note</Label>
                <Textarea
                  className="mt-2"
                  rows={2}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Optional context for the audit timeline…"
                />
              </div>
            </CardContent>
          </Card>

          {ticket.resolution_summary && (
            <Card className="border-emerald-500/30">
              <CardHeader>
                <CardTitle className="text-base">Resolution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Badge>{ticket.resolution_code || "fixed"}</Badge>
                <div className="whitespace-pre-wrap">{ticket.resolution_summary}</div>
                {ticket.resolved_at && (
                  <div className="text-xs text-muted-foreground">
                    Resolved {format(new Date(ticket.resolved_at), "MMM d, yyyy h:mm a")}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No lifecycle events recorded yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {events.map((event: any) => (
                    <div key={event.id} className="relative border-l pl-4 text-sm">
                      <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border bg-background" />
                      <div className="font-medium">
                        {String(event.event_type).replaceAll("_", " ")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {event.actor_email || "system"} ·{" "}
                        {format(new Date(event.created_at), "MMM d, h:mm a")}
                      </div>
                      {event.from_status !== event.to_status && event.to_status && (
                        <div className="mt-1 text-xs">
                          {event.from_status || " - "} → {event.to_status}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish support case</DialogTitle>
            <DialogDescription>
              Record what was fixed. You can keep the case resolved for review or resolve and close it now.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Resolution type</Label>
              <Select value={resolutionCode} onValueChange={setResolutionCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="merchant_guidance">Merchant guidance</SelectItem>
                  <SelectItem value="configuration">Configuration changed</SelectItem>
                  <SelectItem value="duplicate">Duplicate issue</SelectItem>
                  <SelectItem value="not_reproducible">Could not reproduce</SelectItem>
                  <SelectItem value="feature_request">Feature request recorded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>What was wrong and how was it fixed?</Label>
              <Textarea
                rows={6}
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                placeholder="Root cause, exact fix, verification performed, and anything the merchant must know…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={busy || resolutionSummary.trim().length < 5}
              onClick={() => changeStatus("resolved", { resolutionSummary, resolutionCode })}
            >
              Save as resolved
            </Button>
            <Button
              disabled={busy || resolutionSummary.trim().length < 5}
              onClick={() => changeStatus("closed", { resolutionSummary, resolutionCode })}
            >
              Resolve & close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContextRow({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: any;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border p-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate font-medium">{value}</div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </div>
    </div>
  );
}
