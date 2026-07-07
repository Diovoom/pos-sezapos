import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ShoppingCart, BarChart3, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";

const HOME_TITLE = "SEZA POS | Smart Point of Sale System for Retail Businesses";
const HOME_DESCRIPTION = "SEZA POS is a modern point-of-sale system for retail stores, convenience stores, liquor stores, grocery stores, and small businesses. Manage sales, inventory, employees, receipts, reports, and payments in one platform.";
const HOME_OG_IMAGE = "https://sezapos.com/__l5e/assets-v1/5cbb57a3-89b6-4c34-9e82-d3c4e406f71a/seza-og.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESCRIPTION },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/" },
      { property: "og:image", content: HOME_OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: HOME_TITLE },
      { name: "twitter:description", content: HOME_DESCRIPTION },
      { name: "twitter:image", content: HOME_OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/" }],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          The modern cloud POS for retail
        </h1>
        <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
          SEZA POS gives convenience stores, mini marts, liquor stores and specialty retailers a fast, reliable point of sale — with inventory, employees, and reports built in.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Button asChild size="lg"><Link to="/signup">Start free trial</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/features">See features</Link></Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">14-day free trial. Card on file required to activate.</p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: ShoppingCart, title: "Fast checkout", body: "Barcode scanning, custom items, discounts, and card + cash." },
          { icon: BarChart3, title: "Real-time reports", body: "Daily and weekly sales, shift summaries, and inventory insights." },
          { icon: Users, title: "Employees & shifts", body: "Roles, PIN sign-in, clock in/out, and payroll-ready reports." },
          { icon: Shield, title: "Secure & cloud-based", body: "Your data is encrypted, backed up, and available on any device." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border p-6">
            <f.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="border-t bg-muted/30">
        <div className="max-w-6xl mx-auto px-6 py-16 grid gap-8 md:grid-cols-2 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Everything a modern store needs</h2>
            <p className="mt-3 text-muted-foreground">One system for checkout, inventory, employees, and analytics — priced simply, with a free trial to get started.</p>
            <div className="mt-6 flex gap-3">
              <Button asChild><Link to="/pricing">See plans & pricing</Link></Button>
              <Button asChild variant="outline"><Link to="/hardware">Compatible hardware</Link></Button>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {[
              "Cash and card payments via terminal integration",
              "Barcode scanning and quick custom items",
              "Per-item and per-cart discounts",
              "Inventory alerts and variant tracking",
              "Shift tracking and role-based permissions",
              "Cloud backup and multi-device access",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingShell>
  );
}
