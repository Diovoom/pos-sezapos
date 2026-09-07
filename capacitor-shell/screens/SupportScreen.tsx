// Android Support Center — list, create, detail, and follow-up messages.
//
// Reuses the production `support_tickets` and `support_ticket_notes` tables
// under existing RLS (store_id = current_store_id AND requester = auth.uid()
// for writes; store-scoped SELECT for reads). Merchant-visible messages are
// inserted with `internal = false`; internal admin notes (internal = true)
// are filtered out on the client so they never surface in the APK.
import { nativeFetch, userSafeNetworkMessage } from "../lib/nativeHttp";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { API_BASE_URL, getBearer } from "../supabase";
import { useMe } from "@/hooks/useMe";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Clock,
  Loader2,
  LifeBuoy,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { collectDiagnostics, formatDiagnosticsBlock } from "../support/diagnostics";
import { useBackHandler } from "../lifecycle/useBackHandler";
import { registerBackHandler } from "../lifecycle/backButtonCoordinator";
import { SupportErrorBoundary } from "./SupportErrorBoundary";
import { useOnline } from "@/lib/offline/useOnline";

type TicketStatus = "open" | "in_progress" | "waiting_customer" | "waiting_support" | "resolved" | "closed" | string;
type TicketPriority = "low" | "normal" | "high" | "urgent" | string;

type TicketRow = {
  id: string;
  ticket_number: number | null;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  requester_id: string | null;
  created_at: string;
  updated_at: string;
};

type NoteRow = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  internal: boolean;
  created_at: string;
};

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "login", label: "Login / access" },
  { value: "register", label: "Register / POS screen" },
  { value: "sale", label: "Sale" },
  { value: "payment", label: "Payment" },
  { value: "refund", label: "Refund or void" },
  { value: "printer", label: "Printer" },
  { value: "scanner", label: "Scanner" },
  { value: "cash_drawer", label: "Cash drawer" },
  { value: "customer_display", label: "Customer display" },
  { value: "inventory", label: "Inventory" },
  { value: "shift", label: "Shift / time clock" },
  { value: "offline", label: "Offline / sync" },
  { value: "employee", label: "Employee / permissions" },
  { value: "reports", label: "Reports" },
  { value: "device", label: "Device / Android" },
  { value: "performance", label: "App performance" },
  { value: "general", label: "Other" },
];

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  investigating: "In progress",
  waiting_customer: "Waiting on you",
  waiting_for_merchant: "Waiting on you",
  waiting_support: "Waiting on support",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

function statusVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "resolved" || s === "closed") return "outline";
  if (s === "waiting_customer") return "destructive";
  if (s === "in_progress" || s === "waiting_support") return "secondary";
  return "default";
}

const DRAFT_KEY = "seza.support.draft.v1";
const READ_KEY = "seza.support.readAt.v1";
const OPEN_STATUSES = [
  "open",
  "in_progress",
  "investigating",
  "waiting_customer",
  "waiting_for_merchant",
  "waiting_support",
];
const CLOSED_STATUSES = ["resolved", "closed"];

async function postSupportTicket(payload: Record<string, unknown>) {
  const token = await getBearer();
  if (!token) throw new Error("Your session has expired. Sign in again.");
  const response = await nativeFetch(`${API_BASE_URL}/api/public/pos/support-ticket`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const raw = typeof data?.error === "string" ? data.error : "";
    const technical = /duplicate key|unique constraint|violates|postgres|supabase|pgrst|relation|column|sqlstate|uuid|permission denied|syntax error/i.test(raw);
    throw new Error(technical ? "SEZA Support could not complete that request. Please try again." : (raw || userSafeNetworkMessage()));
  }
  return data as { ok: true; id?: string; ticketNumber?: number | null; reopened?: boolean };
}

function loadDraft(): { subject: string; category: string; priority: string; body: string; includeDiag: boolean } {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) throw new Error("no draft");
    const p = JSON.parse(raw);
    return {
      subject: typeof p.subject === "string" ? p.subject : "",
      category: typeof p.category === "string" ? p.category : "general",
      priority: typeof p.priority === "string" ? p.priority : "normal",
      body: typeof p.body === "string" ? p.body : "",
      includeDiag: !!p.includeDiag,
    };
  } catch {
    return { subject: "", category: "general", priority: "normal", body: "", includeDiag: false };
  }
}

function saveDraft(d: { subject: string; category: string; priority: string; body: string; includeDiag: boolean }) {
  try {
    if (!d.subject && !d.body) {
      localStorage.removeItem(DRAFT_KEY);
    } else {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    }
  } catch { /* storage unavailable */ }
}

function loadReadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}

function markRead(ticketId: string, at: string) {
  try {
    const m = loadReadMap();
    m[ticketId] = at;
    localStorage.setItem(READ_KEY, JSON.stringify(m));
  } catch { /* noop */ }
}

// -----------------------------------------------------------------------
// Root screen (list <-> detail via internal view state).
// -----------------------------------------------------------------------

export function SupportScreen() {
  return (
    <SupportErrorBoundary>
      <SupportScreenInner />
    </SupportErrorBoundary>
  );
}

function SupportScreenInner() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Android back button — while a ticket is open, back returns to the list
  // instead of closing the app.
  useBackHandler(
    50, // Screen-level priority
    () => {
      if (selectedId) {
        setSelectedId(null);
        return true;
      }
      return false;
    },
    !!selectedId,
  );

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] pb-24">
      {selectedId ? (
        <TicketDetail id={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        <TicketList onOpen={(id) => setSelectedId(id)} />
      )}
    </div>
  );
}


// -----------------------------------------------------------------------
// LIST + CREATE
// -----------------------------------------------------------------------

function TicketList({ onOpen }: { onOpen: (id: string) => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const storeId = me.data?.store?.id as string | undefined;
  const userId = me.data?.user?.id as string | undefined;
  const [showCreate, setShowCreate] = useState(() => {
    try {
      const open = localStorage.getItem("seza.support.openCreate") === "1";
      if (open) localStorage.removeItem("seza.support.openCreate");
      return open;
    } catch {
      return false;
    }
  });

  const listQuery = useQuery({
    queryKey: ["shell", "support", "tickets", storeId ?? "none"],
    enabled: !!storeId,
    queryFn: async (): Promise<TicketRow[]> => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, ticket_number, subject, category, status, priority, requester_id, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as TicketRow[];
    },
  });

  // Realtime — refresh list on any ticket change scoped to this store.
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`shell-support-list-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets", filter: `store_id=eq.${storeId}` },
        () => qc.invalidateQueries({ queryKey: ["shell", "support", "tickets", storeId] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_notes" },
        (payload) => {
          const note = payload.new as NoteRow;
          if (note.internal) return;
          if (note.author_id && note.author_id === userId) return;
          const t = listQuery.data?.find((x) => x.id === note.ticket_id);
          if (!t) {
            // Refresh in case the ticket became visible.
            qc.invalidateQueries({ queryKey: ["shell", "support", "tickets", storeId] });
            return;
          }
          toast.message(`New reply on #${t.ticket_number ?? "—"}`, {
            description: t.subject,
            action: { label: "Open", onClick: () => onOpen(t.id) },
          });
          qc.invalidateQueries({ queryKey: ["shell", "support", "tickets", storeId] });
          qc.invalidateQueries({ queryKey: ["shell", "support", "notes", note.ticket_id] });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [storeId, userId, qc, listQuery.data, onOpen]);

  const readMap = loadReadMap();
  const tickets = listQuery.data ?? [];
  const openTickets = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
  const closedTickets = tickets.filter((t) => CLOSED_STATUSES.includes(t.status));

  if (me.isLoading || !storeId) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading support…
      </div>
    );
  }

  if (showCreate) {
    return (
      <CreateTicketForm
        storeId={storeId}
        userId={userId!}
        onCancel={() => setShowCreate(false)}
        onCreated={(id) => {
          setShowCreate(false);
          qc.invalidateQueries({ queryKey: ["shell", "support", "tickets", storeId] });
          onOpen(id);
        }}
      />
    );
  }

  return (
    <div className="min-h-full w-full">
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4 pb-28">
      <PageHeader title="Support" subtitle="Contact SEZA Support and follow up on your tickets." />

      <div className="flex items-center gap-2">
        <Button onClick={() => setShowCreate(true)} className="min-h-11">
          <Plus className="mr-2 size-4" /> New ticket
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => listQuery.refetch()}
          disabled={listQuery.isFetching}
          aria-label="Refresh tickets"
        >
          <RefreshCw className={"size-4 " + (listQuery.isFetching ? "animate-spin" : "")} />
        </Button>
      </div>

      {listQuery.isError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load tickets</AlertTitle>
          <AlertDescription>
            Check your connection and try again.
          </AlertDescription>
        </Alert>
      )}

      {listQuery.isLoading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading tickets…
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <LifeBuoy className="size-8 mx-auto text-muted-foreground" />
            <div className="font-medium">No tickets yet</div>
            <div className="text-sm text-muted-foreground">
              Tap “New ticket” to send a message to SEZA Support.
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <TicketGroup title="Active" tickets={openTickets} readMap={readMap} onOpen={onOpen} />
          <TicketGroup title="Closed" tickets={closedTickets} readMap={readMap} onOpen={onOpen} muted />
        </>
      )}
      </div>
    </div>
  );
}

function TicketGroup({
  title, tickets, readMap, onOpen, muted,
}: {
  title: string;
  tickets: TicketRow[];
  readMap: Record<string, string>;
  onOpen: (id: string) => void;
  muted?: boolean;
}) {
  if (tickets.length === 0) return null;
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className={"text-sm font-medium " + (muted ? "text-muted-foreground" : "")}>
          {title} · {tickets.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {tickets.map((t) => {
            const readAt = readMap[t.id];
            const unread = !readAt || new Date(readAt).getTime() < new Date(t.updated_at).getTime();
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className="w-full text-left p-3 min-h-14 flex items-center gap-3 hover:bg-muted/40 active:bg-muted/60 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{t.ticket_number ?? "—"}</span>
                      {unread && !CLOSED_STATUSES.includes(t.status) && (
                        <span className="inline-block size-2 rounded-full bg-primary" aria-label="Unread updates" />
                      )}
                    </div>
                    <div className="font-medium truncate">{t.subject}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="size-3" />
                      Updated {new Date(t.updated_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={statusVariant(t.status)}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
                    {t.priority !== "normal" && (
                      <Badge variant="outline" className="text-[10px]">{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
                    )}
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------
// CREATE FORM
// -----------------------------------------------------------------------

function CreateTicketForm({
  storeId, userId, onCancel, onCreated,
}: {
  storeId: string;
  userId: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const initial = useMemo(() => loadDraft(), []);
  const [subject, setSubject] = useState(initial.subject);
  const [category, setCategory] = useState(initial.category);
  const [priority, setPriority] = useState(initial.priority);
  const [body, setBody] = useState(initial.body);
  const [includeDiag, setIncludeDiag] = useState(initial.includeDiag);
  useEffect(() => {
    try {
      localStorage.removeItem("seza.support.screenShareIntent");
    } catch {
      // Storage is optional; support remains available.
    }
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Persist draft as the user types.
  useEffect(() => {
    saveDraft({ subject, category, priority, body, includeDiag });
  }, [subject, category, priority, body, includeDiag]);

  // Back button: confirm discard when there is unsaved content.
  useEffect(() => {
    const off = registerBackHandler(70, () => {
      if (submittedRef.current) return false;
      if (!subject && !body) { onCancel(); return true; }
      const ok = window.confirm("Discard this ticket draft?");
      if (ok) {
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
        onCancel();
      }
      return true;
    });
    return off;
  }, [subject, body, onCancel]);

  const online = useOnline();

  async function submit() {
    if (submitting) return;
    const s = subject.trim();
    const b = body.trim();
    if (!s || !b) {
      toast.error("Subject and description are required");
      return;
    }
    if (!online) {
      toast.error("You need internet to submit a support ticket. Your draft is saved.");
      return;
    }
    setSubmitting(true);
    try {
      let messageBody = b.slice(0, 4000);
      if (includeDiag) {
        try {
          const diag = await collectDiagnostics({
            route: window.location.pathname,
            storeId,
            employeeId: userId,
          });
          messageBody = `${messageBody}\n${formatDiagnosticsBlock(diag)}`.slice(0, 4000);
        } catch { /* diagnostics best-effort */ }
      }

      const ticket = await postSupportTicket({
        action: "create",
        subject: s,
        body: messageBody,
        category,
        priority,
      });
      if (!ticket.id) throw new Error("Support case was not created");

      submittedRef.current = true;
      try {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem("seza.support.screenShareIntent");
      } catch { /* noop */ }
      toast.success(`Support request #${ticket.ticketNumber ?? ""} sent`);
      onCreated(ticket.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Support request could not be sent.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full w-full">
      <div>
        {/* Extra mobile bottom space prevents the fixed action row from
            covering diagnostics or the final text field. */}
        <div className="max-w-2xl mx-auto w-full p-4 md:p-6 space-y-4 pb-28 md:pb-6">

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} className="min-h-11">
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
      </div>
      <PageHeader
        title="New support request"
        subtitle="Tell us what's happening. We'll reply here."
      />

      {!online && (
        <Alert>
          <WifiOff className="size-4" />
          <AlertTitle>You're offline</AlertTitle>
          <AlertDescription>
            Your draft is saved on this device. Reconnect to send it.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Card reader keeps disconnecting"
              className="min-h-11"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="cat" className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pri">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="pri" className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent — store down</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Description</Label>
            <Textarea
              id="body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              placeholder="What happened? What did you expect? Include any error messages."
            />
            <div className="text-[11px] text-muted-foreground text-right">{body.length}/5000</div>
          </div>

          <div className="rounded-lg border p-3 flex items-start gap-3">
            <ShieldCheck className="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="diag" className="text-sm">Include device details</Label>
                <Switch id="diag" checked={includeDiag} onCheckedChange={setIncludeDiag} />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Shares basic device and connection information with SEZA Support to help resolve the issue.
                Payment card data and employee PINs are never included.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
        </div>
      </div>

      {/* On Android the POS navigation is fixed at the bottom of the WebView.
          A normal/sticky footer can therefore render underneath it. Pin the
          action row immediately above that nav on mobile; keep it in-flow on
          desktop. Android adjustResize moves it above the keyboard. */}
      <div
        className="shrink-0 border-t bg-background"
      >
        <div className="max-w-2xl mx-auto w-full px-4 pt-3 pb-2 flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting} className="min-h-12">
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !subject.trim() || !body.trim() || !online}
            className="min-h-12 flex-1 text-base font-semibold"
          >
            {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
            {submitting ? "Sending…" : "Send Support Request"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// DETAIL + REPLY
// -----------------------------------------------------------------------

function TicketDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const me = useMe();
  const userId = me.data?.user?.id as string | undefined;
  const storeId = me.data?.store?.id as string | undefined;
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);

  const ticketQ = useQuery({
    queryKey: ["shell", "support", "ticket", id],
    queryFn: async (): Promise<TicketRow | null> => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, ticket_number, subject, category, status, priority, requester_id, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as TicketRow) ?? null;
    },
  });

  const notesQ = useQuery({
    queryKey: ["shell", "support", "notes", id],
    queryFn: async (): Promise<NoteRow[]> => {
      const { data, error } = await supabase
        .from("support_ticket_notes")
        .select("id, ticket_id, author_id, author_email, body, internal, created_at")
        .eq("ticket_id", id)
        .eq("internal", false) // never surface admin-internal notes in the APK
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });

  // Realtime — refresh conversation on new notes / status changes.
  useEffect(() => {
    const channel = supabase
      .channel(`shell-support-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_ticket_notes", filter: `ticket_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["shell", "support", "notes", id] }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["shell", "support", "ticket", id] }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, qc]);

  // Mark ticket as read when notes settle.
  const notesLoaded = !notesQ.isLoading && !!ticketQ.data;
  useEffect(() => {
    if (notesLoaded && ticketQ.data) {
      markRead(ticketQ.data.id, ticketQ.data.updated_at);
    }
  }, [notesLoaded, ticketQ.data]);

  // Auto-scroll to newest message when the count changes.
  const count = notesQ.data?.length ?? 0;
  useEffect(() => {
    if (scrollBottomRef.current) scrollBottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count]);

  const closed = ticketQ.data ? CLOSED_STATUSES.includes(ticketQ.data.status) : false;
  const online = useOnline();

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!userId || !storeId) throw new Error("Not signed in");
      const b = reply.trim();
      if (!b) throw new Error("Message is empty");
      await postSupportTicket({
        action: "reply",
        ticketId: id,
        body: b.slice(0, 4000),
      });
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["shell", "support", "notes", id] });
      qc.invalidateQueries({ queryKey: ["shell", "support", "ticket", id] });
      if (storeId) qc.invalidateQueries({ queryKey: ["shell", "support", "tickets", storeId] });
    },
    onError: () => toast.error("Message could not be sent. Please try again."),
    onSettled: () => setSending(false),
  });

  // IMPORTANT: this useMutation MUST be declared before any early return so the
  // hook order stays stable across loading → error → success renders. Placing
  // it below the early returns caused React error #310 ("Rendered fewer hooks
  // than expected") whenever the ticket query resolved after loading.
  const closeTicket = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("merchant_update_support_ticket", {
        _ticket_id: id,
        _status: "resolved",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket closed");
      qc.invalidateQueries({ queryKey: ["shell", "support", "ticket", id] });
      if (storeId) qc.invalidateQueries({ queryKey: ["shell", "support", "tickets", storeId] });
    },
    onError: () => toast.error("Support request could not be closed. Please try again."),
  });

  async function onSend() {
    if (sending || !reply.trim() || closed) return;
    if (!online) { toast.error("You're offline — can't send yet."); return; }
    setSending(true);
    sendReply.mutate();
  }

  if (ticketQ.isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading ticket…
      </div>
    );
  }

  if (ticketQ.isError || !ticketQ.data) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="min-h-11">
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Ticket not available</AlertTitle>
          <AlertDescription>You may not have access to this ticket, or it no longer exists.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const t = ticketQ.data;
  const notes = notesQ.data ?? [];


  return (
    <div className="min-h-full max-w-2xl mx-auto w-full pb-24">
      <div className="p-3 md:p-4 border-b flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur z-10">
        <Button variant="ghost" size="sm" onClick={onBack} className="min-h-11" aria-label="Back to tickets">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted-foreground">#{t.ticket_number ?? "—"} · {CATEGORIES.find(c => c.value === t.category)?.label ?? t.category}</div>
          <div className="font-medium truncate">{t.subject}</div>
        </div>
        <Badge variant={statusVariant(t.status)}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
        {!closed && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-9"
            onClick={() => closeTicket.mutate()}
            disabled={closeTicket.isPending}
          >
            {closeTicket.isPending ? <Loader2 className="size-3 animate-spin" /> : "Close"}
          </Button>
        )}
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {notesQ.isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading conversation…
          </div>
        ) : notes.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            Waiting for SEZA Support to reply. Add more detail below if you have it.
          </div>
        ) : (
          notes.map((n) => <MessageBubble key={n.id} note={n} isMine={n.author_id === userId} />)
        )}
        <div ref={scrollBottomRef} />
      </div>

      <div className="border-t bg-background p-3 space-y-2 pb-6">
        {closed ? (
          <div className="text-xs text-muted-foreground text-center py-2">
            This ticket is {STATUS_LABEL[t.status]?.toLowerCase() ?? t.status}. Open a new ticket to continue.
          </div>
        ) : (
          <>
            <Textarea
              rows={2}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={5000}
              placeholder="Type a reply…"
              className="resize-none"
              disabled={sending}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground">
                {!online ? "Offline — can't send yet" : `${reply.length}/5000`}
              </div>
              <Button onClick={onSend} disabled={sending || !reply.trim() || !online} className="min-h-11">
                {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ note, isMine }: { note: NoteRow; isMine: boolean }) {
  const time = new Date(note.created_at).toLocaleString();
  return (
    <div className={"flex " + (isMine ? "justify-end" : "justify-start")}>
      <div className={
        "max-w-[86%] rounded-2xl px-3 py-2 shadow-sm border " +
        (isMine
          ? "bg-primary text-primary-foreground border-primary/20 rounded-br-md"
          : "bg-muted text-foreground border-border rounded-bl-md")
      }>
        <div className={"text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1 " + (isMine ? "opacity-80" : "text-muted-foreground")}>
          <MessageCircle className="size-3" />
          {isMine ? "You" : (note.author_email ?? "SEZA Support")}
          <span>· {time}</span>
        </div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">{note.body}</div>
      </div>
    </div>
  );
}
