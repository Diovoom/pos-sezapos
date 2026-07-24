import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LifeBuoy, BookOpen, MessageSquare, Mail, PhoneCall, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { openWebsiteLiveChat } from "@/components/marketing/WebsiteLiveChat";
import { cn } from "@/lib/utils";
import { LEGAL_CONFIG } from "@/lib/legal/config";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — SEZA POS" },
      { name: "description", content: "Get help with SEZA POS: setup, hardware, billing, and troubleshooting. Answers to common questions and how to reach our team." },
      { property: "og:title", content: "Support — SEZA POS" },
      { property: "og:description", content: "Setup, hardware, billing, and troubleshooting — get answers and reach our team." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/support" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/support" }],
  }),
  component: SupportPage,
});

const FAQS = [
  { q: "How does the free trial work?", a: "Every new merchant can start a 14-day trial without entering a payment card. The trial does not automatically charge you; an authorized owner chooses a paid plan through Stripe to continue paid access after the trial." },
  { q: "Can I use my existing hardware?", a: "SEZA can work with supported scanners, ESC/POS-oriented receipt printers, printer-driven cash drawers, and configured payment readers. Compatibility depends on the exact model, connection, device, and required drivers or native plugins." },
  { q: "How do I change my plan?", a: "Sign in and go to Settings → Billing. You can upgrade, downgrade, update your card, or cancel. Upgrades are prorated; downgrades apply at the next billing cycle." },
  { q: "What happens if my internet goes down?", a: "Supported Android registers can record eligible cash sales in a limited offline mode and synchronize them after connectivity returns. Card payments and cloud-only functions still require a connection." },
  { q: "How is my data backed up?", a: "Store data is held in the configured managed cloud environment and protected with provider and application safeguards. Export availability depends on the record type, and merchants should maintain appropriate accounting and continuity records." },
  { q: "How do refunds work?", a: "Any sale can be fully or partially refunded from the Sales page. Refunds can restock inventory automatically and require manager approval by default." },
  { q: "Do you support multiple stores?", a: "The platform is being prepared for expanded multi-store operations. Review the current pricing and product pages before relying on a specific multi-location workflow." },
  { q: "How do I cancel?", a: "Go to Settings → Billing → Cancel plan. Your access continues through the end of your current billing period." },
];

function SupportPage() {
  return <MarketingSupportPage />;
}

function MarketingSupportPage() {
  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <LifeBuoy className="h-10 w-10 text-primary mx-auto" />
        <h1 className="mt-3 text-4xl font-bold tracking-tight">We're here to help</h1>
        <p className="mt-3 text-lg text-muted-foreground max-w-xl mx-auto">
          Setup guides, common questions, and direct access to our support team.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border p-6 flex flex-col">
          <BookOpen className="h-6 w-6 text-primary" />
          <h3 className="mt-3 font-semibold">Getting started</h3>
          <p className="mt-1 text-sm text-muted-foreground flex-1">Set up your first store, add products, train employees and take your first sale.</p>
          <Button asChild variant="outline" className="mt-4"><Link to="/guide">Open user guide</Link></Button>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-6 flex flex-col dark:border-blue-400/15 dark:bg-blue-500/5">
          <MessageSquare className="h-6 w-6 text-blue-700 dark:text-blue-300" />
          <h3 className="mt-3 font-semibold">Live chat</h3>
          <p className="mt-1 text-sm text-muted-foreground flex-1">Enter your name and phone number, then connect with SEZA Support from the website.</p>
          <Button type="button" className="mt-4 bg-blue-700 hover:bg-blue-800" onClick={openWebsiteLiveChat}>Start live chat</Button>
        </div>
        {[
          { icon: PhoneCall, title: "Call customer service", body: `${LEGAL_CONFIG.phoneDisplay} — tap to call for account, setup, sales, or hardware help.`, href: `tel:${LEGAL_CONFIG.phone}`, cta: "Call now" },
          { icon: Mail, title: "Email support", body: "support@sezapos.com — send account, billing, or register questions here.", href: "mailto:support@sezapos.com", cta: "Email us" },
        ].map((c) => (
          <div key={c.title} className="rounded-xl border p-6 flex flex-col">
            <c.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">{c.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground flex-1">{c.body}</p>
            <Button asChild variant="outline" className="mt-4"><a href={c.href}>{c.cta}</a></Button>
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14">
        <h2 className="text-2xl font-bold tracking-tight text-center">Frequently asked questions</h2>
        <div className="mt-8 divide-y border rounded-xl">
          {FAQS.map((f) => (
            <FaqRow key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="w-full text-left px-5 py-4 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">{q}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </div>
      {open && <p className="mt-2 text-sm text-muted-foreground">{a}</p>}
    </button>
  );
}
