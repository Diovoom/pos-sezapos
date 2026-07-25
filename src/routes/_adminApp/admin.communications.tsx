import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  adminEndSupportChat,
  adminListCommunications,
  adminGetSupportCase,
  adminSendSupportMessage,
  adminClaimSupportCase,
  adminMarkCommunicationRead,
} from "@/lib/admin/company-admin.functions";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Search, Send, UserCheck, ExternalLink, RefreshCw, PhoneOff } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ADMIN_ACTIVE_CHAT_KEY, rememberAdminChat } from "@/components/admin/AdminPersistentChat";

export const Route = createFileRoute("/_adminApp/admin/communications")({
  head: () => ({
    meta: [
      { title: "Live Communications — SEZA Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CommunicationsPage,
});

function CommunicationsPage() {
  const list = useServerFn(adminListCommunications);
  const getCase = useServerFn(adminGetSupportCase);
  const send = useServerFn(adminSendSupportMessage);
  const endChat = useServerFn(adminEndSupportChat);
  const claim = useServerFn(adminClaimSupportCase);
  const markRead = useServerFn(adminMarkCommunicationRead);
  const qc = useQueryClient();

  const [view, setView] = useState<"active" | "ended" | "all">("active");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ADMIN_ACTIVE_CHAT_KEY);
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const listQuery = useQuery({
    queryKey: ["admin_communications", view, search],
    queryFn: () => list({ data: { view, search } }),
    refetchInterval: 60_000,
  });

  const rows = listQuery.data?.rows ?? [];
  useEffect(() => {
    if (!selectedId && rows.length) {
      setSelectedId(rows[0].id);
      rememberAdminChat(rows[0].id);
      return;
    }
    if (selectedId && rows.length && !rows.some((row: any) => row.id === selectedId) && view !== "all") {
      const next = rows[0]?.id ?? null;
      setSelectedId(next);
      rememberAdminChat(next);
    }
  }, [rows, selectedId, view]);

  useEffect(() => {
    if (selectedId) rememberAdminChat(selectedId);
  }, [selectedId]);

  const caseQuery = useQuery({
    queryKey: ["admin_support_case", selectedId],
    queryFn: () => getCase({ data: { ticketId: selectedId! } }),
    enabled: !!selectedId,
    refetchInterval: 60_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin_communications"] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["admin_support_case", selectedId] });
    qc.invalidateQueries({ queryKey: ["admin_operations_overview"] });
  };

  useEffect(() => {
    const suffix = crypto.randomUUID();
    const notes = supabaseAdminAuth
      .channel(`admin-communications-notes-${suffix}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_ticket_notes" }, refresh)
      .subscribe();
    const tickets = supabaseAdminAuth
      .channel(`admin-communications-tickets-${suffix}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets" }, refresh)
      .subscribe();
    return () => {
      void supabaseAdminAuth.removeChannel(notes);
      void supabaseAdminAuth.removeChannel(tickets);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void markRead({ data: { ticketId: selectedId } }).then(refresh).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, caseQuery.data?.ticket?.last_message_at]);

  const selected = caseQuery.data;
  const firstProblem = useMemo(() => selected?.problem_message?.body ?? selected?.messages?.[0]?.body ?? null, [selected?.problem_message, selected?.messages]);

  async function sendReply() {
    if (!selectedId || !message.trim()) return;
    setBusy(true);
    try {
      await send({ data: { ticketId: selectedId, body: message, internal: false } });
      setMessage("");
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not send message");
    } finally {
      setBusy(false);
    }
  }


  async function endSelectedChat() {
    if (!selectedId || !selected) return;
    if (!window.confirm("End this live chat? The case and transcript will remain saved.")) return;
    setBusy(true);
    try {
      await endChat({ data: { ticketId: selectedId, reason: "Live chat ended by SEZA Support." } });
      toast.success("Live chat ended");
      rememberAdminChat(null);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not end live chat");
    } finally {
      setBusy(false);
    }
  }

  async function claimSelected() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await claim({ data: { ticketId: selectedId } });
      toast.success("Conversation assigned to you");
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not claim conversation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Communications</h1>
          <p className="text-sm text-muted-foreground">
            Real-time chat with register users and website visitors. An admin can end the live chat without deleting the support case or transcript.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { listQuery.refetch(); caseQuery.refetch(); }}>
          <RefreshCw className={`mr-2 h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid min-h-[650px] overflow-hidden rounded-xl border bg-background lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search merchant or subject…" />
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(["active", "ended", "all"] as const).map((value) => (
                <Button key={value} size="sm" variant={view === value ? "default" : "outline"} onClick={() => { setView(value); setSelectedId(null); }}>
                  {value === "active" ? "Active" : value === "ended" ? "Ended" : "All"}
                </Button>
              ))}
            </div>
          </div>
          <div className="max-h-[570px] overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading live conversations…</div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {view === "active" ? "No active chats. New merchant messages will appear here." : "No conversations match."}
              </div>
            ) : rows.map((row: any) => (
              <button
                key={row.id}
                type="button"
                onClick={() => { setSelectedId(row.id); rememberAdminChat(row.id); }}
                className={`w-full border-b p-3 text-left transition-colors ${selectedId === row.id ? "bg-primary/5" : "hover:bg-muted/40"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium" data-no-translate>{row.visitor_name ?? row.store?.name ?? row.requester_email ?? "Merchant"}</div>
                    <div className="truncate text-sm" data-no-translate>{row.subject}</div>
                  </div>
                  {row.unread && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground" data-no-translate>{row.last_message?.body ?? "Ticket opened—waiting for the first message"}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    <Badge variant={row.chat_status === "ended" ? "secondary" : "default"}>{row.chat_status}</Badge>
                    <Badge variant="outline">{row.status}</Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {row.last_message_at ? formatDistanceToNow(new Date(row.last_message_at), { addSuffix: true }) : formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center text-muted-foreground">
              <MessageSquare className="mb-3 h-10 w-10" />
              <div className="font-medium text-foreground">Select a merchant conversation</div>
              <div className="text-sm">Messages and case information will appear here.</div>
            </div>
          ) : caseQuery.isLoading || !selected ? (
            <div className="p-8 text-sm text-muted-foreground">Loading conversation…</div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                <div>
                  <div className="font-semibold" data-no-translate>{selected.ticket.visitor_name ?? selected.store?.name ?? selected.ticket.requester_email ?? "Merchant"}</div>
                  <div className="text-sm" data-no-translate>{selected.ticket.subject}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline">#{selected.ticket.ticket_number}</Badge>
                    <Badge variant={selected.ticket.chat_status === "ended" ? "secondary" : "default"}>{selected.ticket.chat_status}</Badge>
                    <Badge variant="outline">{selected.ticket.status}</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!selected.ticket.assigned_admin_id && (
                    <Button size="sm" variant="outline" onClick={claimSelected} disabled={busy}><UserCheck className="mr-1 h-4 w-4" /> Claim</Button>
                  )}
                  {selected.ticket.chat_status !== "ended" && (
                    <Button size="sm" variant="destructive" onClick={() => void endSelectedChat()} disabled={busy}><PhoneOff className="mr-1 h-4 w-4" /> End chat</Button>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link to="/admin/support/$ticketId" params={{ ticketId: selected.ticket.id }}>Full case <ExternalLink className="ml-1 h-3 w-3" /></Link>
                  </Button>
                </div>
              </div>

              <div className="border-b bg-muted/20 p-3 text-sm">
                <span className="font-medium">Original problem: </span><span data-no-translate>{firstProblem || "No opening description."}</span>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {selected.messages.map((item: any) => {
                  const merchant = !item.author_is_platform;
                  return (
                    <div key={item.id} className={`flex ${merchant ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[78%] rounded-xl px-3 py-2 ${merchant ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
                        <div className={`mb-1 text-[11px] ${merchant ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                          {merchant ? (item.author_name || selected.ticket.visitor_name || selected.requester?.full_name || "Merchant") : (item.author_name || item.author_email || "SEZA Support")} · {format(new Date(item.created_at), "MMM d, h:mm a")}
                        </div>
                        <div className="whitespace-pre-wrap text-sm" data-no-translate>{item.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t p-4">
                {selected.ticket.chat_status === "ended" || ["resolved", "closed"].includes(selected.ticket.status) ? (
                  <div className="rounded-lg bg-muted p-4 text-sm">This live chat has ended and the transcript is read-only. Reopen the full case to continue.</div>
                ) : (
                  <div className="flex items-end gap-2">
                    <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Reply live to the merchant…" />
                    <Button onClick={sendReply} disabled={busy || !message.trim()}><Send className="mr-2 h-4 w-4" /> Send</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>


    </div>
  );
}
