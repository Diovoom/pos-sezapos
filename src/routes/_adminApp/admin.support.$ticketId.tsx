import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  adminGetSupportCase,
  adminClaimSupportCase,
  adminTransitionSupportCase,
  adminSendSupportMessage,
  adminEndSupportChat,
} from "@/lib/admin/company-admin.functions";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  ArrowLeft,
  UserCheck,
  SearchCheck,
  Clock3,
  CircleCheck,
  Archive,
  RotateCcw,
  Send,
  MessageSquareOff,
  LockKeyhole,
  Smartphone,
  Building2,
  User,
  Activity,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { rememberAdminChat } from "@/components/admin/AdminPersistentChat";

export const Route = createFileRoute("/_adminApp/admin/support/$ticketId")({
  head: () => ({
    meta: [
      { title: "Support Case — SEZA Admin" },
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
  const sendMessage = useServerFn(adminSendSupportMessage);
  const endChat = useServerFn(adminEndSupportChat);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin_support_case", ticketId],
    queryFn: () => getCase({ data: { ticketId } }),
    refetchInterval: 10_000,
  });

  const [message, setMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [resolutionCode, setResolutionCode] = useState("fixed");
  const [endChatOpen, setEndChatOpen] = useState(false);
  const [endReason, setEndReason] = useState("");
  const [statusReason, setStatusReason] = useState("");

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
        { event: "*", schema: "public", table: "support_ticket_notes", filter: `ticket_id=eq.${ticketId}` },
        refresh,
      )
      .subscribe();
    const ticket = supabaseAdminAuth
      .channel(`admin-support-ticket-${suffix}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` },
        refresh,
      )
      .subscribe();
    return () => {
      void supabaseAdminAuth.removeChannel(messages);
      void supabaseAdminAuth.removeChannel(ticket);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const data = query.data;
  const problem = useMemo(() => data?.problem_message ?? data?.messages?.[0] ?? null, [data?.problem_message, data?.messages]);


  useEffect(() => {
    if (!data?.ticket?.id || data.ticket.chat_status === "ended") return;
    rememberAdminChat(data.ticket.id);
  }, [data?.ticket?.id, data?.ticket?.chat_status]);

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

  async function changeStatus(status: string, extras: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await transition({ data: { ticketId, status, reason: statusReason, ...extras } as any });
      toast.success(status === "resolved" ? "Case resolved" : status === "closed" ? "Case closed" : `Case moved to ${STATUS_LABELS[status] ?? status}`);
      setStatusReason("");
      setResolveOpen(false);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update support case");
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

  async function finishChat() {
    if (endReason.trim().length < 4) {
      toast.error("Explain why the live chat is ending");
      return;
    }
    setBusy(true);
    try {
      await endChat({ data: { ticketId, reason: endReason } });
      toast.success("Live chat ended. The transcript remains saved.");
      setEndChatOpen(false);
      setEndReason("");
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not end chat");
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading) return <div className="text-sm text-muted-foreground">Loading support case…</div>;
  if (query.isError || !data) return <div className="text-sm text-destructive">Could not load this support case.</div>;

  const { ticket, messages, internal_notes, events, store, requester, assignee, device } = data;
  const chatEnded = !ticket.chat_status || ticket.chat_status === "ended";
  const isFinal = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div className="space-y-6">
      <Link to="/admin/support" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to active support
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-muted-foreground">CASE #{ticket.ticket_number}</div>
          <h1 className="text-2xl font-bold" data-no-translate>{ticket.subject}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {!isFinal && (
              <Badge variant={ticket.priority === "urgent" ? "destructive" : "outline"}>{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</Badge>
            )}
            <Badge variant={ticket.status === "resolved" ? "default" : "outline"}>{STATUS_LABELS[ticket.status] ?? ticket.status}</Badge>
            <Badge variant={chatEnded ? "secondary" : "default"}>{chatEnded ? "Chat ended" : "Live chat active"}</Badge>
            {assignee ? <Badge variant="secondary">Assigned to {assignee.full_name || assignee.email}</Badge> : <Badge variant="outline">Unassigned</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!ticket.assigned_admin_id && <Button onClick={claim} disabled={busy}><UserCheck className="mr-2 h-4 w-4" /> Claim case</Button>}
          {!isFinal && ticket.status !== "investigating" && (
            <Button variant="outline" onClick={() => changeStatus("investigating")} disabled={busy}>
              <SearchCheck className="mr-2 h-4 w-4" /> Start investigating
            </Button>
          )}
          {!isFinal && ticket.status !== "waiting_for_merchant" && (
            <Button variant="outline" onClick={() => changeStatus("waiting_for_merchant")} disabled={busy}>
              <Clock3 className="mr-2 h-4 w-4" /> Wait for merchant
            </Button>
          )}
          {!isFinal && <Button onClick={() => { setResolutionSummary(ticket.resolution_summary || ticket.resolution || ""); setResolveOpen(true); }}><CircleCheck className="mr-2 h-4 w-4" /> Resolve</Button>}
          {ticket.status === "resolved" && chatEnded && <Button variant="outline" onClick={() => changeStatus("closed", { resolutionSummary: ticket.resolution_summary || ticket.resolution })}><Archive className="mr-2 h-4 w-4" /> Close case</Button>}
          {isFinal && <Button variant="outline" onClick={() => changeStatus("open")}><RotateCcw className="mr-2 h-4 w-4" /> Reopen</Button>}
        </div>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Problem reported by the merchant</CardTitle>
          <CardDescription>The original issue stays visible throughout the entire investigation.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap text-sm" data-no-translate>{problem?.body || "The merchant did not include an opening message."}</div>
          <div className="mt-3 text-xs text-muted-foreground">
            Reported {format(new Date(ticket.created_at), "MMM d, yyyy 'at' h:mm a")} by {requester?.full_name || ticket.requester_email || "merchant user"}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Live merchant conversation</CardTitle>
                <CardDescription>Updates in real time and stays connected while you work anywhere in Admin.</CardDescription>
              </div>
              {!chatEnded && (
                <Button variant="outline" size="sm" onClick={() => setEndChatOpen(true)}>
                  <MessageSquareOff className="mr-2 h-4 w-4" /> End live chat
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No public messages yet.</div>
              ) : messages.map((item: any) => {
                const merchant = !item.author_is_platform;
                return (
                  <div key={item.id} className={`flex ${merchant ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 ${merchant ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
                      <div className={`mb-1 text-[11px] ${merchant ? "text-muted-foreground" : "text-primary-foreground/75"}`}>
                        {merchant ? (item.author_name || requester?.full_name || item.author_email || "Merchant") : (item.author_name || item.author_email || "SEZA Support")} · {format(new Date(item.created_at), "MMM d, h:mm a")}
                      </div>
                      <div className="whitespace-pre-wrap text-sm" data-no-translate>{item.body}</div>
                    </div>
                  </div>
                );
              })}

              {chatEnded && (
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="font-medium">This live chat was ended</div>
                  <div className="text-muted-foreground">The transcript remains saved. Sending another message reactivates the live conversation.</div>
                </div>
              )}
              {ticket.status !== "closed" && (
                <div className="space-y-2 border-t pt-3">
                  <Label>{chatEnded ? "Reactivate chat and message merchant" : "Reply to merchant"}</Label>
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Write a clear update, ask a question, or explain the fix…" />
                  <Button onClick={() => send(message, false)} disabled={busy || !message.trim()}><Send className="mr-2 h-4 w-4" /> {chatEnded ? "Reactivate & send" : "Send live message"}</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" /> Internal investigation notes</CardTitle>
              <CardDescription>Only SEZA company staff can see these notes. Merchants cannot access them.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {internal_notes.map((item: any) => (
                <div key={item.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="text-xs text-muted-foreground">{item.author_email || "SEZA staff"} · {format(new Date(item.created_at), "MMM d, h:mm a")}</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm" data-no-translate>{item.body}</div>
                </div>
              ))}
              <Textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={3} placeholder="Diagnostics, suspected cause, next steps…" />
              <Button variant="outline" onClick={() => send(internalNote, true)} disabled={busy || !internalNote.trim()}>Add internal note</Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Case context</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ContextRow icon={Building2} label="Business" value={store?.name || "—"} />
              {store && <Button asChild variant="outline" size="sm" className="w-full"><Link to="/admin/businesses/$storeId" params={{ storeId: store.id }}>Open business workspace</Link></Button>}
              <ContextRow icon={User} label="Requester" value={requester?.full_name || ticket.requester_email || "—"} note={requester?.employee_id ? `Employee ${requester.employee_id}` : undefined} />
              <ContextRow icon={Smartphone} label="POS register" value={device?.label || "Not attached"} note={device?.last_seen_at ? `Last seen ${formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })}` : undefined} />
              <ContextRow icon={Activity} label="Last message" value={ticket.last_message_at ? formatDistanceToNow(new Date(ticket.last_message_at), { addSuffix: true }) : "No messages"} />
              <div className="rounded-lg border p-3">
                <Label>Status reason / handoff note</Label>
                <Textarea className="mt-2" rows={2} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Optional context for the audit timeline…" />
              </div>
            </CardContent>
          </Card>

          {ticket.resolution_summary && (
            <Card className="border-emerald-500/30">
              <CardHeader><CardTitle className="text-base">Resolution</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Badge>{ticket.resolution_code || "fixed"}</Badge>
                <div className="whitespace-pre-wrap">{ticket.resolution_summary}</div>
                {ticket.resolved_at && <div className="text-xs text-muted-foreground">Resolved {format(new Date(ticket.resolved_at), "MMM d, yyyy h:mm a")}</div>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Activity timeline</CardTitle></CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-sm text-muted-foreground">No lifecycle events recorded yet.</div>
              ) : (
                <div className="space-y-4">
                  {events.map((event: any) => (
                    <div key={event.id} className="relative border-l pl-4 text-sm">
                      <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border bg-background" />
                      <div className="font-medium">{String(event.event_type).replaceAll("_", " ")}</div>
                      <div className="text-xs text-muted-foreground">{event.actor_email || "system"} · {format(new Date(event.created_at), "MMM d, h:mm a")}</div>
                      {event.from_status !== event.to_status && event.to_status && <div className="mt-1 text-xs">{event.from_status || "—"} → {event.to_status}</div>}
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
            <DialogTitle>Resolve support case</DialogTitle>
            <DialogDescription>A real resolution summary is required. The case stays in history and can be reopened.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Resolution type</Label>
              <Select value={resolutionCode} onValueChange={setResolutionCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Textarea rows={6} value={resolutionSummary} onChange={(e) => setResolutionSummary(e.target.value)} placeholder="Root cause, exact fix, verification performed, and anything the merchant must know…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button disabled={busy || resolutionSummary.trim().length < 5} onClick={() => changeStatus("resolved", { resolutionSummary, resolutionCode })}>Save resolution</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={endChatOpen} onOpenChange={setEndChatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End live chat?</DialogTitle>
            <DialogDescription>The conversation disappears from the active communication screen only after this action. Its transcript is never deleted.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={endReason} onChange={(e) => setEndReason(e.target.value)} placeholder="Issue resolved, merchant stopped responding, moved to scheduled follow-up…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndChatOpen(false)}>Keep chat active</Button>
            <Button variant="destructive" disabled={busy} onClick={finishChat}>End live chat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContextRow({ icon: Icon, label, value, note }: { icon: any; label: string; value: string; note?: string }) {
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
