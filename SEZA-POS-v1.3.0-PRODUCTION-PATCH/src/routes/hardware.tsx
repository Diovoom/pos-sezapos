import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Banknote,
  Barcode,
  Check,
  CreditCard,
  MonitorSmartphone,
  Printer,
  Smartphone,
  TabletSmartphone,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { dashboardUrl } from "@/lib/host";

export const Route = createFileRoute("/hardware")({
  head: () => ({
    meta: [
      { title: "POS Hardware — SEZA POS" },
      {
        name: "description",
        content:
          "Plan a SEZA POS setup with compatible Android devices, computers, scanners, thermal printers, cash drawers, customer displays, and payment readers.",
      },
      { property: "og:title", content: "Hardware that fits your counter — SEZA POS" },
      {
        property: "og:description",
        content: "Understand the device and connection requirements before choosing a SEZA hardware setup.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/hardware" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/hardware" }],
  }),
  component: HardwarePage,
});

const HARDWARE = [
  {
    icon: TabletSmartphone,
    title: "Register device",
    body: "Use a supported Android device for the dedicated register experience, or access supported web surfaces from a modern computer.",
    bullets: ["Touch-friendly checkout", "Android cash-only offline workflow", "Cloud synchronization when connected"],
  },
  {
    icon: Barcode,
    title: "Barcode scanner",
    body: "Standard USB or Bluetooth HID scanners can act like a keyboard, while supported Android devices can also use camera scanning.",
    bullets: ["USB HID", "Bluetooth HID", "Android camera scanning"],
  },
  {
    icon: Printer,
    title: "Thermal receipt printer",
    body: "SEZA includes ESC/POS-oriented printing workflows. Compatibility depends on the printer model, connection type, device, and driver setup.",
    bullets: ["ESC/POS-oriented receipts", "USB, network, or Bluetooth setup", "Test before production use"],
  },
  {
    icon: Banknote,
    title: "Cash drawer",
    body: "A compatible printer-driven drawer can open through the receipt-printer connection when the hardware and command settings are configured correctly.",
    bullets: ["Sale completion", "Payout and no-sale workflows", "Manager accountability"],
  },
  {
    icon: CreditCard,
    title: "Payment reader",
    body: "SEZA contains Stripe Terminal-ready workflows, but reader support requires an approved merchant setup, compatible hardware, provider configuration, and an Android build that includes the required terminal plugin.",
    bullets: ["Provider approval required", "Reader compatibility varies", "Card payments require connectivity"],
  },
  {
    icon: MonitorSmartphone,
    title: "Customer display",
    body: "A compatible second screen can present store branding, line items, and totals when the device and display workflow support it.",
    bullets: ["Second-screen layout", "Store branding", "Sale visibility"],
  },
  {
    icon: Smartphone,
    title: "Owner access",
    body: "Owners can use the merchant dashboard from a modern phone, laptop, or desktop to review store activity and manage the business.",
    bullets: ["Remote reporting", "Products and employees", "Devices and settings"],
  },
];

function HardwarePage() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden border-b bg-slate-950 py-20 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.32),transparent_42%)]" />
        <div className="relative mx-auto max-w-5xl px-6 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.16em] text-blue-200"><MonitorSmartphone className="size-4" /> SEZA hardware planning guide</p>
          <h1 className="mt-5 text-balance text-4xl font-black tracking-[-0.04em] sm:text-6xl">
            Plan a complete counter setup that fits your business.
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-300">
            Use this guide to identify the right register, scanner, printer, drawer, display, and payment-reader requirements before purchasing equipment.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full bg-white px-7 text-blue-700 hover:bg-blue-50">
              <a href="#hardware-catalog"><MonitorSmartphone className="size-4" /> Explore hardware</a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full border-white/25 bg-transparent px-7 text-white hover:bg-white/10 hover:text-white">
              <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">Start free trial</a>
            </Button>
          </div>
          <div className="mx-auto mt-7 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-2 text-sm text-blue-100">
            <ShieldCheck className="size-4" /> Confirm the exact model, operating system, connection, and driver before purchase.
          </div>
        </div>
      </section>

      <section id="hardware-catalog" className="scroll-mt-28 mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">The pieces of a complete SEZA setup</h2>
          <p className="mt-4 text-muted-foreground">
            Compatibility is determined by the exact model, operating system, connection method, and installed drivers or native plugins—not only the product category.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {HARDWARE.map((item) => (
            <article key={item.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.5)] dark:border-white/10 dark:bg-slate-900/60">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><item.icon className="size-6" /></span>
              <h3 className="mt-4 text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {item.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y bg-blue-50/60 py-16 dark:bg-blue-500/5">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-black tracking-tight">Check before you buy</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Do not purchase hardware based only on a category name. Send SEZA the exact manufacturer, model number, operating system, and connection type so compatibility can be reviewed before deployment.
          </p>
          <Button asChild className="mt-6 rounded-full"><Link to="/contact">Send hardware details</Link></Button>
        </div>
      </section>
    </MarketingShell>
  );
}
