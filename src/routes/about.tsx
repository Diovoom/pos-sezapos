import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { dashboardUrl } from "@/lib/host";
import { Shield, Zap, Heart, Users, Lock, Cloud } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us  -  SEZA POS" },
      {
        name: "description",
        content: `Learn about ${LEGAL_CONFIG.companyName}, the team behind SEZA POS, our mission, values, and commitment to building reliable point-of-sale software for independent retailers.`,
      },
      { property: "og:title", content: "About Us  -  SEZA POS" },
      {
        property: "og:description",
        content: "Our mission, values, and commitment to independent retailers.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AboutPage,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="max-w-3xl mx-auto px-6 py-10">
      <h2 className="text-2xl font-bold tracking-tight mb-4">{title}</h2>
      <div className="text-muted-foreground leading-relaxed space-y-4">{children}</div>
    </section>
  );
}

function AboutPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-sm font-medium text-primary uppercase tracking-wide">
          About Us
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
          Built around the business behind the counter.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          SEZA brings checkout, inventory, employees, cash management and reporting together in one system built for independent retail.
        </p>
      </section>

      <Section title="Our story">
        <p>
          Running a store means making hundreds of small decisions every day. What sold? What needs to be reordered? Who is working? Does the drawer match? What happens if the internet goes down? The point of sale sits in the middle of all of it.
        </p>
        <p>
          SEZA is being built around a simple idea: the system behind the counter should make running the business easier, not become another thing the owner has to manage. Checkout, inventory, employees, cash control and reporting should work together as one operation.
        </p>
      </Section>

      <Section title="Our mission">
        <p>
          To make running a retail business less stressful. Every feature we ship is measured
          against a simple question: does this remove friction for the person behind the counter, or
          the owner reading the daily close?
        </p>
      </Section>

      <Section title="Our vision">
        <p>
          A world where independent retailers compete on the strength of their product, service, and
          community - not on whether they can afford the same software as the chains next door.
        </p>
      </Section>

      <Section title="Why we built SEZA POS">
        <p>
          Legacy POS software is expensive, slow to update, and locks merchants into hardware they
          don't need. Newer alternatives often skip the depth that real stores require: shifts,
          refunds, purchase orders, tax rules, offline fallback. We built SEZA to close that gap -
          modern cloud infrastructure, real depth, honest pricing.
        </p>
      </Section>

      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-8">Our values</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Zap,
              title: "Speed matters",
              body: "A slow POS costs real money in lost throughput. Every screen is measured against how fast a cashier can move.",
            },
            {
              icon: Shield,
              title: "Trust is earned",
              body: "We treat merchant data with the same care we would want for our own business. Security is not a feature  -  it is the foundation.",
            },
            {
              icon: Heart,
              title: "Serve the operator",
              body: "The person we design for is the owner opening at 6am, not the buyer in a procurement meeting.",
            },
            {
              icon: Users,
              title: "Support that listens",
              body: "Merchant questions and product issues should reach a support workflow that keeps context and follows the problem through resolution.",
            },
            {
              icon: Lock,
              title: "Merchant control",
              body: "Merchant data stays connected to the merchant account, subscriptions can be cancelled, and practical export tools are added where the workflow requires them.",
            },
            {
              icon: Cloud,
              title: "Ship continuously",
              body: "Cloud software should get better every week. We release incrementally so improvements land quickly and safely.",
            },
          ].map((v) => (
            <div key={v.title} className="rounded-xl border p-6">
              <v.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{v.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="grid md:grid-cols-[0.8fr_1.2fr]">
            <img
              src="/dave-arthur-marcelin-founder.jpg"
              alt="Dave Arthur Marcelin, founder of SEZA"
              width={1104}
              height={1472}
              loading="lazy"
              decoding="async"
              className="h-full max-h-[520px] w-full object-cover object-top"
            />
            <div className="flex flex-col justify-center p-7 sm:p-10">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Founder</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">Dave Arthur Marcelin</h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                Dave leads SEZA's product vision and development, with a focus on building practical technology for independent retailers.
              </p>
              <a
                href="https://www.linkedin.com/in/dave-marcelin-3365b7269"
                target="_blank"
                rel="me noopener noreferrer"
                className="mt-6 inline-flex w-fit items-center font-semibold text-primary underline underline-offset-4"
              >
                View LinkedIn profile
              </a>
            </div>
          </div>
        </div>
      </section>

      <Section title="Our security commitment">
        <p>
          SEZA POS uses encrypted production connections, store-scoped database authorization,
          role-based access, audit records for sensitive actions, and verified Stripe webhook
          handling. Subscription card details are handled by {LEGAL_CONFIG.billingProcessor}; SEZA
          does not store full subscription card numbers on its own servers. See the{" "}
          <Link to="/security" className="text-primary underline">
            Security
          </Link>{" "}
          and{" "}
          <Link to="/trust" className="text-primary underline">
            Trust Center
          </Link>{" "}
          pages for details.
        </p>
      </Section>

      <Section title="Our reliability commitment">
        <p>
          Retail runs on uptime. SEZA is designed with guarded checkout flows, clear device status,
          Android cash-only offline recording, synchronization controls, and operational
          diagnostics. When something goes wrong, our commitment is to investigate it, communicate
          useful status, restore safe service, and document meaningful incidents when appropriate.
        </p>
      </Section>

      <Section title="Future roadmap">
        <p>
          Near-term work includes expanded compatible hardware, clearer merchant onboarding, deeper
          reporting, stronger offline operations, and additional integrations. New capabilities will
          be presented as available only after they are ready for merchants to use.
        </p>
      </Section>

      <Section title="Company information">
        <ul className="space-y-1 text-sm">
          <li>
            <strong className="text-foreground">Legal name:</strong> {LEGAL_CONFIG.companyName}
          </li>
          <li>
            <strong className="text-foreground">Product:</strong> {LEGAL_CONFIG.productName}
          </li>
          <li>
            <strong className="text-foreground">Website:</strong> {LEGAL_CONFIG.website}
          </li>
          <li>
            <strong className="text-foreground">Support:</strong>{" "}
            <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.supportEmail}`}>
              {LEGAL_CONFIG.supportEmail}
            </a>
          </li>
          <li>
            <strong className="text-foreground">Legal notices:</strong>{" "}
            <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.legalEmail}`}>
              {LEGAL_CONFIG.legalEmail}
            </a>
          </li>
        </ul>
      </Section>

      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Ready to see it in action?</h2>
        <p className="mt-2 text-muted-foreground">
          Start a 14-day free trial. No long-term contract.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Button asChild size="lg">
            <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">
              Start free trial
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/contact">Talk to sales</Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
