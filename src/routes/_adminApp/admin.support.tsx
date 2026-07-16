import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListTickets, adminCreateTicket } from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminApp/admin/support")({
  head: () => ({ meta: [{ title: "Support — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SupportPage,
});

function SupportPage() {
  const [status, setStatus] = useState("all");
  const list = useServerFn(adminListTickets);
  const create = useServerFn(adminCreateTicket);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin_tickets", status], queryFn: () => list({ data: { status, page: 1, pageSize: 100 } }) });
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [storeId, setStoreId] = useState("");

  async function submit() {
    if (!subject.trim()) { toast.error("Subject required"); return; }
    try {
      await create({ data: { subject, body, priority, storeId: storeId || undefined } });
      toast.success("Ticket created"); setOpen(false); setSubject(""); setBody(""); setStoreId("");
      qc.invalidateQueries({ queryKey: ["admin_tickets"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="text-2xl font-bold">Support</h1><p className="text-sm text-muted-foreground">Merchant support tickets.</p></div>
        <Button onClick={() => setOpen(true)}>New ticket</Button>
      </div>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="investigating">Investigating</SelectItem>
          <SelectItem value="waiting_for_merchant">Waiting for merchant</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading…</div>
          ) : (data?.rows ?? []).length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">No tickets.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40"><tr className="text-left"><th className="p-3">#</th><th className="p-3">Subject</th><th className="p-3">Business</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3">Updated</th></tr></thead>
              <tbody>
                {data!.rows.map((t: any) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3 font-mono text-xs">{t.ticket_number}</td>
                    <td className="p-3"><Link to="/admin/support/$ticketId" params={{ ticketId: t.id }} className="text-primary hover:underline">{t.subject}</Link></td>
                    <td className="p-3 text-xs">
                      {t.store_id ? <Link to="/admin/businesses/$storeId" params={{ storeId: t.store_id }} className="hover:underline">{t.store_name ?? t.store_id.slice(0,8)}</Link> : "—"}
                    </td>
                    <td className="p-3 text-xs">{t.priority}</td>
                    <td className="p-3"><Badge variant="outline">{t.status}</Badge></td>
                    <td className="p-3 text-xs">{format(new Date(t.updated_at), "MMM d, HH:mm")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New ticket</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            <div><Label>Business ID (optional)</Label><Input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="uuid" /></div>
            <div><Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>First note</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
