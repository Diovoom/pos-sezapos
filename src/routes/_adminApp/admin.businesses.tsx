import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListBusinesses } from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_adminApp/admin/businesses")({
  head: () => ({ meta: [{ title: "Businesses — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: BusinessesPage,
});

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "trial", label: "Trialing" },
  { value: "past_due", label: "Past due" },
  { value: "expired", label: "Expired" },
  { value: "canceled", label: "Canceled" },
  { value: "suspended", label: "Suspended" },
];

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

function BusinessesPage() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const list = useServerFn(adminListBusinesses);
  const { data, isLoading } = useQuery({
    queryKey: ["admin_businesses", filter, search, page],
    queryFn: () => list({ data: { filter, search, page, pageSize } }),
  });

  function exportCsv() {
    const rows = data?.rows ?? [];
    const header = ["id", "name", "email", "phone", "store_code", "plan_status", "plan_tier", "created_at", "suspended_at"];
    const csv = [
      header.join(","),
      ...rows.map((r: any) => header.map((k) => JSON.stringify(r[k] ?? "")).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `businesses-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Businesses</h1>
          <p className="text-sm text-muted-foreground">{total} total</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!data?.rows?.length}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            placeholder="Search name, email, code, phone…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-sm"
          />
          <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading…</div>
          ) : (data?.rows ?? []).length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">No businesses match the filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Business</th>
                    <th className="p-3">Contact</th>
                    <th className="p-3">Plan</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Trial ends</th>
                    <th className="p-3">Created</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data!.rows.map((r: any) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs font-mono text-muted-foreground">{r.store_code ?? r.id.slice(0, 8)}</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>{r.email ?? "—"}</div>
                        <div className="text-muted-foreground">{r.phone ?? ""}</div>
                      </td>
                      <td className="p-3">{r.plan_tier}</td>
                      <td className="p-3">
                        <Badge className={planBadge(r.plan_status)}>{r.plan_status}</Badge>
                        {r.suspended_at && <Badge className="ml-1 bg-red-500/15 text-red-700">SUSPENDED</Badge>}
                      </td>
                      <td className="p-3 text-xs">{r.trial_ends_at ? format(new Date(r.trial_ends_at), "MMM d, yyyy") : "—"}</td>
                      <td className="p-3 text-xs">{format(new Date(r.created_at), "MMM d, yyyy")}</td>
                      <td className="p-3">
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
