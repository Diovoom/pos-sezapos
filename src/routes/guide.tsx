import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Barcode,
  BookOpen,
  Boxes,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  CloudOff,
  CreditCard,
  Headphones,
  PackagePlus,
  Printer,
  ReceiptText,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { openWebsiteLiveChat } from "@/components/marketing/WebsiteLiveChat";
import { dashboardUrl } from "@/lib/host";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "SEZA POS User Guide  -  Setup, Sales, Inventory and Shifts" },
      {
        name: "description",
        content:
          "Learn what is included in SEZA POS and how to set up a store, add products, make sales, manage shifts, work offline and review reports.",
      },
      { property: "og:title", content: "SEZA POS User Guide" },
      {
        property: "og:description",
        content:
          "A practical guide to the SEZA register, owner dashboard, inventory, employees, payments, receipts, shifts and reports.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/guide" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/guide" }],
  }),
  component: GuidePage,
});

const steps = [
  {
    number: "01",
    icon: Store,
    title: "Create and configure the store",
    description:
      "The owner creates the business, confirms store details, sets taxes, receipt information and operating preferences, then pairs the register that will be used at the counter.",
    checks: [
      "Business and store profile",
      "Tax and receipt settings",
      "Register pairing and device controls",
    ],
  },
  {
    number: "02",
    icon: PackagePlus,
    title: "Build the product catalog",
    description:
      "Add products manually or with supported import tools. Assign a price, cost, barcode, category, tax setting and starting inventory so every sale updates the correct item.",
    checks: [
      "Products, categories and barcodes",
      "Prices, costs and tax rules",
      "Stock counts and low-stock visibility",
    ],
  },
  {
    number: "03",
    icon: Users,
    title: "Add employees and permissions",
    description:
      "Create employee profiles, assign cashier or manager access and provide each person with their own secure sign-in method. Managers approve protected actions without sharing accounts.",
    checks: [
      "Employee PIN access",
      "Cashier and manager roles",
      "Clock-in and protected approvals",
    ],
  },
  {
    number: "04",
    icon: Barcode,
    title: "Make the first sale",
    description:
      "Open the register, scan or search for products, review the cart and choose a payment method. SEZA records the transaction and updates inventory when the sale completes.",
    checks: [
      "Scanner or product search",
      "Discounts, taxes and cart review",
      "Cash, card and supported contactless flows",
    ],
  },
  {
    number: "05",
    icon: ReceiptText,
    title: "Give the customer a receipt",
    description:
      "Use the receipt option supported by the store setup. Printed receipts require a compatible receipt printer, while digital options depend on the configured service and connection.",
    checks: [
      "Printed receipt workflow",
      "Email or SMS where configured",
      "Transaction history for reprints and refunds",
    ],
  },
  {
    number: "06",
    icon: ClipboardCheck,
    title: "Close and review the shift",
    description:
      "At the end of a shift, the cashier or manager reviews cash activity, records required counts and closes the shift. Owners can review differences, sales and employee activity from the dashboard.",
    checks: [
      "Opening and closing cash",
      "Shift review and safe-drop records",
      "Owner reports and audit history",
    ],
  },
];

const insideSeza = [
  {
    icon: Barcode,
    title: "Touch-first register",
    body: "Fast product scanning, cart controls, discounts, taxes and customer checkout.",
  },
  {
    icon: Boxes,
    title: "Inventory",
    body: "Products, categories, stock movements, low-stock visibility, costs and suppliers.",
  },
  {
    icon: Users,
    title: "Employees and shifts",
    body: "Employee access, clock-in, manager permissions, drawer accountability and time records.",
  },
  {
    icon: CircleDollarSign,
    title: "Sales and refunds",
    body: "Transaction history, full or partial refunds, protected actions and restocking options.",
  },
  {
    icon: ReceiptText,
    title: "Receipts",
    body: "Printed and configured digital receipt workflows with searchable transaction records.",
  },
  {
    icon: ShieldCheck,
    title: "Owner controls",
    body: "Role-based access, device management, audit history and protected settings.",
  },
  {
    icon: CloudOff,
    title: "Limited offline cash mode",
    body: "Eligible cash sales can queue on supported Android registers until the connection returns.",
  },
  {
    icon: Banknote,
    title: "Cash management",
    body: "Opening cash, drawer actions, shift counts, safe drops and variance review.",
  },
  {
    icon: CreditCard,
    title: "Payments",
    body: "Supported payment-reader workflows are configured separately from the register software.",
  },
  {
    icon: Printer,
    title: "Hardware support",
    body: "Plan scanners, printers, printer-driven cash drawers, customer displays and register devices.",
  },
];

function GuidePage() {
  return (
    <MarketingShell>
      <section className="border-b border-blue-100 bg-white dark:border-blue-400/10 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-black uppercase tracking-[0.14em] text-blue-800 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
                <BookOpen className="size-4" /> SEZA POS user guide
              </div>
              <h1 className="mt-6 max-w-4xl text-balance text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl dark:text-white">
                Learn the register, inventory, shifts and owner controls.
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                This guide explains what merchants receive inside SEZA POS and the practical path
                from creating a store to completing and reviewing the first day of sales.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-full bg-blue-700 px-7 hover:bg-blue-800"
                >
                  <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">
                    Start free trial <ArrowRight className="ml-2 size-4" />
                  </a>
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-blue-200 px-7 text-blue-800"
                  onClick={openWebsiteLiveChat}
                >
                  Ask support <Headphones className="ml-2 size-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-[28px] border border-blue-200 bg-blue-800 p-7 text-white shadow-[0_28px_70px_-38px_rgba(30,64,175,0.9)] sm:p-9">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-white text-blue-800">
                  <BadgeCheck className="size-6" />
                </span>
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-blue-200">
                    What is included
                  </div>
                  <div className="text-xl font-black">One connected store workflow</div>
                </div>
              </div>
              <div className="mt-7 space-y-3">
                {[
                  "Cashier register",
                  "Owner dashboard",
                  "Inventory and reports",
                  "Employees and shifts",
                  "Support and device controls",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-xl border border-white/15 bg-blue-900/60 px-4 py-3 text-sm font-semibold"
                  >
                    <Check className="size-4 shrink-0 text-emerald-300" /> {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-blue-50/70 py-20 dark:bg-blue-950/20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.17em] text-blue-700 dark:text-blue-300">
              Start here
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
              From setup to the first closed shift
            </h2>
            <p className="mt-4 text-slate-600 dark:text-slate-300">
              Follow these steps in order when preparing a new store or training a new merchant.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {steps.map((step) => (
              <article
                key={step.number}
                className="rounded-[24px] border border-blue-100 bg-white p-6 shadow-sm dark:border-blue-400/10 dark:bg-slate-900 sm:p-7"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-12 place-items-center rounded-2xl bg-blue-700 text-white">
                    <step.icon className="size-6" />
                  </span>
                  <span className="text-3xl font-black text-blue-100 dark:text-blue-900">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-black">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {step.description}
                </p>
                <div className="mt-5 space-y-2">
                  {step.checks.map((check) => (
                    <div
                      key={check}
                      className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"
                    >
                      <Check className="size-4 shrink-0 text-emerald-600" /> {check}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.17em] text-blue-700 dark:text-blue-300">
              Inside SEZA
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
              The tools merchants use throughout the day
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {insideSeza.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">
                  <item.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-black">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-blue-200 bg-blue-800 py-16 text-white dark:border-blue-400/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-7 px-6 text-center lg:flex-row lg:text-left">
          <div>
            <h2 className="text-3xl font-black tracking-[-0.03em]">
              Need help planning your exact setup?
            </h2>
            <p className="mt-2 max-w-2xl text-blue-100">
              Tell SEZA Support what type of store you operate and which register, scanner, printer
              or payment hardware you already have.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="h-12 shrink-0 rounded-full bg-white px-7 text-blue-800 hover:bg-blue-50"
            onClick={openWebsiteLiveChat}
          >
            Start live chat <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
