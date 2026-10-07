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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { dashboardUrl } from "@/lib/host";

export const Route = createFileRoute("/hardware")({
  head: () => ({
    meta: [
      { title: "POS Hardware  -  SEZA POS" },
      {
        name: "description",
        content:
          "Build a complete SEZA POS setup with the register, scanner, printer, cash drawer, customer display, payment reader and software working together.",
      },
      { property: "og:title", content: "Hardware that fits your counter  -  SEZA POS" },
      {
        property: "og:description",
        content:
          "See how SEZA brings counter hardware and software together as one complete POS system.",
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
    title: "SEZA countertop register",
    body: "The main register runs the SEZA POS experience and connects the rest of the counter setup to one system.",
    bullets: [
      "Touch-first checkout",
      "Offline cash workflow",
      "Automatic cloud synchronization",
    ],
  },
  {
    icon: Barcode,
    title: "Barcode scanner",
    body: "Scan products quickly with a compatible countertop scanner or the supported camera-scanning workflow.",
    bullets: ["Fast item lookup", "USB or Bluetooth options", "Camera scanning"],
  },
  {
    icon: Printer,
    title: "Thermal receipt printer",
    body: "A SEZA-compatible thermal printer provides fast, professional receipts directly from the register.",
    bullets: [
      "Fast receipt printing",
      "USB, network, or Bluetooth options",
      "Integrated register workflow",
    ],
  },
  {
    icon: Banknote,
    title: "Cash drawer",
    body: "The cash drawer works with the register workflow for cash sales, payouts, no-sale access and shift accountability.",
    bullets: ["Sale completion", "Payout and no-sale workflows", "Manager accountability"],
  },
  {
    icon: CreditCard,
    title: "Payment reader",
    body: "SEZA connects supported payment readers to the checkout flow for secure card-present payments.",
    bullets: [
      "Tap, insert and swipe",
      "Connected checkout experience",
      "Internet required for card payments",
    ],
  },
  {
    icon: MonitorSmartphone,
    title: "Customer display",
    body: "A customer-facing second screen can show store branding, sale details and totals while the cashier works on the main register.",
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
      <section className="border-b bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-sm font-semibold text-blue-200">
            SEZA complete POS setup
          </p>
          <h1 className="mt-5 text-balance text-4xl font-black tracking-[-0.04em] sm:text-6xl">
            Build the right SEZA POS setup for your store.
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-300">
            SEZA combines the register, scanner, printer, cash drawer, customer display, payment
            reader and software into one system built for your counter.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-white/25 bg-transparent px-7 text-white hover:bg-white/10 hover:text-white"
            >
              <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">
                Start free trial
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section id="hardware-catalog" className="scroll-mt-28 mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            What comes together in a complete SEZA setup
          </h2>
          <p className="mt-4 text-muted-foreground">
            SEZA brings the hardware and software together so the counter works as one connected
            system from checkout through close of day.
          </p>
        </div>
        <div className="mt-12 divide-y border-y">
          {HARDWARE.map((item) => (
            <article key={item.title} className="grid gap-4 py-6 md:grid-cols-[220px_1fr]">
              <div className="flex items-start gap-3">
                <item.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <h3 className="font-bold">{item.title}</h3>
              </div>
              <div>
                <p className="text-sm leading-6 text-muted-foreground">{item.body}</p>
                <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {item.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y bg-blue-50/60 py-16 dark:bg-blue-500/5">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-black tracking-tight">Build your SEZA setup</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Tell us how your store operates and what your counter needs. SEZA can help match the
            right register, printer, scanner, cash drawer, customer display, payment reader and
            software configuration.
          </p>
          <Button asChild className="mt-6 rounded-full">
            <Link to="/contact">Talk with SEZA</Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
