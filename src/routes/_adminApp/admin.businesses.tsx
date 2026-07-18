import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, RefreshCw, Search, X } from "lucide-react";

import { adminListBusinesses } from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type BusinessesSearch = {
  q: string;
  filter: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
};

const DEFAULTS: BusinessesSearch = {
  q: "",
  filter: "all",
  sortBy: "created_at",
  sortDir: "desc",
  page: 1,
  pageSize: 25,
};

export const Route = createFileRoute("/_adminApp/admin/businesses")({
  head: () => ({
    meta: [
      { title: "Businesses — SEZA Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): BusinessesSearch => ({
    q: typeof raw.q === "string" ? raw.q : DEFAULTS.q,
    filter: typeof raw.filter === "string" ? raw.filter : DEFAULTS.filter,
    sortBy: typeof raw.sortBy === "string" ? raw.sortBy : DEFAULTS.sortBy,
    sortDir: raw.sortDir === "asc" ? "asc" : "desc",
    page: Number.isFinite(Number(raw.page)) ? Math.max(1, Math.floor(Number(raw.page))) : DEFAULTS.page,
    pageSize: Number.isFinite(Number(raw.pageSize)) ? Math.floor(Number(raw.pageSize)) : DEFAULTS.pageSize,
  }),
  component: BusinessesPage,
});

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "trial", label: "Trialing" },
  { value: "past_due", label: "Past due" },
  { value: "expired", label: "Expired" },
  { value: "canceled", label: "Canceled" },
  { value: "suspended", label: "Suspended" },
];

const SORT_COLUMNS: { key: string; label: string }[] = [
  { key: "name", label: "Business" },
  { key: "plan_status", label: "Status" },
  { key: "plan_tier", label: "Plan" },
  { key: "trial_ends_at", label: "Trial ends" },
  { key: "plan_period_end", label: "Renews" },
  { key: "created_at", label: "Created" },
  { key: "updated_at", label: "Updated" },
];

const PAGE_SIZES = [25, 50, 100];

function planBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-green-500/15 text-green-700 dark:text-green-400",
    trialing: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    past_due: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    expired: "bg-red-500/15 text-red-700 dark:text-red-400",
    canceled: "bg-gray-500/15 text-gray-700 dark:text-gray-400",
  };
  return map[status] ?? "bg-gray-500/15 text-gray-700";
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return format(new Date(v), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

type BusinessRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  store_code: string | null;
  plan_tier: string | null;
  plan_status: string;
  plan_period_end: string | null;
  trial_ends_at: string | null;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
};

function BusinessesPage() {
  const rawSearch = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // Clamp/validate search-param values in the component per search-params rules.
  const filter = FILTERS.some((f) => f.value === rawSearch.filter) ? rawSearch.filter : "all";
  const sortBy = SORT_COLUMNS.some((c) => c.key === rawSearch.sortBy) ? rawSearch.sortBy : "created_at";
  const sortDir: "asc" | "desc" = rawSearch.sortDir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Math.min(9999, rawSearch.page || 1));
  const pageSize = PAGE_SIZES.includes(rawSearch.pageSize) ? rawSearch.pageSize : 25;
  const q = (rawSearch.q ?? "").slice(0, 100);

  // Local input state so typing doesn't refetch on every keystroke.
  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => { setSearchInput(q); }, [q]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput === q) return;
      navigate({
        search: (prev: BusinessesSearch) => ({ ...prev, q: searchInput, page: 1 }),
        replace: true,
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput, q, navigate]);

  const list = useServerFn(adminListBusinesses);
  const query = useQuery({
    queryKey: ["admin_businesses", { filter, q, sortBy, sortDir, page, pageSize }],
    queryFn: () => list({ data: { filter, search: q, sortBy, sortDir, page, pageSize } }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const rows = (query.data?.rows ?? []) as unknown as BusinessRow[];
  const total = query.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);

  const setSort = (key: string) => {
    navigate({
      search: (prev: BusinessesSearch) => ({
        ...prev,
        sortBy: key,
        sortDir: prev.sortBy === key && prev.sortDir === "desc" ? "asc" : "desc",
        page: 1,
      }),
      replace: true,
    });
  };

  const setFilter = (v: string) => {
    navigate({ search: (prev: BusinessesSearch) => ({ ...prev, filter: v, page: 1 }), replace: true });
  };

  const setPage = (p: number) => {
    navigate({ search: (prev: BusinessesSearch) => ({ ...prev, page: p }), replace: true });
  };

  const setPageSize = (n: number) => {
    navigate({ search: (prev: BusinessesSearch) => ({ ...prev, pageSize: n, page: 1 }), replace: true });
  };

  const clearAll = () => {
    setSearchInput("");
    navigate({
      search: () => ({ q: "", filter: "all", sortBy: "created_at", sortDir: "desc", page: 1, pageSize: 25 }),
      replace: true,
    });
  };

  const anyFilter = q !== "" || filter !== "all";

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("Nothing to export on this page");
      return;
    }
    const header = [
      "id", "name", "email", "phone", "city", "country",
      "store_code", "plan_status", "plan_tier",
      "trial_ends_at", "plan_period_end", "suspended_at",
      "created_at", "updated_at",
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
    a.download = `businesses-${filter}-p${page}-${new Date().toISOString().slice(0, 10)}.csv`;
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Businesses</h1>
          <p className="text-sm text-muted-foreground">{showingLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-2" /> Export CSV (page)
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, code, phone, city…"
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

          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select
            value={`${sortBy}:${sortDir}`}
            onValueChange={(v) => {
              const [key, dir] = v.split(":");
              navigate({
                search: (prev: BusinessesSearch) => ({ ...prev, sortBy: key, sortDir: dir as "asc" | "desc", page: 1 }),
                replace: true,
              });
            }}
          >
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_COLUMNS.flatMap((c) => [
                <SelectItem key={`${c.key}:desc`} value={`${c.key}:desc`}>{c.label} ↓</SelectItem>,
                <SelectItem key={`${c.key}:asc`} value={`${c.key}:asc`}>{c.label} ↑</SelectItem>,
              ])}
            </SelectContent>
          </Select>

          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
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
              <p>Failed to load businesses: {(query.error as Error).message}</p>
              <Button size="sm" variant="outline" onClick={() => query.refetch()}>Retry</Button>
            </div>
          ) : query.isLoading && !query.data ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-sm text-muted-foreground text-center space-y-2">
              <div>No businesses match your filters.</div>
              {anyFilter && (
                <Button variant="outline" size="sm" onClick={clearAll}>Clear filters</Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr className="text-left">
                    {sortHeader("name", "Business")}
                    <th className="p-3">Contact</th>
                    {sortHeader("plan_tier", "Plan")}
                    {sortHeader("plan_status", "Status")}
                    {sortHeader("trial_ends_at", "Trial ends")}
                    {sortHeader("plan_period_end", "Renews")}
                    {sortHeader("created_at", "Created")}
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs font-mono text-muted-foreground">
                          {r.store_code ?? r.id.slice(0, 8)}
                        </div>
                        {(r.city || r.country) && (
                          <div className="text-xs text-muted-foreground">
                            {[r.city, r.country].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        <div className="truncate max-w-[220px]">{r.email ?? "—"}</div>
                        <div className="text-muted-foreground">{r.phone ?? ""}</div>
                      </td>
                      <td className="p-3">{r.plan_tier ?? "—"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge className={planBadge(r.plan_status)}>{r.plan_status}</Badge>
                          {r.suspended_at && (
                            <Badge className="bg-red-500/15 text-red-700">SUSPENDED</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-xs">{fmtDate(r.trial_ends_at)}</td>
                      <td className="p-3 text-xs">{fmtDate(r.plan_period_end)}</td>
                      <td className="p-3 text-xs">{fmtDate(r.created_at)}</td>
                      <td className="p-3 text-right">
                        <Link
                          to="/admin/businesses/$storeId"
                          params={{ storeId: r.id }}
                          className="text-sm text-primary hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>
              First
            </Button>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
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
    </div>
  );
}
