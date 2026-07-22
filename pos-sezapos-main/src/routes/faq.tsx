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
      { q: "How long does setup take?", a: "Setup time depends on the catalog, hardware, receipt configuration, employees, and payment setup. A basic test store can be created quickly, while a production rollout should include hardware and workflow testing." },
      { q: "Do I need to install anything?", a: "The merchant website runs in a modern browser. The dedicated Android register is installed as an app so it can use supported native scanning, device, printing, and offline capabilities." },
      { q: "Can I import my existing products?", a: "SEZA includes product-entry and bulk-import workflows. The exact source format may need cleanup or mapping before it can be imported safely." },
      { q: "How many employees can I add?", a: "Every plan includes multiple employee logins with role-based permissions. See the pricing page for the exact seat allotment per plan." },
    ],
  },
  {
    title: "Pricing & billing",
    items: [
      { q: "Is there a free trial?", a: "Yes. Every plan includes a 14-day free trial. No credit card is required to start, and you can cancel any time." },
      { q: "Can I change plans later?", a: "Yes. Upgrade or downgrade from Settings > Billing. Changes are prorated." },
      { q: "How do I cancel?", a: "Cancel any time from Settings > Billing. You keep access through the end of your billing period. There is no cancellation fee." },
      { q: "Do you charge per terminal?", a: "SEZA is priced by plan. Device, employee, store, and feature limits are determined by the current plan details shown during signup or billing." },
    ],
  },
  {
    title: "Hardware",
    items: [
      { q: "What hardware do I need?", a: "At minimum: a tablet, laptop, or PC with a modern browser. Most stores also add a barcode scanner, receipt printer, and cash drawer. See the Hardware page for compatible models." },
      { q: "Can I use my current scanner and printer?", a: "Many standard USB or Bluetooth HID scanners can work, and SEZA includes ESC/POS-oriented receipt workflows. Printer compatibility still depends on model, connection, device, and driver setup." },
      { q: "Do you support card terminals?", a: "SEZA contains Stripe Terminal-ready architecture, but in-person card use requires an approved merchant account, supported reader, live configuration, and an Android build with the required native plugin. See the Integrations page for current status." },
    ],
  },
  {
    title: "Security & data",
    items: [
      { q: "Where is my data stored?", a: "In the configured managed cloud environment, with protected connections and merchant/store authorization controls. Backup and recovery capabilities depend on the deployed providers and configuration. See the Security page for current public details." },
      { q: "Do you store card numbers?", a: "SEZA does not store full subscription card numbers on its own servers. Subscription billing is handled through Stripe-hosted payment experiences, while customer card acceptance depends on the connected payment provider and supported hardware." },
      { q: "Can I export my data?", a: "Export tools are available for supported reports and directories. Availability varies by record type, and additional export coverage may be added as the platform develops." },
      { q: "What happens if I cancel?", a: "Paid access generally continues through the end of the current billing period unless the account is suspended for another reason. Data is then handled under the Terms and Privacy Policy, including applicable legal and backup retention." },
    ],
  },
  {
    title: "Support",
    items: [
      { q: "How do I get help?", a: "Visit the Support page, email support@sezapos.com, or open a case from inside the merchant experience when available. Response timing depends on issue severity, available support coverage, and the applicable plan or written agreement." },
      { q: "Do you offer onboarding?", a: "SEZA provides onboarding steps inside the product. Any guided setup or implementation assistance is offered only when it is included in the selected plan or confirmed in writing." },
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
