import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
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
  Gauge,
  HardDriveDownload,
  Headphones,
  KeyRound,
  Laptop,
  LockKeyhole,
  MonitorSmartphone,
  Package,
  Printer,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
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
import { dashboardUrl } from "@/lib/host";
import homeSell from "@/assets/home-sell.png.asset.json";
import homeInventory from "@/assets/home-inventory.png.asset.json";
import homeReports from "@/assets/home-reports.png.asset.json";

const HOME_TITLE = "SEZA POS — Smart POS. Better business.";
const HOME_DESCRIPTION =
  "SEZA POS helps independent retailers sell faster, manage inventory, control cash, run employee shifts, work through internet outages and understand the business from one modern platform.";

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
    links: [{ rel: "canonical", href: "https://sezapos.com/" }],
  }),
  component: LandingPage,
});

const capabilityGroups = [
  {
    icon: ScanLine,
    eyebrow: "Checkout",
    title: "Keep the line moving",
    body: "A register designed around the actions cashiers use all day—not a dashboard squeezed onto a checkout screen.",
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
  { icon: Store, title: "Convenience stores", body: "Fast barcode checkout, age checks, cash control and shift accountability." },
  { icon: ShoppingBag, title: "Liquor & bottle shops", body: "Inventory visibility and manager-controlled age-verification workflows." },
  { icon: Box, title: "Mini marts & grocery", body: "Large catalogs, category taxes, quick keys and everyday stock movement." },
  { icon: Sparkles, title: "Beauty & specialty retail", body: "Variants, product images, employee access and customer receipt options." },
  { icon: Building2, title: "Apparel & sneaker stores", body: "Organized items, sizes, staff controls and clear product reporting." },
  { icon: ReceiptText, title: "Counter-service businesses", body: "Simple order entry, cash and card workflows, receipts and daily totals." },
];

const hardware = [
  { icon: MonitorSmartphone, title: "Countertop register", body: "A touch-friendly main screen for the cashier and day-to-day selling." },
  { icon: TabletSmartphone, title: "Tablet or Android device", body: "A flexible register for smaller counters, mobile service or backup use." },
  { icon: Printer, title: "Thermal receipt printer", body: "Compatible ESC/POS printing for clean, fast customer receipts." },
  { icon: Barcode, title: "Barcode scanner", body: "USB, Bluetooth HID or the device camera for fast item lookup." },
  { icon: Banknote, title: "Cash drawer", body: "Open automatically through compatible printer or hardware connections." },
  { icon: CreditCard, title: "Payment terminal", body: "Stripe Terminal-ready workflows for compatible readers after merchant and Android setup." },
  { icon: Laptop, title: "Owner computer", body: "Use the web dashboard on a modern laptop or desktop from anywhere." },
  { icon: Smartphone, title: "Customer display", body: "Show the store brand and sale details on a second compatible screen." },
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
    a: "Yes. Start with the device you have, then add a scanner, printer, cash drawer, customer display or payment reader as the business grows. A dedicated SEZA hardware selection experience is being prepared.",
  },
];

function LandingPage() {
  return (
    <MarketingShell>
      {/* The moving statement sits directly beneath the centered brand mark. */}
      <div className="seza-marquee border-b border-blue-100/80 bg-blue-50/70 text-blue-950 dark:border-blue-400/10 dark:bg-blue-500/5 dark:text-blue-100" aria-label="SEZA product promises">
        <div className="seza-marquee-track py-2.5 text-xs font-semibold uppercase tracking-[0.18em] sm:text-sm">
          {[0, 1].map((copy) => (
            <div className="flex shrink-0 items-center" key={copy} aria-hidden={copy === 1}>
              {[
                "Smart POS. Better business.",
                "Sell faster.",
                "Know your inventory.",
                "Control every shift.",
                "Built for independent stores.",
              ].map((phrase) => (
                <span className="flex items-center" key={`${copy}-${phrase}`}>
                  <span className="mx-6 inline-block size-1.5 rounded-full bg-blue-500/70" />
                  {phrase}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <section className="relative isolate overflow-hidden">
        <div className="seza-grid-bg absolute inset-0 -z-20 opacity-55" />
        <div className="absolute left-1/2 top-[-250px] -z-10 h-[560px] w-[760px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute -left-24 top-1/2 -z-10 size-80 rounded-full bg-cyan-300/10 blur-3xl" />

        <div className="mx-auto max-w-7xl px-6 pb-20 pt-16 sm:pt-20 lg:px-8 lg:pb-28 lg:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <Reveal>
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-3.5 py-2 text-xs font-semibold text-blue-700 shadow-sm backdrop-blur dark:border-blue-300/15 dark:bg-white/5 dark:text-blue-200">
                <BadgeCheck className="size-4" /> Built for the stores that keep communities moving
              </div>
              <h1 className="mt-7 text-balance text-5xl font-black tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-[5.25rem] lg:leading-[0.98] dark:text-white">
                Run the whole store from one simple POS.
              </h1>
              <p className="mx-auto mt-7 max-w-3xl text-pretty text-lg leading-8 text-slate-600 sm:text-xl dark:text-slate-300">
                Ring up sales, manage inventory, control cash, run employee shifts, send receipts and understand the day—without stitching together five different systems.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-13 w-full rounded-full px-7 text-base shadow-[0_18px_45px_-18px_rgba(37,99,235,0.9)] sm:w-auto">
                  <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">
                    Start free trial <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-13 w-full rounded-full border-slate-300 bg-white/75 px-7 text-base backdrop-blur sm:w-auto dark:border-white/15 dark:bg-white/5">
                  <a href="#inside-seza">See what is inside</a>
                </Button>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" /> 14-day free trial</span>
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" /> No credit card required</span>
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" /> Cancel anytime</span>
              </div>
            </Reveal>
          </div>

          <Reveal className="relative mx-auto mt-14 max-w-6xl lg:mt-18" delay={120}>
            <div className="absolute -inset-6 -z-10 rounded-[42px] bg-gradient-to-r from-blue-500/20 via-cyan-300/10 to-blue-700/15 blur-2xl" />
            <div className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-slate-950 p-2 shadow-[0_45px_110px_-45px_rgba(15,23,42,0.7)] sm:p-3">
              <div className="flex items-center justify-between rounded-t-[22px] bg-slate-900 px-4 py-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-rose-400/80" />
                  <span className="size-2.5 rounded-full bg-amber-300/80" />
                  <span className="size-2.5 rounded-full bg-emerald-400/80" />
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  <ShieldCheck className="size-3.5 text-blue-300" /> SEZA Register
                </div>
                <div className="w-14" />
              </div>
              <img src={homeSell.url} alt="SEZA POS register showing the checkout workspace" className="block w-full rounded-b-[22px] bg-white" />
            </div>

            <div className="seza-float-card absolute -left-4 top-24 hidden w-52 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xl backdrop-blur md:block dark:border-white/10 dark:bg-slate-900/90">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-700"><WifiOff className="size-5" /></span>
                <div><div className="text-sm font-bold">Offline cash mode</div><div className="text-xs text-muted-foreground">Keep the register moving</div></div>
              </div>
            </div>

            <div className="seza-float-card seza-float-card-delay absolute -right-4 bottom-24 hidden w-56 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xl backdrop-blur md:block dark:border-white/10 dark:bg-slate-900/90">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-blue-100 text-blue-700"><KeyRound className="size-5" /></span>
                <div><div className="text-sm font-bold">Manager protected</div><div className="text-xs text-muted-foreground">Approvals stay accountable</div></div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-950">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-slate-200/80 px-px sm:grid-cols-3 lg:grid-cols-5 dark:bg-white/10">
          {[
            { icon: Gauge, value: "Fast", label: "Touch-first checkout" },
            { icon: LockKeyhole, value: "Controlled", label: "Roles & manager PINs" },
            { icon: RefreshCw, value: "Resilient", label: "Offline cash sync" },
            { icon: HardDriveDownload, value: "Connected", label: "Cloud dashboard" },
            { icon: CreditCard, value: "Secure", label: "Billing through Stripe" },
          ].map((item) => (
            <div key={item.label} className="bg-white px-4 py-6 text-center dark:bg-slate-950">
              <item.icon className="mx-auto size-5 text-primary" />
              <div className="mt-2 text-sm font-bold">{item.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-7 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-7xl">
          <Link
            to="/hardware"
            className="group relative grid overflow-hidden rounded-[30px] border border-blue-200 bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 px-6 py-8 text-white shadow-[0_28px_80px_-38px_rgba(37,99,235,0.9)] transition-all hover:-translate-y-0.5 hover:shadow-[0_36px_90px_-38px_rgba(37,99,235,1)] sm:px-9 lg:grid-cols-[1fr_auto] lg:items-center lg:px-12"
          >
            <div className="seza-grid-bg absolute inset-0 opacity-15" />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] backdrop-blur">
                  <ShoppingCart className="size-4" /> SEZA Hardware Shop
                </span>
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-blue-700">Coming soon</span>
              </div>
              <h2 className="mt-5 text-balance text-3xl font-black tracking-[-0.035em] sm:text-4xl">Shop the complete setup built for your business.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50 sm:text-base">Choose a register, scanner, receipt printer, cash drawer, customer display and payment hardware from one professional SEZA shopping experience.</p>
            </div>
            <div className="relative mt-7 flex items-center gap-3 lg:mt-0 lg:pl-10">
              <span className="inline-flex h-12 items-center rounded-full bg-white px-6 text-sm font-black text-blue-700 shadow-lg transition-transform group-hover:scale-[1.03]">
                Shop now <ArrowRight className="ml-2 size-4" />
              </span>
            </div>
          </Link>
        </Reveal>
      </section>

      <section id="inside-seza" className="scroll-mt-28 bg-slate-50/75 py-24 dark:bg-slate-950/55">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">One connected operating system</p>
            <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">Everything the register needs. Everything the owner needs after closing.</h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">SEZA keeps checkout simple while the controls, records and reports stay organized behind it.</p>
          </Reveal>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {capabilityGroups.map((group, index) => (
              <Reveal key={group.title} delay={(index % 2) * 90}>
                <article className="group h-full rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_-30px_rgba(15,23,42,0.6)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_30px_70px_-35px_rgba(37,99,235,0.42)] sm:p-8 dark:border-white/10 dark:bg-slate-900/70">
                  <div className="flex items-start gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                      <group.icon className="size-6" />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{group.eyebrow}</p>
                      <h3 className="mt-2 text-2xl font-bold tracking-tight">{group.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{group.body}</p>
                    </div>
                  </div>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm leading-5 text-slate-700 dark:text-slate-300">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Real product views</p>
            <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">From the first scan to the final report.</h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">Cashiers get a focused selling screen. Owners get the inventory and reporting detail needed to run the business.</p>
          </Reveal>

          <div className="mt-14 grid gap-8 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <ProductImage src={homeInventory.url} alt="SEZA inventory management screen" label="Inventory" />
            </Reveal>
            <Reveal delay={100} className="lg:pl-10">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Inventory that follows the sale</p>
              <h3 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Stop guessing what moved.</h3>
              <p className="mt-5 text-base leading-7 text-muted-foreground">Products, stock changes, suppliers and item performance live in the same system as checkout, so the owner can trace what happened instead of rebuilding the story later.</p>
              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <MiniPoint icon={Barcode} title="Scan to find" body="Search or scan products quickly." />
                <MiniPoint icon={Package} title="Track movement" body="Sales and returns update stock." />
                <MiniPoint icon={CircleDollarSign} title="Watch margins" body="Keep price and cost together." />
                <MiniPoint icon={Cloud} title="See it remotely" body="Review inventory from the dashboard." />
              </div>
            </Reveal>
          </div>

          <div className="mt-20 grid gap-8 lg:grid-cols-2 lg:items-center">
            <Reveal className="order-2 lg:order-1 lg:pr-10">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Reports people can actually use</p>
              <h3 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Know how the day ended before tomorrow starts.</h3>
              <p className="mt-5 text-base leading-7 text-muted-foreground">Review sales, tenders, taxes, employees, products and register activity without exporting the basics to a spreadsheet first.</p>
              <ul className="mt-7 space-y-4">
                {[
                  "Compare cash and card totals",
                  "Review top items and category performance",
                  "See employee and shift activity",
                  "Find refunds, voids and cash movements",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm font-medium">
                    <span className="grid size-7 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"><Check className="size-4" /></span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100} className="order-1 lg:order-2">
              <ProductImage src={homeReports.url} alt="SEZA reports dashboard" label="Reports" />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-950 py-24 text-white dark:border-white/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Designed for real counters</p>
              <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">Start with the hardware you have. Build the setup you want.</h2>
            </div>
            <div className="lg:pb-1">
              <p className="text-lg leading-8 text-slate-300">SEZA is being prepared for a hardware selection experience that helps each merchant choose a complete setup for the way the business actually operates.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-full bg-white px-6 text-slate-950 hover:bg-slate-100">
                  <Link to="/hardware">View hardware compatibility <ArrowRight className="size-4" /></Link>
                </Button>
                <span className="inline-flex items-center rounded-full border border-white/15 px-4 text-sm text-slate-300">Hardware shop coming soon</span>
              </div>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {hardware.map((item, index) => (
              <Reveal key={item.title} delay={(index % 4) * 70}>
                <div className="group h-full rounded-3xl border border-white/10 bg-white/[0.055] p-5 transition-all hover:-translate-y-1 hover:border-blue-400/35 hover:bg-white/[0.085]">
                  <span className="grid size-11 place-items-center rounded-2xl bg-blue-500/15 text-blue-300"><item.icon className="size-5" /></span>
                  <h3 className="mt-4 font-bold">{item.title}</h3>
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
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Built around independent business</p>
            <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">Flexible enough for the store you run today.</h2>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((industry, index) => (
              <Reveal key={industry.title} delay={(index % 3) * 80}>
                <Link to="/industries" className="group flex h-full items-start gap-4 rounded-3xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-primary/35 hover:shadow-xl dark:border-white/10 dark:bg-slate-900/60">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><industry.icon className="size-6" /></span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-lg font-bold">{industry.title}<ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" /></span>
                    <span className="mt-2 block text-sm leading-6 text-muted-foreground">{industry.body}</span>
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
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Simple, transparent plans</p>
            <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">Start small. Move up when the business needs more.</h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">Every plan begins with a 14-day free trial. No credit card is required to test SEZA.</p>
          </Reveal>

          <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-3">
            {[
              { name: "Starter", price: "$29", note: "For owner-operated stores", points: ["Core POS checkout", "Inventory tools", "Basic reports"] },
              { name: "Pro", price: "$59", note: "For growing teams", points: ["Everything in Starter", "More employee tools", "SMS receipts & advanced reports"], featured: true },
              { name: "Business", price: "$89", note: "For advanced operations", points: ["Everything in Pro", "Expanded controls", "High-volume operations"] },
            ].map((plan) => (
              <div key={plan.name} className={`relative rounded-[28px] border p-7 ${plan.featured ? "border-primary bg-white shadow-[0_30px_80px_-35px_rgba(37,99,235,0.5)] dark:bg-slate-900" : "border-slate-200 bg-white/75 dark:border-white/10 dark:bg-slate-900/50"}`}>
                {plan.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">Most popular</div>}
                <div className="text-sm font-bold text-primary">{plan.name}</div>
                <div className="mt-3 flex items-end gap-1"><span className="text-4xl font-black tracking-tight">{plan.price}</span><span className="pb-1 text-sm text-muted-foreground">/month</span></div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.note}</p>
                <ul className="mt-6 space-y-3">
                  {plan.points.map((point) => <li key={point} className="flex items-center gap-2 text-sm"><Check className="size-4 text-emerald-600" />{point}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center"><Button asChild variant="outline" size="lg" className="rounded-full bg-white/80"><Link to="/pricing">Compare every plan <ArrowRight className="size-4" /></Link></Button></div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Questions before you begin</p>
            <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">Straight answers. No sales maze.</h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">Learn how the trial, hardware, offline mode, manager approvals and Stripe billing work before putting SEZA in front of a cashier.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="outline" className="rounded-full"><Link to="/faq">View all FAQs</Link></Button>
              <Button asChild variant="ghost" className="rounded-full"><Link to="/contact">Contact SEZA <ArrowRight className="size-4" /></Link></Button>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <Accordion type="single" collapsible className="rounded-[28px] border border-slate-200 bg-white px-5 shadow-sm dark:border-white/10 dark:bg-slate-900/60 sm:px-7">
              {faqs.map((faq, index) => (
                <AccordionItem value={`faq-${index}`} key={faq.q} className="border-slate-200/80 dark:border-white/10">
                  <AccordionTrigger className="py-5 text-left text-base font-bold hover:no-underline">{faq.q}</AccordionTrigger>
                  <AccordionContent className="pb-5 text-sm leading-7 text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

      <section className="px-6 pb-24 lg:px-8">
        <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-[36px] bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 px-6 py-16 text-center text-white shadow-[0_40px_100px_-40px_rgba(37,99,235,0.8)] sm:px-12 lg:py-20">
          <div className="seza-grid-bg absolute inset-0 opacity-15" />
          <div className="relative mx-auto max-w-3xl">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur"><Store className="size-7" /></div>
            <h2 className="mt-6 text-balance text-4xl font-black tracking-[-0.035em] sm:text-5xl">Give your store a smarter operating system.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-blue-50">Create the business, add a few products and run a real test sale. You will know quickly whether SEZA fits the way your store works.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-13 rounded-full bg-white px-7 text-blue-700 hover:bg-blue-50">
                <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">Start 14-day free trial <ArrowRight className="size-4" /></a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-13 rounded-full border-white/35 bg-transparent px-7 text-white hover:bg-white/10 hover:text-white">
                <Link to="/contact"><Headphones className="size-4" /> Talk to SEZA</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-blue-100">No credit card required. Subscription billing is securely processed by Stripe when you choose a plan.</p>
          </div>
        </Reveal>
      </section>
    </MarketingShell>
  );
}

function ProductImage({ src, alt, label }: { src: string; alt: string; label: string }) {
  return (
    <div className="group relative">
      <div className="absolute -inset-5 -z-10 rounded-[38px] bg-blue-500/12 blur-2xl transition-opacity group-hover:opacity-90" />
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 p-2 shadow-[0_35px_85px_-40px_rgba(15,23,42,0.75)] dark:border-white/10">
        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-slate-400">
          <div className="flex gap-1.5"><span className="size-2 rounded-full bg-rose-400" /><span className="size-2 rounded-full bg-amber-300" /><span className="size-2 rounded-full bg-emerald-400" /></div>
          <span className="font-semibold uppercase tracking-[0.18em]">{label}</span>
          <span className="w-10" />
        </div>
        <img src={src} alt={alt} loading="lazy" className="block w-full rounded-[20px] bg-white transition-transform duration-700 group-hover:scale-[1.015]" />
      </div>
    </div>
  );
}

function MiniPoint({ icon: Icon, title, body }: { icon: typeof Fingerprint; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <Icon className="size-5 text-primary" />
      <div className="mt-3 text-sm font-bold">{title}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{body}</div>
    </div>
  );
}
