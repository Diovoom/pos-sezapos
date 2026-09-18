import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  adminListTickets,
  adminCreateTicket,
  adminTicketCounts,
  adminListSupportAgents,
} from "@/lib/admin/admin.functions";
import {
  adminClaimSupportCase,
  adminTransitionSupportCase,
  adminDeleteSupportCase,
} from "@/lib/admin/company-admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { rememberAdminChat } from "@/components/admin/AdminPersistentChat";
import {
  AlertTriangle,
  Inbox,
  Search,
  UserCheck,
  ArrowUpDown,
  ExternalLink,
  PhoneIncoming,
  VolumeX,
  X,
  Trash2,
} from "lucide-react";

const searchSchema = z.object({
  status: fallback(z.string(), "active").default("active"),
  priority: fallback(z.string(), "all").default("all"),
  assignee: fallback(z.string(), "any").default("any"),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "updated_at").default("updated_at"),
  dir: fallback(z.string(), "desc").default("desc"),
  page: fallback(z.number().int(), 1).default(1),
});

export const Route = createFileRoute("/_adminApp/admin/support")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [{ title: "Support  -  SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SupportPage,
});

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-600 border-red-500/30",
  high: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

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

function SupportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/support" });
  const list = useServerFn(adminListTickets);
  const counts = useServerFn(adminTicketCounts);
  const agents = useServerFn(adminListSupportAgents);
  const create = useServerFn(adminCreateTicket);
  const claim = useServerFn(adminClaimSupportCase);
  const transition = useServerFn(adminTransitionSupportCase);
  const deleteCase = useServerFn(adminDeleteSupportCase);
  const qc = useQueryClient();

  const [qLocal, setQLocal] = useState(search.q);
  useEffect(() => setQLocal(search.q), [search.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qLocal !== search.q) {
        navigate({ search: (prev: any) => ({ ...prev, q: qLocal, page: 1 }) });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [qLocal]);

  const countsQ = useQuery({
    queryKey: ["admin_ticket_counts"],
    queryFn: () => counts({}),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const agentsQ = useQuery({
    queryKey: ["admin_support_agents"],
    queryFn: () => agents({}),
  });
  const listQ = useQuery({
    queryKey: ["admin_tickets", search],
    queryFn: () =>
      list({
        data: {
          status: search.status,
          priority: search.priority,
          assignee: search.assignee,
          q: search.q,
          sort: search.sort,
          dir: (search.dir === "asc" ? "asc" : "desc") as "asc" | "desc",
          page: search.page,
          pageSize: 25,
        },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [storeId, setStoreId] = useState("");
  const [incoming, setIncoming] = useState<any | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const seenIncomingRef = useRef(new Set<string>());
  const audioRef = useRef<AudioContext | null>(null);

  async function submit() {
    if (!subject.trim()) {
      toast.error("Subject required");
      return;
    }
    try {
      await create({
        data: { subject, body, priority, storeId: storeId || undefined },
      });
      toast.success("Ticket created");
      setOpen(false);
      setSubject("");
      setBody("");
      setStoreId("");
      qc.invalidateQueries({ queryKey: ["admin_tickets"] });
      qc.invalidateQueries({ queryKey: ["admin_ticket_counts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  function openWorkspace(id: string, finalStatus = false) {
    if (finalStatus) {
      window.location.assign(`/admin/support/${encodeURIComponent(id)}`);
      return;
    }
    rememberAdminChat(id);
  }

  async function claimOne(id: string) {
    try {
      await claim({ data: { ticketId: id } });
      toast.success("Assigned to you");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin_tickets"] }),
        qc.invalidateQueries({ queryKey: ["admin_ticket_counts"] }),
      ]);
      openWorkspace(id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function closeOne(ticket: any) {
    const summary = window.prompt(
      `Close case #${ticket.ticket_number}? Add a short note describing what was fixed:`,
      ticket.resolution_summary || "Issue handled by SEZA Support.",
    );
    if (summary === null) return;
    if (summary.trim().length < 5) {
      toast.error("Add a short resolution note before closing the case");
      return;
    }
    try {
      await transition({
        data: {
          ticketId: ticket.id,
          status: "closed",
          resolutionSummary: summary.trim(),
          resolutionCode: "fixed",
          reason: "Closed from the support queue",
        },
      });
      toast.success("Case closed");
      qc.invalidateQueries({ queryKey: ["admin_tickets"] });
      qc.invalidateQueries({ queryKey: ["admin_ticket_counts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not close case");
    }
  }

  async function deleteOne(ticket: any) {
    if (!window.confirm(`Permanently delete closed case #${ticket.ticket_number}?`)) return;
    try {
      await deleteCase({ data: { ticketId: ticket.id } });
      toast.success("Closed case deleted");
      qc.invalidateQueries({ queryKey: ["admin_tickets"] });
      qc.invalidateQueries({ queryKey: ["admin_ticket_counts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete case");
    }
  }

  const c = countsQ.data ?? ({} as Record<string, number>);
  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 25));

  useEffect(() => {
    if (!alertsEnabled || silenced || incoming) return;
    const candidate = rows.find((ticket: any) => {
      const source = String(ticket.source ?? "").toLowerCase();
      const subject = String(ticket.subject ?? "").toLowerCase();
      return (
        !ticket.assigned_admin_id &&
        !seenIncomingRef.current.has(ticket.id) &&
        (source.includes("website") ||
          subject.includes("live chat") ||
          subject.includes("consultation"))
      );
    });
    if (!candidate) return;
    seenIncomingRef.current.add(candidate.id);
    setIncoming(candidate);
    try {
      const context = audioRef.current ?? new AudioContext();
      audioRef.current = context;
      const ring = () => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 760;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.5);
      };
      ring();
      const timer = window.setInterval(ring, 1200);
      const stop = window.setTimeout(() => window.clearInterval(timer), 12000);
      return () => {
        window.clearInterval(timer);
        window.clearTimeout(stop);
      };
    } catch {
      return;
    }
  }, [rows, alertsEnabled, silenced, incoming]);

  async function acceptIncoming() {
    if (!incoming) return;
    const ticket = incoming;
    setIncoming(null);
    await claimOne(ticket.id);
  }

  const toggleSort = (col: string) => {
    navigate({
      search: (prev: any) => ({
        ...prev,
        sort: col,
        dir: prev.sort === col && prev.dir === "desc" ? "asc" : "desc",
        page: 1,
      }),
    });
  };

  return (
    <div className="space-y-6">
      {incoming && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-blue-200 bg-white shadow-2xl">
            <div className="bg-blue-800 px-6 py-7 text-center text-white">
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-white/15 animate-pulse">
                <PhoneIncoming className="size-8" />
              </div>
              <div className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-blue-100">
                Incoming SEZA support request
              </div>
              <h2 className="mt-2 text-2xl font-black">
                {incoming.visitor_name || incoming.subject || "Website visitor"}
              </h2>
              <p className="mt-2 line-clamp-3 text-sm text-blue-50">
                {incoming.problem_preview || "A customer is waiting for help."}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 p-5">
              <Button variant="outline" onClick={() => setIncoming(null)}>
                Decline
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSilenced(true);
                  setIncoming(null);
                }}
              >
                <VolumeX className="mr-1 size-4" /> Silence
              </Button>
              <Button onClick={() => void acceptIncoming()}>Accept</Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Support</h1>
          <p className="text-sm text-muted-foreground">
            Queue and case management for merchant tickets.
          </p>
        </div>
        <div className="flex gap-2">
          {!alertsEnabled && (
            <Button
              variant="outline"
              onClick={() => {
                setAlertsEnabled(true);
                setSilenced(false);
              }}
            >
              Enable support alerts
            </Button>
          )}
          <Button onClick={() => setOpen(true)}>New ticket</Button>
        </div>
      </div>

      {/* Queue chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QueueChip
          label="My open"
          value={c.mine ?? 0}
          icon={<UserCheck className="h-4 w-4" />}
          active={search.assignee === "me"}
          onClick={() =>
            navigate({
              search: (prev: any) => ({ ...prev, assignee: "me", status: "active", page: 1 }),
            })
          }
        />
        <QueueChip
          label="Unassigned"
          value={c.unassigned ?? 0}
          icon={<Inbox className="h-4 w-4" />}
          active={search.assignee === "unassigned"}
          onClick={() =>
            navigate({
              search: (prev: any) => ({
                ...prev,
                assignee: "unassigned",
                status: "active",
                page: 1,
              }),
            })
          }
        />
        <QueueChip
          label="Urgent active"
          value={c.urgent ?? 0}
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          active={search.priority === "urgent"}
          onClick={() =>
            navigate({
              search: (prev: any) => ({
                ...prev,
                priority: "urgent",
                status: "active",
                page: 1,
              }),
            })
          }
        />
        <QueueChip
          label="All tickets"
          value={c.all ?? 0}
          icon={<Search className="h-4 w-4" />}
          active={search.assignee === "any" && search.priority === "all" && search.status === "all"}
          onClick={() =>
            navigate({
              search: (prev: any) => ({
                ...prev,
                assignee: "any",
                priority: "all",
                status: "all",
                page: 1,
              }),
            })
          }
        />
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 border-b">
        {[
          ["active", "Active work"],
          ["open", "New / open"],
          ["investigating", "Investigating"],
          ["waiting_for_merchant", "Waiting"],
          ["resolved", "Resolved"],
          ["closed", "Closed"],
          ["all", "All"],
        ].map(([val, label]) => (
          <button
            key={val}
            onClick={() =>
              navigate({
                search: (prev: any) => ({
                  ...prev,
                  status: val,
                  priority: ["resolved", "closed", "all"].includes(val) ? "all" : prev.priority,
                  assignee: ["resolved", "closed"].includes(val) ? "any" : prev.assignee,
                  page: 1,
                }),
              })
            }
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              search.status === val
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {val !== "all" && c[val] !== undefined && (
              <span className="ml-1.5 text-xs text-muted-foreground">({c[val]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search subject or email…"
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
          />
        </div>
        <Select
          value={search.priority}
          onValueChange={(v) =>
            navigate({ search: (prev: any) => ({ ...prev, priority: v, page: 1 }) })
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={search.assignee}
          onValueChange={(v) =>
            navigate({ search: (prev: any) => ({ ...prev, assignee: v, page: 1 }) })
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any assignee</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {(agentsQ.data ?? []).map((a: any) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mobile support cards */}
      <div className="space-y-3 md:hidden">
        {listQ.isLoading ? (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">Loading…</CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No tickets match these filters.
            </CardContent>
          </Card>
        ) : (
          rows.map((ticket: any) => {
            const finalStatus = ticket.status === "resolved" || ticket.status === "closed";
            return (
              <Card
                key={ticket.id}
                className="overflow-hidden cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/10"
                role="button"
                tabIndex={0}
                onClick={() => openWorkspace(ticket.id, finalStatus)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openWorkspace(ticket.id, finalStatus);
                  }
                }}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-muted-foreground">
                        CASE #{ticket.ticket_number}
                      </div>
                      <div className="mt-1 font-semibold" data-no-translate>
                        {ticket.subject}
                      </div>
                    </div>
                    <Badge variant={ticket.status === "resolved" ? "default" : "outline"}>
                      {STATUS_LABELS[ticket.status] ?? ticket.status}
                    </Badge>
                  </div>
                  <div
                    className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground"
                    data-no-translate
                  >
                    {ticket.problem_preview || "The merchant did not include an opening message."}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {!finalStatus && (
                      <Badge variant="outline" className={PRIORITY_COLOR[ticket.priority] ?? ""}>
                        {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {ticket.store_name ? (
                        <span data-no-translate>{ticket.store_name}</span>
                      ) : (
                        "No business attached"
                      )}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!ticket.assigned_admin_id && !finalStatus) void claimOne(ticket.id);
                        else
                          openWorkspace(ticket.id, finalStatus);
                      }}
                    >
                      {!ticket.assigned_admin_id && !finalStatus ? "Claim & open" : "Open workspace"}
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                    {!finalStatus && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="Close case"
                        aria-label="Close case"
                        onClick={(event) => {
                          event.stopPropagation();
                          void closeOne(ticket);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {ticket.status === "closed" && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        title="Delete conversation"
                        aria-label="Delete conversation"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteOne(ticket);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Desktop support table */}
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          {listQ.isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-sm text-muted-foreground text-center">
              No tickets match these filters.
            </div>
          ) : (
            <table className="w-full text-sm min-w-[840px]">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-3">#</th>
                  <th className="p-3">Subject</th>
                  <th className="p-3">Business</th>
                  <th className="p-3">Assignee</th>
                  <th className="p-3">
                    <button
                      onClick={() => toggleSort("priority")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      Priority <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="p-3">Status</th>
                  <th className="p-3">
                    <button
                      onClick={() => toggleSort("updated_at")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      Age <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ticket: any) => {
                  const finalStatus = ticket.status === "resolved" || ticket.status === "closed";
                  return (
                    <tr
                      key={ticket.id}
                      className="border-t hover:bg-muted/20 cursor-pointer"
                      tabIndex={0}
                      onClick={() =>
                        openWorkspace(ticket.id, finalStatus)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openWorkspace(ticket.id, finalStatus);
                        }
                      }}
                    >
                      <td className="p-3 font-mono text-xs">{ticket.ticket_number}</td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openWorkspace(ticket.id, finalStatus);
                          }}
                          className="font-medium text-primary hover:underline"
                          data-no-translate
                        >
                          {ticket.subject}
                        </button>
                        {ticket.problem_preview && (
                          <div
                            className="mt-1 max-w-md truncate text-xs text-muted-foreground"
                            data-no-translate
                          >
                            {ticket.problem_preview}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {ticket.store_id ? (
                          <Link
                            to="/admin/businesses/$storeId"
                            params={{ storeId: ticket.store_id }}
                            className="hover:underline"
                            data-no-translate
                          >
                            {ticket.store_name ?? ticket.store_id.slice(0, 8)}
                          </Link>
                        ) : (
                          " - "
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {ticket.assignee_name ? (
                          <span data-no-translate>{ticket.assignee_name}</span>
                        ) : (
                          <span className="italic text-muted-foreground">Unassigned</span>
                        )}
                      </td>
                      <td className="p-3">
                        {finalStatus ? (
                          <span className="text-muted-foreground"> - </span>
                        ) : (
                          <Badge
                            variant="outline"
                            className={PRIORITY_COLOR[ticket.priority] ?? ""}
                          >
                            {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant={ticket.status === "resolved" ? "default" : "outline"}>
                          {STATUS_LABELS[ticket.status] ?? ticket.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!ticket.assigned_admin_id && !finalStatus) void claimOne(ticket.id);
                              else
                                openWorkspace(ticket.id, finalStatus);
                            }}
                          >
                            {!ticket.assigned_admin_id && !finalStatus ? "Claim & open" : "Open workspace"}
                          </Button>
                          {!finalStatus && (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              title="Close case"
                              aria-label="Close case"
                              onClick={(event) => {
                                event.stopPropagation();
                                void closeOne(ticket);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          {ticket.status === "closed" && (
                            <Button
                              type="button"
                              size="icon"
                              variant="destructive"
                              title="Delete conversation"
                              aria-label="Delete conversation"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteOne(ticket);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {total} ticket{total === 1 ? "" : "s"} · page {search.page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={search.page <= 1}
            onClick={() => navigate({ search: (prev: any) => ({ ...prev, page: prev.page - 1 }) })}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={search.page >= pageCount}
            onClick={() => navigate({ search: (prev: any) => ({ ...prev, page: prev.page + 1 }) })}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label>Business ID (optional)</Label>
              <Input
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="uuid"
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QueueChip({
  label,
  value,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-lg border transition-colors ${
        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </button>
  );
}
