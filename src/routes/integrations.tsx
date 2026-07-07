import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { CreditCard, MessageSquare, Calculator, ShoppingBag, Monitor, Cloud } from "lucide-react";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — SEZA POS" },
      { name: "description", content: "SEZA POS integrates with payment terminals, SMS providers, accounting platforms, e-commerce, and receipt hardware. Available today and on the roadmap." },
      { property: "og:title", content: "Integrations — SEZA POS" },
      { property: "og:description", content: "Payment terminals, SMS, accounting, e-commerce, and hardware — connected to SEZA." },
    ],
  }),
  component: IntegrationsPage,
});

type Status = "available" | "roadmap";

const CATEGORIES: { icon: React.ComponentType<{ className?: string }>; name: string; items: { name: string; status: Status; note: string }[] }[] = [
  {
    icon: CreditCard,
    name: "Payments",
    items: [
      { name: "Stripe (subscription billing)", status: "roadmap", note: "Subscription billing integration is being configured." },
      { name: "Card terminals (in-app)", status: "available", note: "Integrated card capture through supported terminal hardware." },
      { name: "Apple Pay / Google Pay", status: "roadmap", note: "Wallet-based tap-to-pay support via supported terminals." },
      { name: "Split tender", status: "roadmap", note: "Split a single sale across multiple payment methods." },
    ],
  },
  {
    icon: MessageSquare,
    name: "Messaging",
    items: [
      { name: "SMS receipts", status: "available", note: "Send digital receipts by SMS at the end of a sale." },
      { name: "Email receipts", status: "available", note: "Send digital receipts by email at the end of a sale." },
    ],
  },
  {
    icon: Calculator,
    name: "Accounting",
    items: [
      { name: "CSV export", status: "available", note: "Export sales and inventory data for accountant import." },
      { name: "QuickBooks Online", status: "roadmap", note: "Direct sync of daily sales summaries." },
      { name: "Xero", status: "roadmap", note: "Direct sync of daily sales summaries." },
    ],
  },
  {
    icon: ShoppingBag,
    name: "E-commerce",
    items: [
      { name: "Shared inventory API", status: "roadmap", note: "Sync stock levels between the store and your online catalog." },
      { name: "Shopify connector", status: "roadmap", note: "Two-way sync with a Shopify storefront." },
    ],
  },
  {
    icon: Monitor,
    name: "Hardware",
    items: [
      { name: "Barcode scanners (USB / Bluetooth)", status: "available", note: "Any standard HID scanner works out of the box." },
      { name: "Camera-based scanning", status: "available", note: "Use a tablet or phone camera as a scanner." },
      { name: "Thermal receipt printers", status: "available", note: "ESC/POS compatible printers over network or USB." },
      { name: "Cash drawers", status: "available", note: "Kicked automatically at sale completion." },
    ],
  },
  {
    icon: Cloud,
    name: "Platform",
    items: [
      { name: "REST API", status: "roadmap", note: "Public API for read/write access to your store data." },
      { name: "Webhooks", status: "roadmap", note: "Push events (sales, refunds, stock) to your own endpoints." },
    ],
  },
];

function StatusBadge({ status }: { status: Status }) {
  return status === "available" ? (
    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Available</span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Roadmap</span>
  );
}

function IntegrationsPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-sm font-medium text-primary uppercase tracking-wide">Integrations</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">Connected to the tools your store already uses.</h1>
        <p className="mt-5 text-lg text-muted-foreground">
          SEZA connects to payments, messaging, accounting, e-commerce, and hardware. What is live today, and what is coming next.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16 grid gap-6 md:grid-cols-2">
        {CATEGORIES.map((c) => (
          <div key={c.name} className="rounded-xl border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center">
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{c.name}</h3>
            </div>
            <ul className="space-y-3">
              {c.items.map((it) => (
                <li key={it.name} className="border-t pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium text-sm">{it.name}</div>
                    <StatusBadge status={it.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{it.note}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-6 py-12 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Need a specific integration?</h2>
        <p className="mt-2 text-muted-foreground">Tell us what you use — we prioritize the roadmap based on merchant demand.</p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Button asChild><Link to="/contact">Request an integration</Link></Button>
          <Button asChild variant="outline"><Link to="/signup">Start free trial</Link></Button>
        </div>
      </section>
    </MarketingShell>
  );
}
