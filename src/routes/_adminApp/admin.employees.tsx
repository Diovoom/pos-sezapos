import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminListEmployees } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_adminApp/admin/employees")({
  head: () => ({ meta: [{ title: "Employees — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["businesses.view"]) ?? false;
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "employees", q, page],
    queryFn: () => adminListEmployees({ data: { q, page, pageSize: 25 } }),
    enabled: canView,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
        <p className="text-sm text-muted-foreground">All merchant employees across the platform.</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <Input placeholder="Search name, email, employee ID…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} className="max-w-sm" />
          <CardTitle className="ml-auto text-sm font-normal text-muted-foreground">{data?.count ?? 0} results</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Name</th><th>Employee ID</th><th>Store</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((e: any) => (
                  <tr key={e.id} className="border-t">
                    <td className="py-2">{e.full_name ?? "—"}<div className="text-xs text-muted-foreground">{e.email ?? "—"}</div></td>
                    <td className="font-mono text-xs">{e.employee_id ?? "—"}</td>
                    <td>{e.store_name ?? "—"}</td>
                    <td><Badge variant={e.status === "active" ? "default" : "outline"}>{e.status ?? "—"}</Badge></td>
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
