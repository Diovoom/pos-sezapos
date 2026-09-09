import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, Loader2, MessageSquare, CheckCircle2, Archive, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import {
  merchantCloseSupportCase,
  merchantDeleteSupportCase,
  merchantGetSupportCase,
  merchantReplySupportCase,
} from "@/lib/support.functions";

export const Route = createFileRoute("/_dashboard/help/$ticketId")({
  head: () => ({
    meta: [
      { title: "Support Chat  -  SEZA POS" },
      { name: "description", content: "Chat live with SEZA POS support." },
    ],
  }),
  component: MerchantSupportChat,
});

function MerchantSupportChat() {
  const { ticketId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const getCase = useServerFn(merchantGetSupportCase);
  const replyCase = useServerFn(merchantReplySupportCase);
  const closeSupportCase = useServerFn(merchantCloseSupportCase);
  const deleteSupportCase = useServerFn(merchantDeleteSupportCase);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["merchant-support-chat", ticketId],
    queryFn: () => getCase({ data: { ticketId } }),
    refetchInterval: 30_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["merchant-support-chat", ticketId] });

  useEffect(() => {
    const suffix = `${ticketId}-${crypto.randomUUID()}`;
    const notes = supabase
      .channel(`merchant-support-notes-${suffix}`)
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
    const ticket = supabase
      .channel(`merchant-support-ticket-${suffix}`)
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
      void supabase.removeChannel(notes);
      void supabase.removeChannel(ticket);
    };
  }, [ticketId]);

  async function sendMessage() {
    if (!message.trim() || !query.data) return;
    setBusy(true);
    try {
      const result = await replyCase({ data: { ticketId, body: message.trim() } });
      setMessage("");
      if (result.reopened) toast.success("Conversation reopened");
      refresh();
    } catch (error) {
      toast.error(
        userFacingError(
          error,
          "Your message could not be sent. Check your connection and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function closeCase() {
    if (!query.data || query.data.ticket.status === "closed") return;
    const confirmed = window.confirm("Mark this support case solved and close it?");
    if (!confirmed) return;
    setBusy(true);
    try {
      await closeSupportCase({ data: { ticketId } });
      toast.success("Support case closed");
      refresh();
      await qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
    } catch (error) {
      toast.error(userFacingError(error, "This support case could not be closed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteConversation() {
    if (!query.data || query.data.ticket.status !== "closed") return;
    const confirmed = window.confirm(
      "Permanently delete this closed support conversation and all of its messages?",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteSupportCase({ data: { ticketId } });
      toast.success("Conversation deleted");
      await qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
      navigate({ to: "/help" });
    } catch (error) {
      toast.error(userFacingError(error, "This conversation could not be deleted."));
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading support chat…
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-sm text-destructive">
        Could not open this support case.
      </div>
    );
  }

  const { ticket, messages, currentUserId } = query.data;
  const ended = ticket.chat_status === "ended";
  const closed = ticket.status === "closed";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-5 md:p-6">
      <Link
        to="/help"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to support
      </Link>
      <PageHeader
        title={`Support case #${ticket.ticket_number ?? " - "}`}
        subtitle={ticket.subject}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{ticket.priority}</Badge>
        <Badge>{ticket.status}</Badge>
        <Badge variant={ended ? "secondary" : "default"}>
          {ended ? "Chat ended" : "Live chat"}
        </Badge>
        {!closed ? (
          <Button className="ml-auto" size="sm" variant="outline" onClick={() => void closeCase()} disabled={busy}>
            <Archive className="mr-2 h-4 w-4" /> Mark solved & close
          </Button>
        ) : (
          <Button className="ml-auto" size="sm" variant="destructive" onClick={() => void deleteConversation()} disabled={busy}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete conversation
          </Button>
        )}
      </div>

      {ticket.resolution_summary || ticket.resolution ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> SEZA resolution
            </CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">
            {ticket.resolution_summary || ticket.resolution}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Live conversation
          </CardTitle>
          <CardDescription>
            Messages update automatically. The transcript stays saved with your support case.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No messages yet. Send the details of the problem below.
            </div>
          ) : (
            messages.map((item: any) => {
              const mine = item.author_id === currentUserId;
              const fromSeza = item.sender_kind === "admin";
              const label = mine
                ? "You"
                : fromSeza
                  ? "SEZA Support"
                  : item.author_email || "Merchant team";
              return (
                <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`min-w-0 max-w-[92%] overflow-hidden rounded-xl px-3 py-2 sm:max-w-[85%] ${mine ? "bg-primary text-primary-foreground" : fromSeza ? "bg-emerald-500/10" : "bg-muted"}`}
                  >
                    <div
                      className={`mb-1 text-[11px] ${mine ? "text-primary-foreground/75" : "text-muted-foreground"}`}
                    >
                      {label} · {format(new Date(item.created_at), "MMM d, h:mm a")}
                    </div>
                    <div className="whitespace-pre-wrap break-words text-sm">{item.body}</div>
                  </div>
                </div>
              );
            })
          )}

          {closed ? (
            <div className="rounded-lg bg-muted p-4 text-sm">
              This case is closed. Open a new ticket if you need help with a different or recurring
              problem.
            </div>
          ) : (
            <div className="space-y-2 border-t pt-4">
              {ended && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  SEZA ended the previous live session. Sending a new message will reactivate the
                  conversation.
                </div>
              )}
              <Textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Reply to SEZA Support…"
              />
              <Button className="w-full sm:w-auto" onClick={sendMessage} disabled={busy || !message.trim()}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send message
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
