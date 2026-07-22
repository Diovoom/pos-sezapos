import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ScanBarcode, Package, Users, BarChart3, Clock, Receipt, RotateCcw,
  Boxes, Shield, CreditCard, Printer, Wifi, MessageSquare, Mail, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — SEZA POS" },
      { name: "description", content: "Fast checkout, inventory tracking, employee time clock, refunds, SMS and email receipts, reports, and more — everything a modern retail store needs." },
      { property: "og:title", content: "Features — SEZA POS" },
      { property: "og:description", content: "Everything a modern retail store needs, in one cloud POS." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/features" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/features" }],
  }),
  component: FeaturesPage,
});

const GROUPS: { title: string; blurb: string; items: { icon: any; title: string; body: string }[] }[] = [
  {
    title: "Checkout & payments",
    blurb: "Ring up sales fast, on any device, with the payment method your customers prefer.",
    items: [
      { icon: ScanBarcode, title: "Barcode & keypad checkout", body: "Scan or type — supports USB and Bluetooth scanners, custom items, and quick keys." },
      { icon: CreditCard, title: "Card & cash payments", body: "Payment terminal integration, cash tendering, split payments, and change calculation." },
      { icon: RotateCcw, title: "Refunds & exchanges", body: "Full or partial refunds with restocking, void support, and manager overrides." },
      { icon: Mail, title: "Email & SMS receipts", body: "Send digital receipts by email or text message, or print thermal receipts." },
    ],
  },
  {
    title: "Inventory & products",
    blurb: "Keep stock accurate across every register with real-time updates.",
    items: [
      { icon: Package, title: "Product catalog", body: "SKUs, variants, categories, cost & price, tax rules, and images." },
      { icon: Boxes, title: "Stock tracking", body: "Automatic stock decrement on sale, restock on refund, and low-stock alerts." },
      { icon: Wallet, title: "Register sessions", body: "Open/close registers with cash counts and end-of-shift reconciliation." },
    ],
  },
  {
    title: "Employees & shifts",
    blurb: "Give every cashier the right access and track their time.",
    items: [
      { icon: Users, title: "Roles & permissions", body: "Owner, manager, and cashier roles with fine-grained permissions." },
      { icon: Clock, title: "Time clock & payroll", body: "Clock in/out with PIN, late tracking, and payroll-ready reports." },
      { icon: Shield, title: "Manager overrides", body: "Require manager approval for refunds, discounts, and price changes." },
    ],
  },
  {
    title: "Reports & operations",
    blurb: "Understand what's selling, who's selling, and how your store is doing.",
    items: [
      { icon: BarChart3, title: "Sales & shift reports", body: "Daily, weekly, and per-shift sales, taxes, tenders, and top items." },
      { icon: Receipt, title: "Audit logs", body: "Every sensitive action is recorded with actor, target, and timestamp." },
      { icon: Wifi, title: "Cloud sync", body: "Your data lives in the cloud — access it from any device, anywhere." },
      { icon: Printer, title: "Hardware support", body: "Receipt printers, cash drawers, barcode scanners, customer displays." },
      { icon: MessageSquare, title: "Customer profiles", body: "Track repeat customers, purchase history, and marketing consent." },
    ],
  },
];

function FeaturesPage() {
  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Everything you need to run a modern store</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          SEZA POS bundles checkout, inventory, employees, and reporting into one cloud system — no plugins, no add-ons.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild><Link to="/signup">Start free trial</Link></Button>
          <Button asChild variant="outline"><Link to="/pricing">View pricing</Link></Button>
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} className="border-t">
          <div className="max-w-6xl mx-auto px-6 py-14">
            <h2 className="text-2xl font-bold tracking-tight">{g.title}</h2>
            <p className="mt-2 text-muted-foreground max-w-2xl">{g.blurb}</p>
            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it) => (
                <div key={it.title} className="rounded-xl border p-6">
                  <it.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 font-semibold">{it.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{it.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </MarketingShell>
  );
}
