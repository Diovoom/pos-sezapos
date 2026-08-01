import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  AlertTriangle,
  ExternalLink,
  Globe,
  LifeBuoy,
  Loader2,
  Mail,
  MessageSquareText,
  Phone,
  Send,
} from "lucide-react";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { marketingUrl } from "@/lib/host";
import { userFacingError } from "@/lib/errors/user-facing";

export const Route = createFileRoute("/_dashboard/help")({
  head: () => ({
    meta: [
      { title: "Support  -  SEZA POS" },
      { name: "description", content: "Get help from the SEZA POS support team." },
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

type SupportCategory = "account" | "billing" | "inventory" | "register" | "payments" | "other";

export function HelpPage() {
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<SupportCategory>("other");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");

  const ticketsQuery = useQuery({
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
      if (!session.user) throw new Error("Your session has expired. Sign in again to continue.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.store_id) throw new Error("Your store could not be found. Contact SEZA Support.");

      const { error, data: ticket } = await (supabase.from as any)("support_tickets")
        .insert({
          store_id: profile.store_id,
          requester_id: session.user.id,
          requester_email: session.user.email ?? null,
          subject: subject.trim(),
          category,
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
          body: message.trim(),
          internal: false,
        });
        if (noteError) throw noteError;
      }
    },
    onSuccess: () => {
      toast.success("Your support request was sent.");
      setSubject("");
      setMessage("");
      setCategory("other");
      setPriority("normal");
      qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
    },
    onError: (error) =>
      toast.error(
        userFacingError(
          error,
          "Your support request could not be sent. Please try again or call SEZA Support.",
        ),
      ),
  });

  const tickets = ticketsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-5 md:p-6">
      <PageHeader
        title="Help Center"
        subtitle="Get account, register, billing, inventory, and payment help from SEZA."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Support options">
        <SupportOption
          icon={Phone}
          title="Call SEZA"
          description="For urgent store, account, or register problems."
          action="Call now"
          href={`tel:${LEGAL_CONFIG.phone}`}
        />
        <SupportOption
          icon={Mail}
          title="Email support"
          description="Send screenshots or details from your business email."
          action="Send email"
          href={`mailto:${LEGAL_CONFIG.supportEmail}`}
        />
        <SupportOption
          icon={Globe}
          title="System status"
          description="Check whether SEZA services are operating normally."
          action="View status"
          href={marketingUrl("/status")}
          external
        />
        <SupportOption
          icon={MessageSquareText}
          title="Your conversations"
          description="Open a saved support case and reply to SEZA."
          action="View tickets"
          href="#support-tickets"
        />
      </section>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <div className="font-semibold">Store unable to take sales?</div>
              <p className="text-sm text-muted-foreground">
                Call {LEGAL_CONFIG.phoneDisplay}. Have your store name and register name ready.
              </p>
            </div>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <a href={`tel:${LEGAL_CONFIG.phone}`}>
              <Phone className="mr-2 size-4" /> Emergency support
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="size-5 text-primary" /> Open a support request
          </CardTitle>
          <CardDescription>
            Tell us what you were doing, what happened, and which store or register was affected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="support-category">What do you need help with?</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as SupportCategory)}>
                <SelectTrigger id="support-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="account">Account or sign-in</SelectItem>
                  <SelectItem value="billing">Subscription or billing</SelectItem>
                  <SelectItem value="inventory">Products or inventory</SelectItem>
                  <SelectItem value="register">Register or hardware</SelectItem>
                  <SelectItem value="payments">Payments or refunds</SelectItem>
                  <SelectItem value="other">Something else</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-priority">How serious is it?</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
                <SelectTrigger id="support-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low - question or request</SelectItem>
                  <SelectItem value="normal">Normal - work can continue</SelectItem>
                  <SelectItem value="high">High - important feature blocked</SelectItem>
                  <SelectItem value="urgent">Urgent - store cannot operate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="support-subject">Subject</Label>
            <Input
              id="support-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Example: Register cannot complete a card sale"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="support-message">What happened?</Label>
            <Textarea
              id="support-message"
              rows={6}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us which store or register was affected, what you were trying to do, and what appeared on the screen."
              maxLength={4000}
            />
          </div>

          <Button
            className="w-full sm:w-auto"
            disabled={create.isPending || !subject.trim() || !message.trim()}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Send to SEZA Support
          </Button>
        </CardContent>
      </Card>

      <Card id="support-tickets" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Your support history</CardTitle>
          <CardDescription>Open a case to read replies or continue the conversation.</CardDescription>
        </CardHeader>
        <CardContent>
          {ticketsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading your support requests…
            </div>
          ) : ticketsQuery.isError ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              Your support history could not be loaded. Refresh the page or contact SEZA directly.
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <LifeBuoy className="mx-auto size-8 text-muted-foreground" />
              <div className="mt-3 font-semibold">No support requests yet</div>
              <p className="mt-1 text-sm text-muted-foreground">
                New requests and SEZA replies will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      to="/help/$ticketId"
                      params={{ ticketId: ticket.id }}
                      className="break-words font-medium text-primary hover:underline"
                    >
                      Case #{ticket.ticket_number ?? "Pending"} · {ticket.subject}
                    </Link>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Opened {new Date(ticket.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                    {ticket.priority && <Badge variant="outline">{ticket.priority}</Badge>}
                    <Badge>{ticket.status}</Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/help/$ticketId" params={{ ticketId: ticket.id }}>
                        Open conversation
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

function SupportOption({
  icon: Icon,
  title,
  description,
  action,
  href,
  external = false,
}: {
  icon: typeof Phone;
  title: string;
  description: string;
  action: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="flex min-h-40 flex-col rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="mt-1 flex-1 text-sm leading-5 text-muted-foreground">{description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        {action} {external && <ExternalLink className="size-3.5" />}
      </span>
    </a>
  );
}
