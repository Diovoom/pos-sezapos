import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { format } from "date-fns";

type Row = {
  id: string; created_at: string; actor_email: string | null;
  action: string; entity: string | null; entity_id: string | null;
  details: Record<string, unknown> | null; ip: string | null; user_agent: string | null;
};

export function AuditLogPanel() {
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery<Row[]>({
    queryKey: ["audit_log"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from as any)("audit_log")
        .select("*").order("created_at", { ascending: false }).limit(500);
      return (data ?? []) as Row[];
    },
    refetchInterval: 60_000,
  });

  const filtered = data.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (r.action ?? "").toLowerCase().includes(s)
      || (r.actor_email ?? "").toLowerCase().includes(s)
      || (r.entity ?? "").toLowerCase().includes(s);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
        <CardDescription>Latest 500 actions. Auto-refreshes every 30 seconds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Filter by action, employee, or entity…" value={q} onChange={(e) => setQ(e.target.value)} />
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No events match.</div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-left p-2 w-40">When</th>
                  <th className="text-left p-2">Actor</th>
                  <th className="text-left p-2">Action</th>
                  <th className="text-left p-2">Entity</th>
                  <th className="text-left p-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 align-top">
                    <td className="p-2 font-mono text-xs whitespace-nowrap">
                      {format(new Date(r.created_at), "MMM d, HH:mm:ss")}
                    </td>
                    <td className="p-2 text-xs">{r.actor_email ?? "system"}</td>
                    <td className="p-2"><Badge variant="outline" className="font-mono text-xs">{r.action}</Badge></td>
                    <td className="p-2 text-xs">{r.entity ?? "—"}{r.entity_id ? ` #${r.entity_id.slice(0, 8)}` : ""}</td>
                    <td className="p-2 text-xs font-mono text-muted-foreground max-w-md truncate">
                      {r.details ? JSON.stringify(r.details) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
