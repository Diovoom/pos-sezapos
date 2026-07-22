import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminListStores } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_adminApp/admin/stores")({
  head: () => ({ meta: [{ title: "Stores — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: StoresPage,
});

function StoresPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["businesses.view"]) ?? false;
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stores", q, page],
    queryFn: () => adminListStores({ data: { q, page, pageSize: 25 } }),
    enabled: canView,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stores</h1>
        <p className="text-sm text-muted-foreground">Every store across all businesses.</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <Input placeholder="Search name, code, email…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} className="max-w-sm" />
          <CardTitle className="ml-auto text-sm font-normal text-muted-foreground">{data?.count ?? 0} results</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Store</th><th>Code</th><th>Plan</th><th>Status</th><th>Location</th><th></th></tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((s: any) => (
                  <tr key={s.id} className="border-t">
                    <td className="py-2">{s.name}<div className="text-xs text-muted-foreground">{s.email ?? "—"}</div></td>
                    <td className="font-mono text-xs">{s.store_code}</td>
                    <td><Badge variant="outline">{s.plan_tier ?? "—"}</Badge></td>
                    <td>{s.suspended_at ? <Badge variant="destructive">suspended</Badge> : <Badge>{s.plan_status ?? "—"}</Badge>}</td>
                    <td className="text-xs text-muted-foreground">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</td>
                    <td className="text-right"><Button asChild size="sm" variant="outline"><Link to="/admin/businesses/$storeId" params={{ storeId: s.id }}>Open</Link></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <span>Page {page}</span>
            <Button size="sm" variant="outline" disabled={(data?.rows.length ?? 0) < 25} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
