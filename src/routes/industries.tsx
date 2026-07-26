import { createFileRoute, Link } from "@tanstack/react-router";
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
          is the same modern cloud platform - the workflows are tuned for the way your industry
          runs.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16 grid gap-6 md:grid-cols-2">
        {INDUSTRIES.map((i) => (
          <div key={i.name} className="rounded-xl border p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center">
                <i.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{i.name}</h3>
                <p className="text-xs text-muted-foreground">{i.tagline}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
              {i.features.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-6 py-12 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Don't see your industry?</h2>
        <p className="mt-2 text-muted-foreground">
          SEZA's core is flexible - most retail formats work out of the box.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Button asChild size="lg">
            <Link to="/signup">Start free trial</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/contact">Ask about your industry</Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
