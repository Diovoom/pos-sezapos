import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetTicket, adminUpdateTicket, adminAddTicketNote } from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_adminApp/admin/support/$ticketId")({
  head: () => ({ meta: [{ title: "Ticket — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: TicketPage,
});

function TicketPage() {
  const { ticketId } = Route.useParams();
  const get = useServerFn(adminGetTicket);
  const update = useServerFn(adminUpdateTicket);
  const addNote = useServerFn(adminAddTicketNote);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin_ticket", ticketId], queryFn: () => get({ data: { ticketId } }) });
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(true);
  const [resolution, setResolution] = useState("");

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-sm text-destructive">Not found</div>;
  const { ticket, notes, store } = data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin_ticket", ticketId] });

  async function setField(patch: any) {
    try { await update({ data: { ticketId, ...patch } }); toast.success("Updated"); refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  async function saveNote() {
    if (!note.trim()) return;
    try { await addNote({ data: { ticketId, body: note, internal } }); setNote(""); refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  async function saveResolution() {
    await setField({ resolution, status: "resolved" });
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/support" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="h-4 w-4" /> Support</Link>
      <div>
        <div className="text-xs font-mono text-muted-foreground">#{ticket.ticket_number}</div>
        <h1 className="text-2xl font-bold">{ticket.subject}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{ticket.status}</Badge>
          <Badge variant="outline">{ticket.priority}</Badge>
          {store && <Link to="/admin/businesses/$storeId" params={{ storeId: store.id }} className="text-primary hover:underline">{store.name}</Link>}
          <span className="text-muted-foreground">Opened {format(new Date(ticket.created_at), "MMM d, yyyy HH:mm")}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Conversation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {notes.length === 0 ? (
              <div className="text-sm text-muted-foreground">No notes yet.</div>
            ) : notes.map((n: any) => (
              <div key={n.id} className={`border rounded p-3 ${n.internal ? "bg-amber-500/5 border-amber-500/30" : ""}`}>
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>{n.author_email ?? "system"} · {n.internal ? "internal" : "customer-facing"}</span>
                  <span>{format(new Date(n.created_at), "MMM d, HH:mm")}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm mt-1">{n.body}</div>
              </div>
            ))}
            <div className="space-y-2 pt-2 border-t">
              <Label>Add note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Internal only
              </label>
              <Button onClick={saveNote}>Add note</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Manage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Status</Label>
              <Select value={ticket.status} onValueChange={(v) => setField({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="waiting_for_merchant">Waiting for merchant</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={ticket.priority} onValueChange={(v) => setField({ priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resolution</Label>
              <Textarea value={resolution || ticket.resolution || ""} onChange={(e) => setResolution(e.target.value)} rows={4} />
              <Button size="sm" className="mt-2" onClick={saveResolution}>Save & resolve</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
