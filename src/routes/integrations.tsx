import { createFileRoute, Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { Calculator, Cloud, CreditCard, MessageSquare, Monitor, ShoppingBag } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { dashboardUrl } from "@/lib/host";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations  -  SEZA POS" },
      {
        name: "description",
        content:
          "See which SEZA POS payment, messaging, export, hardware, and platform connections are available, require configuration, or remain on the roadmap.",
      },
      { property: "og:title", content: "Integrations  -  SEZA POS" },
      {
        property: "og:description",
        content: "A transparent view of available, setup-required, and roadmap connections.",
      },
    ],
  }),
  component: IntegrationsPage,
});

type Status = "available" | "setup" | "roadmap";
type Category = {
  icon: ComponentType<{ className?: string }>;
  name: string;
  items: Array<{ name: string; status: Status; note: string }>;
};

const CATEGORIES: Category[] = [
  {
    icon: CreditCard,
    name: "Payments",
    items: [
      {
        name: "Stripe subscription billing",
        status: "available",
        note: "SEZA plan checkout, invoices, billing status, and saved subscription payment methods are handled through Stripe.",
      },
      {
        name: "Stripe Terminal",
        status: "setup",
        note: "The codebase includes Terminal-oriented endpoints and Android driver architecture. Production use requires provider approval, live keys, compatible readers, and the required native plugin in the Android build.",
      },
      {
        name: "Wallet and contactless acceptance",
        status: "setup",
        note: "Availability depends on the connected Stripe Terminal reader, country, merchant account, device, and provider configuration.",
      },
      {
        name: "Split tender",
        status: "roadmap",
        note: "A guided workflow for dividing one sale across multiple tender types remains planned.",
      },
    ],
  },
  {
    icon: MessageSquare,
    name: "Receipts & messaging",
    items: [
      {
        name: "SMS receipts",
        status: "setup",
        note: "The receipt workflow is present and requires valid SMS-provider credentials, a sending number, and compliant merchant consent practices.",
      },
      {
        name: "Email receipts",
        status: "setup",
        note: "The receipt workflow is present and requires the deployed email service and sender configuration to be active.",
      },
      {
        name: "Printed receipts",
        status: "setup",
        note: "Receipt printing depends on a compatible printer, connection method, and device-specific setup.",
      },
    ],
  },
  {
    icon: Calculator,
    name: "Data & accounting",
    items: [
      {
        name: "CSV exports",
        status: "available",
        note: "Export-supported reports and directories can be moved into spreadsheet and accounting workflows.",
      },
      {
        name: "QuickBooks Online",
        status: "roadmap",
        note: "Direct accounting synchronization has not been released.",
      },
      {
        name: "Xero",
        status: "roadmap",
        note: "Direct accounting synchronization has not been released.",
      },
    ],
  },
  {
    icon: ShoppingBag,
    name: "Commerce",
    items: [
      {
        name: "Shared inventory API",
        status: "roadmap",
        note: "A public merchant API for external catalog and inventory synchronization has not been released.",
      },
      {
        name: "Shopify connector",
        status: "roadmap",
        note: "A supported two-way Shopify connector has not been released.",
      },
    ],
  },
  {
    icon: Monitor,
    name: "Hardware",
    items: [
      {
        name: "USB and Bluetooth HID scanners",
        status: "available",
        note: "Standard keyboard-style scanners can work where the operating system exposes them as HID input.",
      },
      {
        name: "Android camera scanning",
        status: "available",
        note: "Supported Android builds can use the device camera for barcode scanning.",
      },
      {
        name: "ESC/POS-oriented printing",
        status: "setup",
        note: "Actual support depends on the printer model, connection, driver, and device configuration.",
      },
      {
        name: "Printer-driven cash drawers",
        status: "setup",
        note: "Drawer opening depends on compatible printer ports and command settings.",
      },
    ],
  },
  {
    icon: Cloud,
    name: "Platform",
    items: [
      {
        name: "Merchant-facing public API",
        status: "roadmap",
        note: "A documented external API for merchant-built integrations has not been released.",
      },
      {
        name: "Outbound merchant webhooks",
        status: "roadmap",
        note: "Configurable outbound sale, refund, and stock events remain planned.",
      },
    ],
  },
];

const BADGE: Record<Status, { label: string; className: string }> = {
  available: {
    label: "Available",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  setup: {
    label: "Setup required",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
  },
  roadmap: {
    label: "Roadmap",
    className: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  },
};

function IntegrationsPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Integrations</p>
        <h1 className="mt-4 text-balance text-4xl font-black tracking-[-0.04em] sm:text-6xl">
          Clear about what is live - and what still needs work.
        </h1>
        <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
          Some connections work immediately, some require merchant credentials or compatible
          hardware, and others remain on the roadmap. SEZA labels each one so merchants can plan
          accurately.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-20 md:grid-cols-2">
        {CATEGORIES.map((category) => (
          <article
            key={category.name}
            className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900/60"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                <category.icon className="size-5" />
              </span>
              <h2 className="text-lg font-bold">{category.name}</h2>
            </div>
            <ul className="divide-y divide-slate-200/80 dark:divide-white/10">
              {category.items.map((item) => {
                const badge = BADGE[item.status];
                return (
                  <li key={item.name} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold">{item.name}</h3>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.note}</p>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>

      <section className="border-y bg-blue-50/60 py-16 dark:bg-blue-500/5">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-black tracking-tight">Need a specific connection?</h2>
          <p className="mt-3 text-muted-foreground">
            Send the provider name, the workflow you need, and any available API documentation so
            the request can be evaluated accurately.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild className="rounded-full">
              <Link to="/contact">Request an integration</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full bg-white/70">
              <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">
                Start free trial
              </a>
            </Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
