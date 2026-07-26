import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  RefreshCw,
  Search,
  X,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import {
  adminListDevices,
  adminDeviceCounts,
  adminRenameTerminal,
  adminSetTerminalStatus,
  adminRevokeTerminal,
} from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type DevicesSearch = {
  q: string;
  filter: string;
  provider: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
};

const DEFAULTS: DevicesSearch = {
  q: "",
  filter: "all",
  provider: "all",
  sortBy: "last_seen_at",
  sortDir: "desc",
  page: 1,
  pageSize: 25,
};

export const Route = createFileRoute("/_adminApp/admin/devices")({
  head: () => ({
    meta: [{ title: "Devices — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  validateSearch: (raw: Record<string, unknown>): DevicesSearch => ({
    q: typeof raw.q === "string" ? raw.q : DEFAULTS.q,
    filter: typeof raw.filter === "string" ? raw.filter : DEFAULTS.filter,
    provider: typeof raw.provider === "string" ? raw.provider : DEFAULTS.provider,
    sortBy: typeof raw.sortBy === "string" ? raw.sortBy : DEFAULTS.sortBy,
    sortDir: raw.sortDir === "asc" ? "asc" : "desc",
    page: Number.isFinite(Number(raw.page))
      ? Math.max(1, Math.floor(Number(raw.page)))
      : DEFAULTS.page,
    pageSize: Number.isFinite(Number(raw.pageSize))
      ? Math.floor(Number(raw.pageSize))
      : DEFAULTS.pageSize,
  }),
  component: DevicesPage,
});

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All devices" },
  { value: "online", label: "Online (24h)" },
  { value: "offline", label: "Offline (24h+)" },
  { value: "active", label: "Status: active" },
  { value: "inactive", label: "Status: inactive" },
  { value: "revoked", label: "Status: revoked" },
];

const SORT_COLUMNS: { key: string; label: string }[] = [
  { key: "label", label: "Device" },
  { key: "provider", label: "Provider" },
  { key: "status", label: "Status" },
  { key: "last_seen_at", label: "Last seen" },
  { key: "created_at", label: "Registered" },
];

const PAGE_SIZES = [25, 50, 100];

type DeviceRow = {
  id: string;
  store_id: string | null;
  store_name: string;
  label: string;
  provider: string | null;
  serial: string | null;
  location: string | null;
  status: string;
  last_seen_at: string | null;
  created_at: string;
  has_config: boolean;
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-green-500/15 text-green-700 dark:text-green-400",
    inactive: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    revoked: "bg-red-500/15 text-red-700 dark:text-red-400",
  };
  return map[status] ?? "bg-gray-500/15 text-gray-700";
}

function fmtDateTime(v: string | null | undefined) {
  if (!v) return "never";
  try {
    return format(new Date(v), "MMM d, yyyy HH:mm");
  } catch {
    return "—";
  }
}

function fmtRelative(v: string | null | undefined) {
  if (!v) return "never";
  try {
    return `${formatDistanceToNow(new Date(v))} ago`;
  } catch {
    return "—";
  }
}

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 24 * 3600_000;
}

function DevicesPage() {
  const rawSearch = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();

  const filter = FILTERS.some((f) => f.value === rawSearch.filter) ? rawSearch.filter : "all";
  const sortBy = SORT_COLUMNS.some((c) => c.key === rawSearch.sortBy)
    ? rawSearch.sortBy
    : "last_seen_at";
  const sortDir: "asc" | "desc" = rawSearch.sortDir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Math.min(9999, rawSearch.page || 1));
  const pageSize = PAGE_SIZES.includes(rawSearch.pageSize) ? rawSearch.pageSize : 25;
  const q = (rawSearch.q ?? "").slice(0, 100);
  const provider = (rawSearch.provider ?? "all").slice(0, 40);

  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => {
    setSearchInput(q);
  }, [q]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput === q) return;
      navigate({
        search: (prev: DevicesSearch) => ({ ...prev, q: searchInput, page: 1 }),
        replace: true,
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput, q, navigate]);

  const list = useServerFn(adminListDevices);
  const counts = useServerFn(adminDeviceCounts);

  const query = useQuery({
    queryKey: ["admin_devices", { filter, provider, q, sortBy, sortDir, page, pageSize }],
    queryFn: () => list({ data: { filter, provider, search: q, sortBy, sortDir, page, pageSize } }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const countsQuery = useQuery({
    queryKey: ["admin_device_counts"],
    queryFn: () => counts(),
    staleTime: 30_000,
  });

  const rows = (query.data?.rows ?? []) as unknown as DeviceRow[];
  const total = query.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);

  const setSort = (key: string) => {
    navigate({
      search: (prev: DevicesSearch) => ({
        ...prev,
        sortBy: key,
        sortDir: prev.sortBy === key && prev.sortDir === "desc" ? "asc" : "desc",
        page: 1,
      }),
      replace: true,
    });
  };
  const setFilter = (v: string) => {
    navigate({ search: (prev: DevicesSearch) => ({ ...prev, filter: v, page: 1 }), replace: true });
  };
  const setProvider = (v: string) => {
    navigate({
      search: (prev: DevicesSearch) => ({ ...prev, provider: v, page: 1 }),
      replace: true,
    });
  };
  const setPage = (p: number) => {
    navigate({ search: (prev: DevicesSearch) => ({ ...prev, page: p }), replace: true });
  };
  const setPageSize = (n: number) => {
    navigate({
      search: (prev: DevicesSearch) => ({ ...prev, pageSize: n, page: 1 }),
      replace: true,
    });
  };
  const clearAll = () => {
    setSearchInput("");
    navigate({ search: () => ({ ...DEFAULTS }), replace: true });
  };

  const anyFilter = q !== "" || filter !== "all" || provider !== "all";

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("Nothing to export on this page");
      return;
    }
    const header = [
      "id",
      "label",
      "serial",
      "provider",
      "status",
      "store_id",
      "store_name",
      "location",
      "last_seen_at",
      "created_at",
      "has_config",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      header.join(","),
      ...rows.map((r) => header.map((k) => esc((r as any)[k])).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devices-${filter}-p${page}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (col !== sortBy) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const sortHeader = (col: string, label: string, className = "") => (
    <th className={`p-3 ${className}`}>
      <button
        type="button"
        onClick={() => setSort(col)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground text-left"
      >
        {label} <SortIcon col={col} />
      </button>
    </th>
  );

  const showingLabel = useMemo(() => {
    if (query.isLoading && !query.data) return "Loading…";
    if (total === 0) return "0 results";
    return `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${total.toLocaleString()}`;
  }, [query.isLoading, query.data, total, pageStart, pageEnd]);

  const providers = countsQuery.data?.providers ?? [];

  // Action dialog state
  const [action, setAction] = useState<
    | { kind: "rename"; device: DeviceRow }
    | { kind: "status"; device: DeviceRow; next: "active" | "inactive" }
    | { kind: "revoke"; device: DeviceRow }
    | null
  >(null);

  const closeAction = () => setAction(null);
  const refresh = () => {
    query.refetch();
    queryClient.invalidateQueries({ queryKey: ["admin_device_counts"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Devices</h1>
          <p className="text-sm text-muted-foreground">{showingLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={query.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-2" /> Export CSV (page)
          </Button>
        </div>
      </div>

      {/* Count chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "All", value: countsQuery.data?.all },
          { key: "online", label: "Online", value: countsQuery.data?.online },
          { key: "offline", label: "Offline", value: countsQuery.data?.offline },
          { key: "active", label: "Active", value: countsQuery.data?.active },
          { key: "inactive", label: "Inactive", value: countsQuery.data?.inactive },
          { key: "revoked", label: "Revoked", value: countsQuery.data?.revoked },
        ].map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={`px-3 py-1.5 rounded-full text-xs border transition ${
              filter === chip.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted"
            }`}
          >
            {chip.label} <span className="opacity-70">({chip.value ?? "…"})</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search label, serial, location…"
              className="pl-8 pr-8"
              maxLength={100}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={`${sortBy}:${sortDir}`}
            onValueChange={(v) => {
              const [key, dir] = v.split(":");
              navigate({
                search: (prev: DevicesSearch) => ({
                  ...prev,
                  sortBy: key,
                  sortDir: dir as "asc" | "desc",
                  page: 1,
                }),
                replace: true,
              });
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_COLUMNS.flatMap((c) => [
                <SelectItem key={`${c.key}:desc`} value={`${c.key}:desc`}>
                  {c.label} ↓
                </SelectItem>,
                <SelectItem key={`${c.key}:asc`} value={`${c.key}:asc`}>
                  {c.label} ↑
                </SelectItem>,
              ])}
            </SelectContent>
          </Select>

          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {anyFilter && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {query.isError ? (
            <div className="p-6 text-sm text-destructive space-y-2">
              <p>Failed to load devices: {(query.error as Error).message}</p>
              <Button size="sm" variant="outline" onClick={() => query.refetch()}>
                Retry
              </Button>
            </div>
          ) : query.isLoading && !query.data ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-sm text-muted-foreground text-center space-y-2">
              <div>No devices match your filters.</div>
              {anyFilter && (
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr className="text-left">
                    {sortHeader("label", "Device")}
                    <th className="p-3">Business</th>
                    {sortHeader("provider", "Provider")}
                    {sortHeader("status", "Status")}
                    <th className="p-3">Online</th>
                    {sortHeader("last_seen_at", "Last seen")}
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        <div className="font-medium">{r.label}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {r.serial ?? "no serial"}
                        </div>
                        {r.location && (
                          <div className="text-xs text-muted-foreground">{r.location}</div>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {r.store_id ? (
                          <Link
                            to="/admin/businesses/$storeId"
                            params={{ storeId: r.store_id }}
                            className="text-primary hover:underline"
                          >
                            {r.store_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        <div>{r.provider ?? "—"}</div>
                        {r.has_config && (
                          <div className="text-[10px] text-muted-foreground">configured</div>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge className={statusBadge(r.status)}>{r.status}</Badge>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 text-xs ${
                            isOnline(r.last_seen_at)
                              ? "text-green-600 dark:text-green-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isOnline(r.last_seen_at) ? "bg-green-500" : "bg-muted-foreground/40"
                            }`}
                          />
                          {isOnline(r.last_seen_at) ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="p-3 text-xs" title={fmtDateTime(r.last_seen_at)}>
                        {fmtRelative(r.last_seen_at)}
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => setAction({ kind: "rename", device: r })}
                            >
                              Rename
                            </DropdownMenuItem>
                            {r.status !== "revoked" &&
                              (r.status === "inactive" ? (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setAction({ kind: "status", device: r, next: "active" })
                                  }
                                >
                                  Activate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setAction({ kind: "status", device: r, next: "inactive" })
                                  }
                                >
                                  Deactivate
                                </DropdownMenuItem>
                              ))}
                            {r.status !== "revoked" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => setAction({ kind: "revoke", device: r })}
                                >
                                  Revoke
                                </DropdownMenuItem>
                              </>
                            )}
                            {r.store_id && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link
                                    to="/admin/businesses/$storeId"
                                    params={{ storeId: r.store_id }}
                                  >
                                    Open business
                                  </Link>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              Last
            </Button>
          </div>
        </div>
      )}

      <DeviceActionDialog action={action} onClose={closeAction} onDone={refresh} />
    </div>
  );
}

function DeviceActionDialog({
  action,
  onClose,
  onDone,
}: {
  action:
    | { kind: "rename"; device: DeviceRow }
    | { kind: "status"; device: DeviceRow; next: "active" | "inactive" }
    | { kind: "revoke"; device: DeviceRow }
    | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const rename = useServerFn(adminRenameTerminal);
  const setStatus = useServerFn(adminSetTerminalStatus);
  const revoke = useServerFn(adminRevokeTerminal);

  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLabel(action?.kind === "rename" ? action.device.label : "");
    setReason("");
    setBusy(false);
  }, [action]);

  if (!action) return null;

  const title =
    action.kind === "rename"
      ? "Rename device"
      : action.kind === "status"
        ? action.next === "active"
          ? "Activate device"
          : "Deactivate device"
        : "Revoke device";

  const description =
    action.kind === "rename"
      ? "Update the label shown to the merchant. Reason is logged."
      : action.kind === "status"
        ? `Set ${action.device.label} to ${action.next}. This is auditable.`
        : "Revoke this terminal. It will be marked revoked and its stored configuration cleared.";

  const submit = async () => {
    if (reason.trim().length < 4) {
      toast.error("Reason must be at least 4 characters");
      return;
    }
    setBusy(true);
    try {
      if (action.kind === "rename") {
        if (!label.trim()) {
          toast.error("Label is required");
          setBusy(false);
          return;
        }
        await rename({ data: { terminalId: action.device.id, label: label.trim(), reason } });
        toast.success("Device renamed");
      } else if (action.kind === "status") {
        await setStatus({ data: { terminalId: action.device.id, status: action.next, reason } });
        toast.success(`Device ${action.next}`);
      } else {
        await revoke({ data: { terminalId: action.device.id, reason } });
        toast.success("Device revoked");
      }
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!action}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {action.kind === "rename" && (
            <div>
              <Label htmlFor="dev-label">New label</Label>
              <Input
                id="dev-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
              />
            </div>
          )}
          <div>
            <Label htmlFor="dev-reason">Reason (audited)</Label>
            <Input
              id="dev-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this change happening?"
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
            variant={action.kind === "revoke" ? "destructive" : "default"}
          >
            {busy ? "Working…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
