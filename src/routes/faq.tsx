import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — SEZA POS" },
      { name: "description", content: "Frequently asked questions about SEZA POS — pricing, hardware, security, data, onboarding, and support." },
      { property: "og:title", content: "SEZA POS — Frequently Asked Questions" },
      { property: "og:description", content: "Answers about pricing, hardware, security, data, and support." },
    ],
  }),
  component: FaqPage,
});

const GROUPS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: "Getting started",
    items: [
      { q: "How long does setup take?", a: "Most owners are running their first sale within 30–60 minutes. You'll create an account, add your business details, import or add a few products, and print a test receipt." },
      { q: "Do I need to install anything?", a: "No. SEZA is a cloud application. Open it in any modern browser on your register, tablet, or phone. No downloads, no updates to manage." },
      { q: "Can I import my existing products?", a: "Yes — upload a CSV of your products and stock levels from Settings > Inventory. If you have data from another POS, our team can help map it." },
      { q: "How many employees can I add?", a: "Every plan includes multiple employee logins with role-based permissions. See the pricing page for the exact seat allotment per plan." },
    ],
  },
  {
    title: "Pricing & billing",
    items: [
      { q: "Is there a free trial?", a: "Yes. Every plan includes a 14-day free trial. No credit card is required to start, and you can cancel any time." },
      { q: "Can I change plans later?", a: "Yes. Upgrade or downgrade from Settings > Billing. Changes are prorated." },
      { q: "How do I cancel?", a: "Cancel any time from Settings > Billing. You keep access through the end of your billing period. There is no cancellation fee." },
      { q: "Do you charge per terminal?", a: "No. SEZA is priced per plan, not per terminal. Run as many devices under one plan as your business needs." },
    ],
  },
  {
    title: "Hardware",
    items: [
      { q: "What hardware do I need?", a: "At minimum: a tablet, laptop, or PC with a modern browser. Most stores also add a barcode scanner, receipt printer, and cash drawer. See the Hardware page for compatible models." },
      { q: "Can I use my current scanner and printer?", a: "Most likely yes. SEZA supports standard USB and Bluetooth HID scanners and ESC/POS compatible receipt printers." },
      { q: "Do you support card terminals?", a: "Yes, through supported integrations. See the Integrations page for the current list." },
    ],
  },
  {
    title: "Security & data",
    items: [
      { q: "Where is my data stored?", a: "In a managed cloud database with encryption at rest, TLS in transit, daily backups, and row-level authorization scoped to your store. See the Security page for more detail." },
      { q: "Do you store card numbers?", a: "No. Card payments are processed by our merchant-of-record partner. SEZA never stores raw card data." },
      { q: "Can I export my data?", a: "Yes. Sales, inventory, employees, and customers are exportable as CSV any time. Your data is yours." },
      { q: "What happens if I cancel?", a: "You have export access through the end of your billing period. After the retention window ends, data is deleted per our data retention policy." },
    ],
  },
  {
    title: "Support",
    items: [
      { q: "How do I get help?", a: "Visit the Support page, email our support team, or open a case from inside the app. Response times depend on your plan; see the SLA in the Legal Center." },
      { q: "Do you offer onboarding?", a: "Yes — every new merchant gets access to our onboarding checklist and self-serve documentation. Higher-tier plans include guided setup." },
    ],
  },
];

function FaqPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-sm font-medium text-primary uppercase tracking-wide">FAQ</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">Frequently asked questions</h1>
        <p className="mt-5 text-lg text-muted-foreground">Everything owners typically ask before starting a trial.</p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16 space-y-10">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h2 className="text-xl font-bold tracking-tight mb-3">{g.title}</h2>
            <Accordion type="single" collapsible className="border rounded-xl divide-y">
              {g.items.map((it, i) => (
                <AccordionItem key={it.q} value={`${g.title}-${i}`} className="px-4">
                  <AccordionTrigger className="text-left">{it.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{it.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-6 py-12 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Still have questions?</h2>
        <p className="mt-2 text-muted-foreground">Our team is happy to help.</p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Button asChild><Link to="/contact">Contact us</Link></Button>
          <Button asChild variant="outline"><Link to="/support">Visit Support</Link></Button>
        </div>
      </section>
    </MarketingShell>
  );
}
