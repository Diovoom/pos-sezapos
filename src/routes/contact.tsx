import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, PhoneCall, Clock, MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LEGAL_CONFIG } from "@/lib/legal/config";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — SEZA POS" },
      { name: "description", content: "Talk to the SEZA POS team about pricing, hardware, migrations, or a demo. Send a message about pricing, hardware, migrations, or a demo." },
      { property: "og:title", content: "Contact — SEZA POS" },
      { property: "og:description", content: "Talk to the SEZA POS team. Send a message about pricing, hardware, migrations, or a demo." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/contact" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", business: "", message: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error("Please fill in name, email, and message");
      return;
    }
    setBusy(true);
    try {
      const subject = encodeURIComponent(`Contact from ${form.name}${form.business ? ` (${form.business})` : ""}`);
      const body = encodeURIComponent(
        `Name: ${form.name}\nEmail: ${form.email}\nBusiness: ${form.business || "—"}\n\n${form.message}`
      );
      window.location.href = `mailto:support@sezapos.com?subject=${subject}&body=${body}`;
      setSent(true);
      toast.success("Opening your email — send the message to reach us");
    } finally {
      setBusy(false);
    }
  };

  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight">Get in touch</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Questions about pricing, hardware, migrating from another POS, or a live demo — we're happy to help.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-1 space-y-4">
            <div className="rounded-xl border p-5">
              <PhoneCall className="h-5 w-5 text-primary" />
              <div className="mt-2 font-medium">Customer service</div>
              <a href={`tel:${LEGAL_CONFIG.phone}`} className="text-sm font-semibold text-primary hover:underline">{LEGAL_CONFIG.phoneDisplay}</a>
              <p className="mt-1 text-xs text-muted-foreground">Tap the number to call SEZA.</p>
            </div>
            <div className="rounded-xl border p-5">
              <Mail className="h-5 w-5 text-primary" />
              <div className="mt-2 font-medium">Email</div>
              <a href="mailto:support@sezapos.com" className="text-sm text-primary hover:underline">support@sezapos.com</a>
            </div>
            <div className="rounded-xl border p-5">
              <Clock className="h-5 w-5 text-primary" />
              <div className="mt-2 font-medium">Support hours</div>
              <p className="text-sm text-muted-foreground">Mon–Fri, 9am–6pm EST · We reply within one business day.</p>
            </div>

            <div className="rounded-xl border p-5">
              <MapPin className="h-5 w-5 text-primary" />
              <div className="mt-2 font-medium">SEZA Technologies</div>
              <p className="text-sm text-muted-foreground">Serving retailers worldwide</p>
            </div>
          </div>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Send us a message</CardTitle>
              <CardDescription>Messages are reviewed as soon as practical during normal support operations.</CardDescription>
            </CardHeader>
            <CardContent>
              {sent ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
                  <p className="mt-3 font-medium">Message ready in your email app</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Didn't open?{" "}
                    <a href="mailto:support@sezapos.com" className="text-primary hover:underline">
                      Email us directly
                    </a>.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Your name</Label>
                      <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="business">Business name (optional)</Label>
                    <Input id="business" value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} autoComplete="organization" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">How can we help?</Label>
                    <Textarea id="message" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
                  </div>
                  <Button type="submit" className="w-full h-11" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send message"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </MarketingShell>
  );
}
