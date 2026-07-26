import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, LifeBuoy, Send, Mail, Globe } from "lucide-react";

export const Route = createFileRoute("/_dashboard/help")({
  head: () => ({
    meta: [
      { title: "Support — SEZA POS" },
      { name: "description", content: "Get help from the SEZA POS platform team." },
    ],
  }),
  component: HelpPage,
});

type Ticket = {
  id: string;
  ticket_number: number | null;
  subject: string;
  status: string;
  priority: string | null;
  created_at: string;
};

export function HelpPage() {
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [busy, setBusy] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["my-support-tickets"],
    queryFn: async (): Promise<Ticket[]> => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, ticket_number, subject, status, priority, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Ticket[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) throw new Error("Not signed in");
      const { data: profile } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!profile?.store_id) throw new Error("No store");
      const { error, data: ticket } = await (supabase.from as any)("support_tickets")
        .insert({
          store_id: profile.store_id,
          requester_id: session.user.id,
          requester_email: session.user.email ?? null,
          subject: subject.trim(),
          category: "general",
          priority,
          status: "open",
          chat_status: "waiting",
        })
        .select("id")
        .single();
      if (error) throw error;
      if (message.trim()) {
        const { error: noteError } = await supabase.from("support_ticket_notes").insert({
          ticket_id: ticket.id,
          author_id: session.user.id,
          author_email: session.user.email ?? null,
          body: message,
          internal: false,
        });
        if (noteError) throw noteError;
      }
    },
    onSuccess: () => {
      toast.success("Ticket submitted");
      setSubject("");
      setMessage("");
      setPriority("normal");
      qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusy(false),
  });

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <PageHeader title="Support" subtitle="Contact the SEZA POS platform team." />

      <Card>
        <CardHeader>
          <CardTitle>Open a new ticket</CardTitle>
          <CardDescription>
            Describe the issue. Include screenshots via the web dashboard if helpful.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="subj">Subject</Label>
            <Input
              id="subj"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Card reader disconnects"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pri">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger id="pri">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent — store down</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="msg">Message</Label>
            <Textarea
              id="msg"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Steps to reproduce, error messages, etc."
            />
          </div>
          <div className="flex gap-2">
            <Button
              disabled={busy || !subject.trim()}
              onClick={() => {
                setBusy(true);
                create.mutate();
              }}
            >
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-2 size-4" />
              )}
              Submit ticket
            </Button>
            <Button variant="outline" asChild>
              <a href="mailto:support@sezapos.com">
                <Mail className="mr-2 size-4" /> Email us
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href="https://status.sezapos.com" target="_blank" rel="noreferrer">
                <Globe className="mr-2 size-4" /> Status page
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-sm text-muted-foreground">No tickets yet.</div>
          ) : (
            <ul className="divide-y">
              {tickets.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      to="/help/$ticketId"
                      params={{ ticketId: t.id }}
                      className="font-medium truncate text-primary hover:underline"
                    >
                      #{t.ticket_number ?? "—"} · {t.subject}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.priority && <Badge variant="outline">{t.priority}</Badge>}
                    <Badge>{t.status}</Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/help/$ticketId" params={{ ticketId: t.id }}>
                        Open chat
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
