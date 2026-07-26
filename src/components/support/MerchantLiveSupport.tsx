import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, LifeBuoy, Loader2, MessageSquare, Plus, RefreshCw, Send } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type SupportIdentity = {
  userId: string;
  email: string | null;
  fullName: string | null;
  storeId: string;
  roles: string[];
};

type Ticket = {
  id: string;
  ticket_number: number | null;
  subject: string;
  status: string;
  priority: string;
  requester_id: string | null;
  requester_email: string | null;
  chat_status: string | null;
  resolution_summary: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

type Message = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  sender_kind: "merchant" | "admin" | "system" | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  open: "New / open",
  investigating: "Investigating",
  waiting_for_merchant: "Waiting for you",
  resolved: "Resolved",
  closed: "Closed",
};

function priorityVariant(priority: string) {
  return priority === "urgent" ? ("destructive" as const) : ("outline" as const);
}

export function MerchantLiveSupport({ identity }: { identity: SupportIdentity }) {
  const qc = useQueryClient();
  const backTo = identity.roles.includes("owner") ? "/dashboard" : "/pos";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [reply, setReply] = useState("");

  const ticketsQuery = useQuery({
    queryKey: ["pos-live-support-tickets", identity.userId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("support_tickets")
        .select(
          "id,ticket_number,subject,status,priority,requester_id,requester_email,chat_status,resolution_summary,resolution,created_at,updated_at,last_message_at",
        )
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Ticket[];
    },
    refetchInterval: 60_000,
  });

  const selectedTicket = useMemo(
    () => (ticketsQuery.data ?? []).find((ticket) => ticket.id === selectedId) ?? null,
    [selectedId, ticketsQuery.data],
  );

  useEffect(() => {
    if (selectedId && (ticketsQuery.data ?? []).some((ticket) => ticket.id === selectedId)) return;
    const firstActive = (ticketsQuery.data ?? []).find(
      (ticket) => !["resolved", "closed"].includes(ticket.status),
    );
    setSelectedId(firstActive?.id ?? ticketsQuery.data?.[0]?.id ?? null);
  }, [selectedId, ticketsQuery.data]);

  const conversationQuery = useQuery({
    queryKey: ["pos-live-support-conversation", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("support_ticket_notes")
        .select("id,ticket_id,author_id,author_email,body,sender_kind,created_at")
        .eq("ticket_id", selectedId)
        .eq("internal", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      await (supabase.rpc as any)("merchant_mark_support_read", { _ticket_id: selectedId }).catch(
        () => undefined,
      );
      return (data ?? []) as Message[];
    },
    refetchInterval: 60_000,
  });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["pos-live-support-tickets", identity.userId] });
    if (selectedId)
      void qc.invalidateQueries({ queryKey: ["pos-live-support-conversation", selectedId] });
  };

  useEffect(() => {
    const suffix = `${identity.storeId}-${crypto.randomUUID()}`;
    const tickets = supabase
      .channel(`pos-support-ticket-list-${suffix}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_tickets",
          filter: `store_id=eq.${identity.storeId}`,
        },
        refreshAll,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(tickets);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.storeId]);

  useEffect(() => {
    if (!selectedId) return;
    const suffix = `${selectedId}-${crypto.randomUUID()}`;
    const notes = supabase
      .channel(`pos-support-notes-${suffix}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_ticket_notes",
          filter: `ticket_id=eq.${selectedId}`,
        },
        refreshAll,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(notes);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const createTicket = useMutation({
    mutationFn: async () => {
      if (!subject.trim()) throw new Error("Subject is required");
      const { data: ticket, error } = await (supabase.from as any)("support_tickets")
        .insert({
          store_id: identity.storeId,
          requester_id: identity.userId,
          requester_email: identity.email,
          subject: subject.trim(),
          category: "general",
          priority,
          status: "open",
          chat_status: "waiting",
        })
        .select("id")
        .single();
      if (error) throw error;
      if (openingMessage.trim()) {
        const { error: noteError } = await (supabase.from as any)("support_ticket_notes").insert({
          ticket_id: ticket.id,
          author_id: identity.userId,
          author_email: identity.email,
          body: openingMessage.trim(),
          internal: false,
        });
        if (noteError) throw noteError;
      }
      return ticket.id as string;
    },
    onSuccess: (ticketId) => {
      toast.success("Support case created. SEZA can see it now.");
      setSelectedId(ticketId);
      setSubject("");
      setOpeningMessage("");
      setPriority("normal");
      setNewOpen(false);
      refreshAll();
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not create support case"),
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!selectedTicket || !reply.trim()) return;
      if (selectedTicket.status === "closed")
        throw new Error("This case is closed. Create a new case for a new problem.");
      const { error } = await (supabase.from as any)("support_ticket_notes").insert({
        ticket_id: selectedTicket.id,
        author_id: identity.userId,
        author_email: identity.email,
        body: reply.trim(),
        internal: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReply("");
      refreshAll();
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not send message"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild size="icon" variant="ghost">
              <Link to={backTo as any}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <LifeBuoy className="h-5 w-5 text-primary" /> SEZA Live Support
              </div>
              <div className="text-xs text-muted-foreground">
                Signed in as {identity.fullName || identity.email || "merchant user"}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New problem
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="text-base">Your support cases</CardTitle>
            <CardDescription>
              Cashiers see their own cases. Owners and managers can see their store’s cases.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto">
            {ticketsQuery.isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (ticketsQuery.data ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No cases yet. Report a problem and it will appear immediately for SEZA Admin.
              </div>
            ) : (
              (ticketsQuery.data ?? []).map((ticket) => {
                const active = selectedId === ticket.id;
                return (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedId(ticket.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          #{ticket.ticket_number ?? "—"} · {ticket.subject}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Updated{" "}
                          {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
                        </div>
                      </div>
                      {ticket.chat_status !== "ended" && (
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                          title="Live conversation"
                        />
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
                      <Badge variant="outline">
                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[68vh]">
          {!selectedTicket ? (
            <CardContent className="flex min-h-[68vh] items-center justify-center text-center text-sm text-muted-foreground">
              <div>
                <MessageSquare className="mx-auto mb-3 h-8 w-8" />
                Select a support case or report a new problem.
              </div>
            </CardContent>
          ) : (
            <>
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">
                      CASE #{selectedTicket.ticket_number ?? "—"}
                    </div>
                    <CardTitle>{selectedTicket.subject}</CardTitle>
                    <CardDescription>
                      Opened{" "}
                      {format(new Date(selectedTicket.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={priorityVariant(selectedTicket.priority)}>
                      {selectedTicket.priority}
                    </Badge>
                    <Badge>{STATUS_LABELS[selectedTicket.status] ?? selectedTicket.status}</Badge>
                    <Badge
                      variant={selectedTicket.chat_status === "ended" ? "secondary" : "default"}
                    >
                      {selectedTicket.chat_status === "ended" ? "Chat ended" : "Live chat"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                {(selectedTicket.resolution_summary || selectedTicket.resolution) && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
                    <div className="font-medium text-emerald-700 dark:text-emerald-300">
                      SEZA resolution
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">
                      {selectedTicket.resolution_summary || selectedTicket.resolution}
                    </div>
                  </div>
                )}

                <div className="max-h-[48vh] space-y-3 overflow-y-auto rounded-lg border bg-muted/10 p-3">
                  {conversationQuery.isLoading ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading conversation…
                    </div>
                  ) : (conversationQuery.data ?? []).length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      No messages yet. Explain the problem below.
                    </div>
                  ) : (
                    (conversationQuery.data ?? []).map((message) => {
                      const mine = message.author_id === identity.userId;
                      const fromSeza = message.sender_kind === "admin";
                      const label = mine
                        ? "You"
                        : fromSeza
                          ? "SEZA Support"
                          : message.author_email || "Store team";
                      return (
                        <div
                          key={message.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-xl px-3 py-2 ${mine ? "bg-primary text-primary-foreground" : fromSeza ? "bg-emerald-500/10" : "bg-muted"}`}
                          >
                            <div
                              className={`mb-1 text-[11px] ${mine ? "text-primary-foreground/75" : "text-muted-foreground"}`}
                            >
                              {label} · {format(new Date(message.created_at), "MMM d, h:mm a")}
                            </div>
                            <div className="whitespace-pre-wrap text-sm">{message.body}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedTicket.status === "closed" ? (
                  <div className="rounded-lg bg-muted p-4 text-sm">
                    This case is closed. Report a new problem if help is still needed.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedTicket.chat_status === "ended" && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                        The previous live session ended. Sending a new message reactivates the
                        conversation in SEZA Admin.
                      </div>
                    )}
                    <Textarea
                      rows={4}
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Reply to SEZA Support…"
                    />
                    <Button
                      disabled={!reply.trim() || sendReply.isPending}
                      onClick={() => sendReply.mutate()}
                    >
                      {sendReply.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Send live message
                    </Button>
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </main>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report a problem to SEZA</DialogTitle>
            <DialogDescription>
              The problem appears in Admin immediately and stays active until it is actually
              resolved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Example: Receipt printer stopped working"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent — store cannot operate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>What is happening?</Label>
              <Textarea
                rows={6}
                value={openingMessage}
                onChange={(event) => setOpeningMessage(event.target.value)}
                placeholder="What were you doing, what happened, and what error do you see?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!subject.trim() || createTicket.isPending}
              onClick={() => createTicket.mutate()}
            >
              {createTicket.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send to
              SEZA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { SupportIdentity };
