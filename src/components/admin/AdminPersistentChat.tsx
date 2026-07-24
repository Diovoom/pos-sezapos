import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  adminEndSupportChat,
  adminGetSupportCase,
  adminListCommunications,
  adminMarkCommunicationRead,
  adminSendSupportMessage,
} from "@/lib/admin/company-admin.functions";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, MessageCircle, Minus, PhoneOff, Send, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const ADMIN_ACTIVE_CHAT_KEY = "seza-admin-active-chat-ticket";
export const ADMIN_CHAT_SELECTION_EVENT = "seza-admin-chat-selected";
const ADMIN_CHAT_READ_KEY = "seza-admin-chat-read-at";

function readStoredTicket() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ADMIN_ACTIVE_CHAT_KEY);
}

function readLocalReadMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(ADMIN_CHAT_READ_KEY) || "{}");
  } catch {
    return {};
  }
}

function rememberLocalRead(ticketId: string, at = new Date().toISOString()) {
  if (typeof window === "undefined") return;
  const map = readLocalReadMap();
  map[ticketId] = at;
  window.localStorage.setItem(ADMIN_CHAT_READ_KEY, JSON.stringify(map));
}

export function rememberAdminChat(ticketId: string | null) {
  if (typeof window === "undefined") return;
  if (ticketId) window.localStorage.setItem(ADMIN_ACTIVE_CHAT_KEY, ticketId);
  else window.localStorage.removeItem(ADMIN_ACTIVE_CHAT_KEY);
  window.dispatchEvent(
    new CustomEvent(ADMIN_CHAT_SELECTION_EVENT, { detail: { ticketId } }),
  );
}

export function AdminPersistentChat() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onFullChatPage =
    pathname === "/admin/communications" || pathname.startsWith("/admin/support/");
  const navigate = useNavigate();
  const list = useServerFn(adminListCommunications);
  const getCase = useServerFn(adminGetSupportCase);
  const sendMessage = useServerFn(adminSendSupportMessage);
  const endChat = useServerFn(adminEndSupportChat);
  const markRead = useServerFn(adminMarkCommunicationRead);
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(() => readStoredTicket());
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [readVersion, setReadVersion] = useState(0);
  const lastPopupRef = useRef<string | null>(null);

  useEffect(() => {
    void supabaseAdminAuth.auth.getUser().then(({ data }) => {
      setAdminUserId(data.user?.id ?? null);
    });
  }, []);

  const listQuery = useQuery({
    queryKey: ["admin_persistent_communications"],
    queryFn: () => list({ data: { view: "active", search: "" } }),
    enabled: !onFullChatPage,
    refetchInterval: onFullChatPage ? false : 20_000,
  });

  const activeRows = listQuery.data?.rows ?? [];
  const localReadMap = useMemo(() => readLocalReadMap(), [readVersion, activeRows.length]);
  const unreadRows = activeRows.filter((row: any) => {
    const messageAt = row.last_message?.created_at ?? row.last_message_at ?? row.updated_at;
    if (!messageAt) return false;
    const localReadAt = localReadMap[row.id];
    if (localReadAt && new Date(localReadAt) >= new Date(messageAt)) return false;
    return Boolean(row.unread);
  });
  const unreadCount = unreadRows.length;

  useEffect(() => {
    const onSelection = (event: Event) => {
      const custom = event as CustomEvent<{ ticketId?: string | null }>;
      setSelectedId(custom.detail?.ticketId ?? readStoredTicket());
    };
    const onStorage = () => setSelectedId(readStoredTicket());
    window.addEventListener(ADMIN_CHAT_SELECTION_EVENT, onSelection as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ADMIN_CHAT_SELECTION_EVENT, onSelection as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (onFullChatPage) return;
    if (!activeRows.length) {
      setSelectedId(null);
      rememberAdminChat(null);
      return;
    }
    const selectedStillActive = selectedId && activeRows.some((row: any) => row.id === selectedId);
    if (selectedStillActive) return;
    const next = unreadRows[0] ?? activeRows[0];
    setSelectedId(next.id);
    rememberAdminChat(next.id);
  }, [activeRows, onFullChatPage, selectedId, unreadRows]);

  const caseQuery = useQuery({
    queryKey: ["admin_support_case", selectedId],
    queryFn: () => getCase({ data: { ticketId: selectedId! } }),
    enabled: Boolean(selectedId) && !onFullChatPage,
    refetchInterval: open && !onFullChatPage ? 10_000 : false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin_persistent_communications"] });
    qc.invalidateQueries({ queryKey: ["admin_communications"] });
    qc.invalidateQueries({ queryKey: ["admin_tickets"] });
    qc.invalidateQueries({ queryKey: ["admin_ticket_counts"] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["admin_support_case", selectedId] });
  };

  useEffect(() => {
    if (onFullChatPage) return;
    const suffix = crypto.randomUUID();
    const notes = supabaseAdminAuth
      .channel(`admin-persistent-chat-notes-${suffix}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_notes" },
        (payload) => {
          const note = payload.new as {
            ticket_id?: string;
            author_id?: string | null;
            author_email?: string | null;
            body?: string;
            created_at?: string;
            internal?: boolean;
          };
          refresh();
          if (
            !note.ticket_id ||
            note.internal ||
            (adminUserId && note.author_id === adminUserId)
          ) {
            return;
          }
          const popupKey = `${note.ticket_id}:${note.created_at ?? note.body ?? ""}`;
          if (lastPopupRef.current === popupKey) return;
          lastPopupRef.current = popupKey;
          setSelectedId(note.ticket_id);
          rememberAdminChat(note.ticket_id);
          setOpen(true);
          toast.message("New merchant support message", {
            description: note.body?.slice(0, 120) || "A merchant sent a new message.",
            action: {
              label: "Open case",
              onClick: () =>
                navigate({
                  to: "/admin/support/$ticketId",
                  params: { ticketId: note.ticket_id! },
                }),
            },
          });
        },
      )
      .subscribe();
    const tickets = supabaseAdminAuth
      .channel(`admin-persistent-chat-tickets-${suffix}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets" },
        refresh,
      )
      .subscribe();
    return () => {
      void supabaseAdminAuth.removeChannel(notes);
      void supabaseAdminAuth.removeChannel(tickets);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUserId, onFullChatPage, selectedId]);

  useEffect(() => {
    if (onFullChatPage || !open || !selectedId) return;
    const latestAt =
      caseQuery.data?.ticket?.last_message_at ??
      caseQuery.data?.ticket?.updated_at ??
      new Date().toISOString();
    rememberLocalRead(selectedId, latestAt);
    setReadVersion((value) => value + 1);
    void markRead({ data: { ticketId: selectedId } })
      .then(refresh)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedId, caseQuery.data?.messages?.length]);

  useEffect(() => {
    const next = unreadRows[0];
    if (!next || onFullChatPage) return;
    const popupKey = `${next.id}:${next.last_message?.created_at ?? next.last_message_at ?? next.updated_at}`;
    if (lastPopupRef.current === popupKey) return;
    lastPopupRef.current = popupKey;
    setSelectedId(next.id);
    rememberAdminChat(next.id);
    setOpen(true);
    toast.message("New merchant support message", {
      description: next.last_message?.body?.slice(0, 120) || next.subject || "A merchant sent a new message.",
      action: {
        label: "Open case",
        onClick: () =>
          navigate({
            to: "/admin/support/$ticketId",
            params: { ticketId: next.id },
          }),
      },
    });
  }, [navigate, pathname, unreadRows]);

  const selectedRow = useMemo(
    () => activeRows.find((row: any) => row.id === selectedId) ?? null,
    [activeRows, selectedId],
  );
  const selected = caseQuery.data;
  const messages = selected?.messages ?? [];

  async function endSelectedChat() {
    if (!selectedId) return;
    const confirmed = window.confirm("End this live chat? The support case and transcript will stay available in Admin.");
    if (!confirmed) return;
    setBusy(true);
    try {
      await endChat({ data: { ticketId: selectedId, reason: "Live chat ended by SEZA Support." } });
      toast.success("Live chat ended");
      setOpen(false);
      rememberAdminChat(null);
      setSelectedId(null);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not end live chat");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!selectedId || !message.trim()) return;
    setBusy(true);
    try {
      await sendMessage({ data: { ticketId: selectedId, body: message, internal: false } });
      setMessage("");
      rememberLocalRead(selectedId);
      setReadVersion((value) => value + 1);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not send message");
    } finally {
      setBusy(false);
    }
  }

  if (onFullChatPage || activeRows.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] max-w-[calc(100vw-2rem)]">
      {open ? (
        <section className="flex h-[min(620px,78vh)] w-[min(410px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <header className="flex items-start justify-between gap-3 border-b bg-primary px-4 py-3 text-primary-foreground">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold">
                <MessageCircle className="h-4 w-4" /> Merchant support
              </div>
              <div className="truncate text-xs text-primary-foreground/80" data-no-translate>
                {selected?.ticket?.visitor_name ?? selectedRow?.visitor_name ?? selected?.store?.name ?? selectedRow?.store?.name ?? selected?.ticket?.requester_email ?? "Merchant"}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
                onClick={() => setOpen(false)}
                aria-label="Minimize"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <div className="space-y-2 border-b bg-muted/30 px-4 py-3">
            <Select
              value={selectedId ?? undefined}
              onValueChange={(ticketId) => {
                setSelectedId(ticketId);
                rememberAdminChat(ticketId);
              }}
            >
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Select a merchant conversation" />
              </SelectTrigger>
              <SelectContent>
                {activeRows.map((row: any) => (
                  <SelectItem key={row.id} value={row.id}>
                    <span data-no-translate>{row.visitor_name ?? row.store?.name ?? row.requester_email ?? "Merchant"} — {row.subject}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap gap-1">
                {selected?.ticket?.ticket_number && (
                  <Badge variant="outline">#{selected.ticket.ticket_number}</Badge>
                )}
                <Badge variant="outline">{selected?.ticket?.status ?? selectedRow?.status ?? "active"}</Badge>
              </div>
              {selectedId && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void endSelectedChat()}
                    disabled={busy}
                  >
                    <PhoneOff className="mr-1 h-3.5 w-3.5" /> End chat
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigate({
                        to: "/admin/support/$ticketId",
                        params: { ticketId: selectedId },
                      })
                    }
                  >
                    Open case <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {caseQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : messages.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                No public messages yet.
              </div>
            ) : (
              messages.map((item: any) => {
                const merchant = !item.author_is_platform;
                return (
                  <div key={item.id} className={`flex ${merchant ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[86%] rounded-xl px-3 py-2 ${
                        merchant ? "bg-muted" : "bg-primary text-primary-foreground"
                      }`}
                    >
                      <div
                        className={`mb-1 text-[11px] ${
                          merchant ? "text-muted-foreground" : "text-primary-foreground/75"
                        }`}
                        data-no-translate
                      >
                        {merchant
                          ? item.author_name || selected?.requester?.full_name || "Merchant"
                          : item.author_name || item.author_email || "SEZA Support"}
                        {" · "}
                        {format(new Date(item.created_at), "MMM d, h:mm a")}
                      </div>
                      <div className="whitespace-pre-wrap text-sm" data-no-translate>
                        {item.body}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <footer className="border-t p-3">
            <Textarea
              rows={2}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Reply live to the merchant…"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="mt-2 flex justify-end">
              <Button onClick={send} disabled={busy || !message.trim()}>
                <Send className="mr-2 h-4 w-4" /> Send
              </Button>
            </div>
          </footer>
        </section>
      ) : (
        <Button
          type="button"
          size="lg"
          className="h-14 rounded-full px-5 shadow-xl"
          onClick={() => setOpen(true)}
          aria-label="Open merchant support"
        >
          <MessageCircle className="mr-2 h-5 w-5" />
          <span className="max-w-[180px] truncate" data-no-translate>
            {selectedRow?.visitor_name ?? selectedRow?.store?.name ?? "Merchant chat"}
          </span>
          {unreadCount > 0 && (
            <span className="ml-2 min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-xs text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
