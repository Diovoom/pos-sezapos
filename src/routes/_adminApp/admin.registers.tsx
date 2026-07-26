import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminListPairedDevices } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_adminApp/admin/registers")({
  head: () => ({
    meta: [{ title: "Registers — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: RegistersPage,
});

function RegistersPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["devices.view"]) ?? false;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "registers", q, status, page],
    queryFn: () => adminListPairedDevices({ data: { q, status, page, pageSize: 25 } }),
    enabled: canView,
    refetchInterval: 60_000,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paired POS registers</h1>
        <p className="text-sm text-muted-foreground">
          Android POS devices paired to merchant stores. This is the source of truth for register
          fleet health; card readers live under Devices.
        </p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <Input
            placeholder="Search label…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="max-w-sm"
          />
          <div className="flex gap-1">
            {["all", "active", "revoked"].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "default" : "outline"}
                onClick={() => {
                  setPage(1);
                  setStatus(s);
                }}
              >
                {s}
              </Button>
            ))}
          </div>
          <CardTitle className="ml-auto text-sm font-normal text-muted-foreground">
            {data?.count ?? 0} devices
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <table className="w-full text-sm min-w-[800px]">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Register</th>
                  <th>Store</th>
                  <th>Platform</th>
                  <th>App</th>
                  <th>Last seen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((d: any) => (
                  <tr key={d.id} className="border-t">
                    <td className="py-2">{d.label}</td>
                    <td>{d.store_name ?? "—"}</td>
                    <td className="text-xs">{d.platform ?? "—"}</td>
                    <td className="text-xs font-mono">{d.app_version ?? "—"}</td>
                    <td className="text-xs text-muted-foreground">
                      {d.last_seen_at ? (
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${d.online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                          />
                          {new Date(d.last_seen_at).toLocaleString()}
                        </span>
                      ) : (
                        "never"
                      )}
                    </td>
                    <td>
                      <Badge variant={d.status === "active" ? "default" : "destructive"}>
                        {d.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <span>Page {page}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={(data?.rows.length ?? 0) < 25}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
