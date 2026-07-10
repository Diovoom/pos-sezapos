import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine, Package, Users, BarChart3, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import homeSell from "@/assets/home-sell.png.asset.json";
import homeInventory from "@/assets/home-inventory.png.asset.json";
import homeReports from "@/assets/home-reports.png.asset.json";

const HOME_TITLE = "SEZA POS — A faster, simpler POS for independent retail";
const HOME_DESCRIPTION = "SEZA POS is a modern cloud point-of-sale for convenience stores, liquor stores, mini marts, and specialty retail. Ring up sales, track stock, manage staff, and see what's happening in your store from one system.";
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

const TRIAL_MICROCOPY = "14-day free trial. No credit card required. Cancel anytime.";

function ScreenshotFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="group relative rounded-2xl overflow-hidden border bg-background shadow-[0_10px_40px_-12px_rgba(37,99,235,0.25)] transition-all duration-300 hover:shadow-[0_20px_60px_-12px_rgba(37,99,235,0.35)] hover:-translate-y-1">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full h-auto block transition-transform duration-500 group-hover:scale-[1.02]"
      />
    </div>
  );
}

function LandingPage() {
  return (
    <MarketingShell>
      {/* SECTION 1 — HERO */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-14 grid gap-10 lg:grid-cols-2 items-center">
        <div className="order-2 lg:order-1">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">
            POS software for independent retail
          </p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
            A faster, simpler POS for independent retail.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            Ring up sales, track stock, manage staff, and see what is happening in your store—from one system built for convenience stores, liquor stores, mini marts, and specialty shops.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Start your 14-day free trial</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#product-demo">See SEZA in action</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card required • Use your own compatible hardware • Cancel anytime
          </p>
        </div>
        <div className="order-1 lg:order-2">
          <ScreenshotFrame src={homeSell.url} alt="SEZA POS register — ring up a sale" />
        </div>
      </section>

      {/* SECTION 2 — INDUSTRY STRIP */}
      <section className="border-y bg-muted/30">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center text-sm text-muted-foreground flex flex-wrap gap-x-2 gap-y-1 justify-center">
          <span className="font-medium text-foreground">Built for</span>
          <Link to="/industries" className="hover:text-primary">convenience stores</Link>
          <span>•</span>
          <Link to="/industries" className="hover:text-primary">liquor stores</Link>
          <span>•</span>
          <Link to="/industries" className="hover:text-primary">mini marts</Link>
          <span>•</span>
          <Link to="/industries" className="hover:text-primary">specialty retail</Link>
        </div>
      </section>

      {/* SECTION 3 — CORE BENEFITS */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Everything you need at the register—and after closing.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ScanLine, title: "Move the line faster", body: "Scan barcodes, use quick keys, and complete sales without slowing customers down." },
            { icon: Package, title: "Know what is in stock", body: "Track every sale, return, and low-stock item from one organized product catalog." },
            { icon: Users, title: "Keep every shift accountable", body: "Give employees secure PIN access and review clock-ins, refunds, discounts, and drawer activity." },
            { icon: BarChart3, title: "Make decisions with real numbers", body: "See sales, taxes, tenders, top items, and shift performance in clear reports." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border p-6 hover:border-primary/40 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 4 — PRODUCT DEMONSTRATION */}
      <section id="product-demo" className="border-t bg-muted/20 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              See your store clearly—from the register to the back office.
            </h2>
          </div>
          <div className="mt-12 grid gap-8 lg:grid-cols-3">
            {[
              {
                title: "Ring up a sale",
                body: "Fast checkout with barcode scanning, favorites, discounts, split payments, and modern payment methods.",
                src: homeSell.url,
                alt: "SEZA POS checkout screen",
              },
              {
                title: "Manage inventory",
                body: "Organize products, monitor stock, manage suppliers, receive low-stock alerts, and track inventory in real time.",
                src: homeInventory.url,
                alt: "SEZA POS inventory screen",
              },
              {
                title: "Review the day",
                body: "View sales reports, taxes, employee performance, payment methods, top-selling products, and daily business insights.",
                src: homeReports.url,
                alt: "SEZA POS reports screen",
              },
            ].map((s) => (
              <div key={s.title} className="space-y-4">
                <ScreenshotFrame src={s.src} alt={s.alt} />
                <div className="px-1">
                  <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild size="lg" variant="outline">
              <Link to="/features">Explore all features <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* SECTION 5 — HOW THE TRIAL WORKS */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Be ready to test SEZA in minutes.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { n: "1", title: "Create your store", body: "Set your business name and secure login." },
            { n: "2", title: "Add your products", body: "Start with a few products or import a CSV." },
            { n: "3", title: "Run a test sale", body: "Try the register, receipt, employee shift, and reporting flow." },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border p-6">
              <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold text-sm">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button asChild size="lg"><Link to="/signup">Start free trial</Link></Button>
          <p className="mt-3 text-xs text-muted-foreground">{TRIAL_MICROCOPY}</p>
        </div>
      </section>

      {/* SECTION 6 — HARDWARE */}
      <section className="border-t bg-muted/20">
        <div className="max-w-6xl mx-auto px-6 py-20 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Keep the hardware you already own.
            </h2>
            <p className="mt-4 text-muted-foreground">
              SEZA works with compatible barcode scanners, thermal receipt printers, cash drawers, customer displays, and modern tablets or computers. Check your exact model before buying anything new.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="outline"><Link to="/hardware">Check hardware compatibility</Link></Button>
              <Button asChild><Link to="/signup">Start free trial</Link></Button>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {[
              "Barcode scanners (USB / Bluetooth HID)",
              "Thermal receipt printers (ESC/POS)",
              "Cash drawers",
              "Customer-facing displays",
              "Modern tablets, laptops, and desktops",
              "Camera-based scanning on phones and tablets",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* SECTION 7 — PRICING PREVIEW */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Start small. Upgrade when your store needs more.
        </h2>
        <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
          Plans begin at $29 per month after your free trial. Compare registers, employee limits, inventory tools, reports, and support.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto text-left">
          {[
            { name: "Starter", price: 29, who: "Owner-operated shops" },
            { name: "Pro", price: 59, who: "Growing retail stores" },
            { name: "Business", price: 89, who: "High-volume & multi-store" },
          ].map((p) => (
            <div key={p.name} className="rounded-xl border p-5">
              <div className="text-sm text-muted-foreground">{p.name}</div>
              <div className="mt-1"><span className="text-2xl font-bold">${p.price}</span><span className="text-muted-foreground text-sm">/mo</span></div>
              <div className="mt-1 text-xs text-muted-foreground">{p.who}</div>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Button asChild size="lg" variant="outline"><Link to="/pricing">Compare plans</Link></Button>
        </div>
      </section>

      {/* SECTION 8 — FINAL CTA */}
      <section className="border-t bg-primary/5">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Ready to see if SEZA fits your store?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Create your store, add a few products, and run a test sale—free for 14 days.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg"><Link to="/signup">Start your free trial</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/contact">Talk to SEZA</Link></Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{TRIAL_MICROCOPY}</p>
        </div>
      </section>
    </MarketingShell>
  );
}
