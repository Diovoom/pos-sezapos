import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Barcode,
  Box,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  CreditCard,
  Fingerprint,
  Headphones,
  Laptop,
  MonitorSmartphone,
  Package,
  Printer,
  ReceiptText,
  ScanLine,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  TabletSmartphone,
  Users,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { currentApp, dashboardUrl } from "@/lib/host";
import { KeyyBeautyGuide } from "./dahv-yzg-xk";
import { SEZA_PLANS } from "@/lib/plans";
const HOME_SELL_SRC = "/images/home-sell-960.webp";
const HOME_SELL_SRCSET =
  "/images/home-sell-640.webp 640w, /images/home-sell-960.webp 960w, /images/home-sell-1280.webp 1280w, /images/home-sell-1536.webp 1536w";
const HOME_INVENTORY_SRC = "/images/home-inventory-960.webp";
const HOME_INVENTORY_SRCSET =
  "/images/home-inventory-640.webp 640w, /images/home-inventory-960.webp 960w, /images/home-inventory-1280.webp 1280w, /images/home-inventory-1536.webp 1536w";
const HOME_REPORTS_SRC = "/images/home-reports-960.webp";
const HOME_REPORTS_SRCSET =
  "/images/home-reports-640.webp 640w, /images/home-reports-960.webp 960w, /images/home-reports-1280.webp 1280w, /images/home-reports-1536.webp 1536w";

const HOME_TITLE = "SEZA POS | Everything your store needs. Working as one.";
const HOME_DESCRIPTION =
  "SEZA POS is a complete retail system for independent stores, bringing register hardware, payments, inventory, cash control, employee management, receipts and reporting together.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESCRIPTION },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/" },
      { property: "og:image", content: "https://sezapos.com/seza-og.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: HOME_TITLE },
      { name: "twitter:description", content: HOME_DESCRIPTION },
      { name: "twitter:image", content: "https://sezapos.com/seza-og.jpg" },
    ],
    links: [
      { rel: "canonical", href: "https://sezapos.com/" },
      {
        rel: "preload",
        as: "image",
        href: HOME_SELL_SRC,
        type: "image/webp",
        imageSrcSet: HOME_SELL_SRCSET,
        imageSizes:
          "(max-width: 768px) calc(100vw - 48px), (max-width: 1280px) calc(100vw - 64px), 1152px",
        fetchPriority: "high",
      },
    ],
  }),
  component: LandingPage,
});

const capabilityGroups = [
  {
    icon: ScanLine,
    eyebrow: "Checkout",
    title: "Keep the line moving",
    body: "A register designed around the actions cashiers use all day - not a dashboard squeezed onto a checkout screen.",
    items: [
      "USB, Bluetooth and camera barcode scanning",
      "Favorites, custom-price items, discounts and taxes",
      "Cash, card and contactless payment workflows",
      "Manager approval for refunds and protected actions",
      "Printed, email and SMS receipt options",
      "Customer lookup and loyalty tools",
    ],
  },
  {
    icon: Package,
    eyebrow: "Inventory",
    title: "Know what is on every shelf",
    body: "Connect the product catalog to every sale, return and stock adjustment so the owner sees what changed.",
    items: [
      "Products, categories, variants and images",
      "Live stock movement after sales and refunds",
      "Low-stock visibility and inventory reports",
      "Supplier details and product cost tracking",
      "Bulk product import and barcode workflows",
      "Stock counts and controlled adjustments",
    ],
  },
  {
    icon: Users,
    eyebrow: "Team",
    title: "Make every shift accountable",
    body: "Give employees a fast way in while keeping manager-only controls protected and traceable.",
    items: [
      "Secure six-digit employee PIN access",
      "Required clock-in before entering the POS",
      "Owner, manager and cashier permissions",
      "Manager overrides without sharing accounts",
      "Time cards, shift review and labor reporting",
      "Audit history for sensitive activity",
    ],
  },
  {
    icon: Banknote,
    eyebrow: "Cash control",
    title: "Close the drawer with confidence",
    body: "Track the movement of cash from opening count to safe drop and final reconciliation.",
    items: [
      "Opening cash and expected-drawer balance",
      "No-sale drawer access with accountability",
      "Cash payouts and reason tracking",
      "Deposits and safe-drop workflows",
      "End-of-shift count and variance review",
      "Close-out reporting for owners and managers",
    ],
  },
  {
    icon: BarChart3,
    eyebrow: "Reports",
    title: "See the story behind the total",
    body: "Review the day without rebuilding numbers from receipts, spreadsheets or handwritten shift notes.",
    items: [
      "Sales, tender and tax summaries",
      "Product, category and menu performance",
      "Employee, labor and time-clock reports",
      "Refund, void and discount visibility",
      "Register-session and close-of-day reports",
      "Owner dashboard across store activity",
    ],
  },
  {
    icon: WifiOff,
    eyebrow: "Resilience",
    title: "Keep selling when the internet drops",
    body: "The Android register can continue recording cash sales in a protected offline queue, then synchronize them when connectivity returns.",
    items: [
      "Cash-only offline checkout on Android",
      "Local product and store cache",
      "Visible pending-sync status",
      "Automatic retry when the connection returns",
      "Duplicate protection during synchronization",
      "Shift-close guard for unsynced sales",
    ],
  },
];

const industries = [
  {
    icon: Store,
    title: "Convenience stores",
    body: "Fast barcode checkout, age checks, cash control and shift accountability.",
  },
  {
    icon: ShoppingBag,
    title: "Liquor & bottle shops",
    body: "Inventory visibility and manager-controlled age-verification workflows.",
  },
  {
    icon: Box,
    title: "Mini marts & grocery",
    body: "Large catalogs, category taxes, quick keys and everyday stock movement.",
  },
  {
    icon: Sparkles,
    title: "Beauty & specialty retail",
    body: "Variants, product images, employee access and customer receipt options.",
  },
  {
    icon: Building2,
    title: "Apparel & sneaker stores",
    body: "Organized items, sizes, staff controls and clear product reporting.",
  },
  {
    icon: ReceiptText,
    title: "Counter-service businesses",
    body: "Simple order entry, cash and card workflows, receipts and daily totals.",
  },
];

const hardware = [
  {
    icon: MonitorSmartphone,
    title: "Countertop register",
    body: "A touch-friendly main screen for the cashier and day-to-day selling.",
  },
  {
    icon: TabletSmartphone,
    title: "Tablet or Android device",
    body: "A flexible register for smaller counters, mobile service or backup use.",
  },
  {
    icon: Printer,
    title: "Thermal receipt printer",
    body: "Compatible ESC/POS printing for clean, fast customer receipts.",
  },
  {
    icon: Barcode,
    title: "Barcode scanner",
    body: "USB, Bluetooth HID or the device camera for fast item lookup.",
  },
  {
    icon: Banknote,
    title: "Cash drawer",
    body: "Open automatically through compatible printer or hardware connections.",
  },
  {
    icon: CreditCard,
    title: "Payment terminal",
    body: "Stripe Terminal-ready workflows for compatible readers after merchant and Android setup.",
  },
  {
    icon: Laptop,
    title: "Owner computer",
    body: "Use the web dashboard on a modern laptop or desktop from anywhere.",
  },
  {
    icon: Smartphone,
    title: "Customer display",
    body: "Show the store brand and sale details on a second compatible screen.",
  },
];

const faqs = [
  {
    q: "Is there really a free trial without a credit card?",
    a: "Yes. You can create a store and use the 14-day trial without entering a card. SEZA does not automatically charge you when the trial ends; you choose a paid plan through Stripe to continue paid access.",
  },
  {
    q: "Can I use hardware I already own?",
    a: "Often, yes. SEZA is designed for compatible barcode scanners, ESC/POS thermal printers, cash drawers, customer displays and modern computers or Android devices. Exact compatibility depends on the model and connection method.",
  },
  {
    q: "What happens when the internet goes down?",
    a: "The Android POS can continue with cash-only offline sales after the device has been prepared online. Pending records are stored locally and synchronize when connectivity returns. Card payments and cloud-only features still require a connection.",
  },
  {
    q: "Can cashiers refund sales or open the drawer whenever they want?",
    a: "You control that through roles and manager approval. Protected actions can require an authorized manager PIN and are recorded for later review.",
  },
  {
    q: "How are SEZA subscription payments handled?",
    a: "Subscription checkout, invoices and saved billing methods are securely handled through Stripe. SEZA does not store your full subscription card number on its own servers.",
  },
  {
    q: "Can I add hardware later?",
    a: "Yes. SEZA is sold as a complete POS system with the software and core counter hardware working together. You can expand the setup later with additional scanners, printers, cash drawers, customer displays, payment readers or registers as your store grows.",
  },
];

function LandingPage() {
  // Cloudflare internally rewrites the Keyy Beauty host to /dahv-yzg-xk for SSR.
  // In the browser the visible URL intentionally remains "/", so keep the
  // hydrated root route on the same microsite instead of rendering SEZA home.
  if (currentApp() === "keyy") {
    return <KeyyBeautyGuide />;
  }

  return (
    <MarketingShell>
      <section className="relative isolate overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 pb-20 pt-8 sm:pt-12 lg:px-8 lg:pb-28 lg:pt-16">
          <div className="mx-auto max-w-4xl text-center">
            <Reveal>
              <h1 className="text-balance text-5xl font-black tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-[5.25rem] lg:leading-[0.98] dark:text-white">
                <span className="block">Everything your store needs</span>
                <span className="block">Working as one.</span>
              </h1>
              <p className="mx-auto mt-7 max-w-3xl text-pretty text-lg leading-8 text-slate-600 sm:text-xl dark:text-slate-300">
                SEZA brings the register hardware and software together so you can ring up sales,
                manage inventory, control cash, run employee shifts, send receipts and understand
                the day from one complete POS system.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="h-13 w-full rounded-lg px-7 text-base sm:w-auto"
                >
                  <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">
                    Start free trial <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-13 w-full rounded-lg border-slate-300 bg-white px-7 text-base sm:w-auto dark:border-white/15 dark:bg-slate-950"
                >
                  <a href="#inside-seza">See what is inside</a>
                </Button>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>14-day free trial</span>
                <span>No credit card required</span>
                <span>Cancel anytime</span>
              </div>
            </Reveal>
          </div>

          <Reveal className="relative mx-auto mt-14 max-w-6xl lg:mt-18" delay={120}>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-2 sm:p-3">
              <div className="flex items-center justify-between rounded-t-[22px] bg-slate-900 px-4 py-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-rose-400/80" />
                  <span className="size-2.5 rounded-full bg-amber-300/80" />
                  <span className="size-2.5 rounded-full bg-emerald-400/80" />
                </div>
                <div className="text-xs font-semibold tracking-wide text-slate-300">
                  SEZA Register
                </div>
                <div className="w-14" />
              </div>
              <img
                src={HOME_SELL_SRC}
                srcSet={HOME_SELL_SRCSET}
                sizes="(max-width: 768px) calc(100vw - 48px), (max-width: 1280px) calc(100vw - 64px), 1152px"
                alt="SEZA POS register showing the checkout workspace"
                width={1536}
                height={1024}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="block aspect-[3/2] w-full rounded-b-[22px] bg-white object-cover"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-950">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-slate-200/80 px-px sm:grid-cols-3 lg:grid-cols-6 dark:bg-white/10">
          {[
            { value: "Fast", label: "Touch-first checkout" },
            { value: "Controlled", label: "Roles and manager PINs" },
            { value: "Resilient", label: "Offline cash sales" },
            { value: "Connected", label: "Cloud dashboard" },
            { value: "Secure", label: "Stripe billing" },
            { value: "Supported", label: "Real setup help" },
          ].map((item) => (
            <div key={item.label} className="bg-white px-4 py-6 text-center dark:bg-slate-950">
              <div className="text-sm font-bold">{item.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-7 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-7xl">
          <Link
            to="/hardware"
            className="group grid border-y border-blue-900 bg-blue-800 px-2 py-8 text-white transition-colors hover:bg-blue-900 sm:px-4 lg:grid-cols-[1fr_auto] lg:items-center"
          >
            <div className="relative">
              <div className="text-sm font-semibold text-blue-100">
                Hardware planning
              </div>
              <h2 className="mt-5 text-balance text-3xl font-black tracking-[-0.035em] sm:text-4xl">
                Plan the complete setup built for your business.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50 sm:text-base">
                Build your SEZA setup with the register, scanner, printer, cash drawer, customer
                display, payment reader and software working together.
              </p>
            </div>
            <div className="relative mt-7 flex items-center gap-3 lg:mt-0 lg:pl-10">
              <span className="inline-flex h-12 items-center rounded-lg bg-white px-6 text-sm font-black text-blue-700">
                Build your setup <ArrowRight className="ml-2 size-4" />
              </span>
            </div>
          </Link>
        </Reveal>
      </section>

      <section id="inside-seza" className="scroll-mt-28 bg-slate-50/75 py-24 dark:bg-slate-950/55">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <p className="text-sm font-semibold text-primary">
              One connected operating system
            </p>
            <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">
              Everything the register needs. Everything the owner needs after closing.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              SEZA keeps checkout simple while the controls, records and reports stay organized
              behind it.
            </p>
          </Reveal>

          <div className="mt-12 divide-y border-y">
            {capabilityGroups.map((group) => (
              <Reveal key={group.title}>
                <article className="grid gap-5 py-7 lg:grid-cols-[280px_1fr]">
                  <div className="flex items-start gap-3">
                    <group.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-primary">{group.eyebrow}</p>
                      <h3 className="mt-1 text-xl font-bold tracking-tight">{group.title}</h3>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm leading-6 text-muted-foreground">{group.body}</p>
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                      {group.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm leading-5 text-slate-700 dark:text-slate-300">
                          <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-primary">
              Real product views
            </p>
            <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">
              From the first scan to the final report.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Cashiers get a focused selling screen. Owners get the inventory and reporting detail
              needed to run the business.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-8 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <ProductImage
                src={HOME_INVENTORY_SRC}
                srcSet={HOME_INVENTORY_SRCSET}
                alt="SEZA inventory management screen"
                label="Inventory"
              />
            </Reveal>
            <Reveal delay={100} className="lg:pl-10">
              <p className="text-sm font-semibold text-primary">
                Inventory that follows the sale
              </p>
              <h3 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Stop guessing what moved.
              </h3>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                Products, stock changes, suppliers and item performance live in the same system as
                checkout, so the owner can trace what happened instead of rebuilding the story
                later.
              </p>
              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <MiniPoint
                  icon={Barcode}
                  title="Scan to find"
                  body="Search or scan products quickly."
                />
                <MiniPoint
                  icon={Package}
                  title="Track movement"
                  body="Sales and returns update stock."
                />
                <MiniPoint
                  icon={CircleDollarSign}
                  title="Watch margins"
                  body="Keep price and cost together."
                />
                <MiniPoint
                  icon={Cloud}
                  title="See it remotely"
                  body="Review inventory from the dashboard."
                />
              </div>
            </Reveal>
          </div>

          <div className="mt-20 grid gap-8 lg:grid-cols-2 lg:items-center">
            <Reveal className="order-2 lg:order-1 lg:pr-10">
              <p className="text-sm font-semibold text-primary">
                Reports people can actually use
              </p>
              <h3 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Know how the day ended before tomorrow starts.
              </h3>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                Review sales, tenders, taxes, employees, products and register activity without
                exporting the basics to a spreadsheet first.
              </p>
              <ul className="mt-7 space-y-4">
                {[
                  "Compare cash and card totals",
                  "Review top items and category performance",
                  "See employee and shift activity",
                  "Find refunds, voids and cash movements",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm font-medium">
                    <Check className="size-4 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100} className="order-1 lg:order-2">
              <ProductImage
                src={HOME_REPORTS_SRC}
                srcSet={HOME_REPORTS_SRCSET}
                alt="SEZA reports dashboard"
                label="Reports"
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-950 py-24 text-white dark:border-white/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-blue-300">
                Designed for real counters
              </p>
              <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">
                Start with the hardware you have. Build the setup you want.
              </h2>
            </div>
            <div className="lg:pb-1">
              <p className="text-lg leading-8 text-slate-300">
                Use the SEZA compatibility guide to plan a complete setup for the way your business
                actually operates, then confirm exact model support before purchase.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-white px-6 text-slate-950 hover:bg-slate-100"
                >
                  <Link to="/hardware">
                    View hardware compatibility <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <span className="inline-flex items-center rounded-full border border-white/15 px-4 text-sm text-slate-300">
                  Exact model review required
                </span>
              </div>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {hardware.map((item) => (
              <Reveal key={item.title}>
                <div className="border-t border-white/15 pt-4">
                  <div className="flex items-center gap-2">
                    <item.icon className="size-5 text-blue-300" />
                    <h3 className="font-bold">{item.title}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-primary">
              Complete POS system for independent stores
            </p>
            <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">
              Flexible enough for the store you run today.
            </h2>
          </Reveal>
          <div className="mt-12 divide-y border-y">
            {industries.map((industry) => (
              <Reveal key={industry.title}>
                <Link to="/industries" className="group flex items-start gap-4 py-5">
                  <industry.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-lg font-bold">
                      {industry.title}
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">{industry.body}</span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-blue-50/55 py-24 dark:border-white/10 dark:bg-blue-500/5">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-primary">
              Simple, transparent plans
            </p>
            <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">
              Start small. Move up when the business needs more.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Every plan begins with a 14-day free trial. No credit card is required to test SEZA.
            </p>
          </Reveal>

          <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-3">
            {SEZA_PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-xl border p-7 ${plan.highlight ? "border-primary bg-white dark:bg-slate-900" : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900"}`}
              >
                {plan.highlight && (
                  <div className="mb-4 border-b border-primary pb-2 text-xs font-semibold text-primary">Recommended</div>
                )}
                <div className="text-sm font-bold text-primary">{plan.name}</div>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-4xl font-black tracking-tight">${plan.monthlyPrice}</span>
                  <span className="pb-1 text-sm text-muted-foreground">/month</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
                <ul className="mt-6 space-y-3">
                  {plan.features.slice(0, 3).map((point) => (
                    <li key={point} className="flex items-center gap-2 text-sm">
                      <Check className="size-4 text-emerald-600" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild variant="outline" size="lg" className="rounded-lg bg-white">
              <Link to="/pricing">
                Compare every plan <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <Reveal>
            <p className="text-sm font-semibold text-primary">
              Questions before you begin
            </p>
            <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">
              Straight answers before you get started
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Learn how SEZA hardware, software, payments, offline mode, manager approvals and
              billing work before your first sale.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/faq">View all FAQs</Link>
              </Button>
              <Button asChild variant="ghost" className="rounded-full">
                <Link to="/contact">
                  Contact SEZA <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <Accordion
              type="single"
              collapsible
              className="rounded-xl border border-slate-200 bg-white px-5 dark:border-white/10 dark:bg-slate-900/60 sm:px-7"
            >
              {faqs.map((faq, index) => (
                <AccordionItem
                  value={`faq-${index}`}
                  key={faq.q}
                  className="border-slate-200/80 dark:border-white/10"
                >
                  <AccordionTrigger className="py-5 text-left text-base font-bold hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-sm leading-7 text-muted-foreground">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

      <section className="px-6 pb-24 lg:px-8">
        <Reveal className="mx-auto max-w-7xl border-y border-blue-900 bg-blue-800 px-6 py-16 text-center text-white sm:px-12 lg:py-20">
          <div className="relative mx-auto max-w-3xl">
            <h2 className=" text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">
              Give your store a smarter operating system.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-blue-50">
              Create the business, add a few products and run a real test sale. You will know
              quickly whether SEZA fits the way your store works.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-13 rounded-lg bg-white px-7 text-blue-700 hover:bg-blue-50"
              >
                <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">
                  Start 14-day free trial <ArrowRight className="size-4" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-13 rounded-lg border-white/35 bg-transparent px-7 text-white hover:bg-white/10 hover:text-white"
              >
                <Link to="/contact">
                  <Headphones className="size-4" /> Talk to SEZA
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-blue-100">
              No credit card required. Subscription billing is securely processed by Stripe when you
              choose a plan.
            </p>
          </div>
        </Reveal>
      </section>
    </MarketingShell>
  );
}

function ProductImage({
  src,
  srcSet,
  alt,
  label,
}: {
  src: string;
  srcSet: string;
  alt: string;
  label: string;
}) {
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold text-muted-foreground">{label}</figcaption>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-2 dark:border-white/10">
        <img
          src={src}
          srcSet={srcSet}
          sizes="(max-width: 1024px) calc(100vw - 48px), 50vw"
          alt={alt}
          width={1536}
          height={1024}
          loading="lazy"
          decoding="async"
          className="block aspect-[3/2] w-full rounded-lg bg-white object-cover"
        />
      </div>
    </figure>
  );
}

function MiniPoint({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Fingerprint;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 border-t pt-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <div className="text-sm font-bold">{title}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}
