import { createFileRoute, Link } from "@tanstack/react-router";
import { dashboardUrl } from "@/lib/host";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { Store, Wine, ShoppingBasket, Coffee, Package, Cigarette } from "lucide-react";

export const Route = createFileRoute("/industries")({
  head: () => ({
    meta: [
      { title: "Industries We Serve  -  SEZA POS" },
      {
        name: "description",
        content:
          "SEZA POS is built for convenience stores, liquor stores, mini marts, specialty retail, cafés, and smoke shops. See how the platform fits your industry.",
      },
      { property: "og:title", content: "Industries  -  SEZA POS" },
      {
        property: "og:description",
        content:
          "Purpose-built POS for convenience, liquor, mini marts, cafés, and specialty retail.",
      },
    ],
  }),
  component: IndustriesPage,
});

const INDUSTRIES = [
  {
    icon: Store,
    name: "Convenience stores",
    tagline: "Fast lanes, tight margins, high SKU count.",
    features: [
      "Barcode scanning with per-scan promotions",
      "Age-verified sales workflows",
      "Quick keys for high-turnover items",
      "Shift close with cash drop reporting",
    ],
  },
  {
    icon: Wine,
    name: "Liquor stores",
    tagline: "Age verification, high-value inventory, careful cash handling.",
    features: [
      "ID scan and age-gating at the register",
      "Case + bottle unit tracking",
      "Supplier and purchase-order management",
      "Variance reporting for cash and inventory",
    ],
  },
  {
    icon: ShoppingBasket,
    name: "Mini marts & grocery",
    tagline: "Grocery, dairy, prepared foods, EBT-ready workflows.",
    features: [
      "Weighted items and per-unit pricing",
      "Tax rules per category",
      "Vendor receiving and stock counts",
      "Customer accounts and loyalty",
    ],
  },
  {
    icon: Coffee,
    name: "Cafés & quick-serve",
    tagline: "Modifiers, speed of service, tickets that move.",
    features: [
      "Modifier groups and combos",
      "Custom quick-add tiles",
      "Tip prompts and split payments",
      "Kitchen ticket integration (roadmap)",
    ],
  },
  {
    icon: Package,
    name: "Specialty retail",
    tagline: "Deep inventory, variants, and considered purchases.",
    features: [
      "Variant matrices (size, color, style)",
      "Purchase orders and receiving",
      "Discount rules per SKU or cart",
      "Customer purchase history",
    ],
  },
  {
    icon: Cigarette,
    name: "Smoke & vape shops",
    tagline: "Regulated products with strict compliance needs.",
    features: [
      "ID scan and age-gating",
      "Product-level compliance flags",
      "Detailed audit trail on sales and refunds",
      "Employee permissions for restricted actions",
    ],
  },
];

function IndustriesPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-sm font-medium text-primary uppercase tracking-wide">
          Industries we serve
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
          Built for the way independent retail actually works.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          SEZA POS is used across convenience, liquor, grocery, café, and specialty retail. The core
          is the same modern cloud platform; the workflows are tuned for the way your industry
          runs.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="divide-y border-y">
          {INDUSTRIES.map((i) => (
            <div key={i.name} className="grid gap-4 py-6 md:grid-cols-[220px_1fr]">
              <div className="flex items-start gap-3">
                <i.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h3 className="font-semibold">{i.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{i.tagline}</p>
                </div>
              </div>
              <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                {i.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-12 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Don't see your industry?</h2>
        <p className="mt-2 text-muted-foreground">
          SEZA's core is flexible, and most retail formats work out of the box.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Button asChild size="lg">
            <a href={dashboardUrl("/signup")}>Start free trial</a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/contact">Ask about your industry</Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
