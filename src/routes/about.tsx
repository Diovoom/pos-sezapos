import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { Shield, Zap, Heart, Users, Lock, Cloud } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — SEZA POS" },
      { name: "description", content: `Learn about ${LEGAL_CONFIG.companyName}, the team behind SEZA POS, our mission, values, and commitment to building reliable point-of-sale software for independent retailers.` },
      { property: "og:title", content: "About SEZA POS" },
      { property: "og:description", content: "Our mission, values, and commitment to independent retailers." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AboutPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
        <p className="text-sm font-medium text-primary uppercase tracking-wide">About {LEGAL_CONFIG.companyName}</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">Point of sale, done right for independent retail.</h1>
        <p className="mt-5 text-lg text-muted-foreground">
          SEZA POS is built for the shops that keep neighborhoods running — convenience stores, liquor stores, mini marts, and specialty retail. We believe those businesses deserve software that is fast, dependable, and priced fairly.
        </p>
      </section>

      <Section title="Our story">
        <p>
          SEZA POS was created to give independent retailers the same quality of point-of-sale software that large chains have relied on for years — without the complexity, long contracts, or per-terminal upcharges. The team behind SEZA has spent years building operational tools for retail businesses and saw a consistent gap: most POS platforms either target enterprise buyers or feel like consumer apps stretched too thin.
        </p>
        <p>
          We built SEZA to be the middle ground done well: a professional platform an owner can configure in an afternoon, a cashier can learn in ten minutes, and a business can grow into over years.
        </p>
      </Section>

      <Section title="Our mission">
        <p>
          To make running a retail business less stressful. Every feature we ship is measured against a simple question: does this remove friction for the person behind the counter, or the owner reading the daily close?
        </p>
      </Section>

      <Section title="Our vision">
        <p>
          A world where independent retailers compete on the strength of their product, service, and community — not on whether they can afford the same software as the chains next door.
        </p>
      </Section>

      <Section title="Why we built SEZA POS">
        <p>
          Legacy POS software is expensive, slow to update, and locks merchants into hardware they don't need. Newer alternatives often skip the depth that real stores require: shifts, refunds, purchase orders, tax rules, offline fallback. We built SEZA to close that gap — modern cloud infrastructure, real depth, honest pricing.
        </p>
      </Section>

      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-8">Our values</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Zap, title: "Speed matters", body: "A slow POS costs real money in lost throughput. Every screen is measured against how fast a cashier can move." },
            { icon: Shield, title: "Trust is earned", body: "We treat merchant data with the same care we would want for our own business. Security is not a feature — it is the foundation." },
            { icon: Heart, title: "Serve the operator", body: "The person we design for is the owner opening at 6am, not the buyer in a procurement meeting." },
            { icon: Users, title: "Support that answers", body: "Real people, in your timezone, who understand retail. Not a chatbot that reroutes you three times." },
            { icon: Lock, title: "No lock-in", body: "Your data is yours. Export it any time. Cancel any time. We earn the next month by being useful this month." },
            { icon: Cloud, title: "Ship continuously", body: "Cloud software should get better every week. We release incrementally so improvements land quickly and safely." },
          ].map((v) => (
            <div key={v.title} className="rounded-xl border p-6">
              <v.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{v.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Section title="Our security commitment">
        <p>
          SEZA POS is built on modern cloud infrastructure with encryption in transit and at rest, row-level security on every merchant record, verified webhook signatures for payment events, and continuous automated backups. Payments are processed by {LEGAL_CONFIG.merchantOfRecord} as merchant of record, which handles PCI compliance for card data on our behalf. See the <Link to="/security" className="text-primary underline">Security</Link> and <Link to="/trust" className="text-primary underline">Trust Center</Link> pages for details.
        </p>
      </Section>

      <Section title="Our reliability commitment">
        <p>
          Retail runs on uptime. SEZA is designed with resilience in mind: multi-region cloud hosting, health-checked services, defensive fallbacks in the checkout path, and staged rollouts for every release. When something does go wrong, our commitment is to communicate quickly, resolve fully, and post a public write-up.
        </p>
      </Section>

      <Section title="Future roadmap">
        <p>
          We publish updates on our <Link to="/blog" className="text-primary underline">blog</Link> as features ship. Near-term areas of investment include richer analytics, deeper integrations with accounting platforms, and expanded hardware support. Longer term we are working on advanced inventory forecasting, first-class multi-store operations, and additional payment methods.
        </p>
      </Section>

      <Section title="Company information">
        <ul className="space-y-1 text-sm">
          <li><strong className="text-foreground">Legal name:</strong> {LEGAL_CONFIG.companyName}</li>
          <li><strong className="text-foreground">Product:</strong> {LEGAL_CONFIG.productName}</li>
          <li><strong className="text-foreground">Website:</strong> {LEGAL_CONFIG.website}</li>
          <li><strong className="text-foreground">Business address:</strong> {LEGAL_CONFIG.businessAddress}</li>
          <li><strong className="text-foreground">Support:</strong> <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.supportEmail}`}>{LEGAL_CONFIG.supportEmail}</a></li>
        </ul>
      </Section>

      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Ready to see it in action?</h2>
        <p className="mt-2 text-muted-foreground">Start a 14-day free trial. No long-term contract.</p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Button asChild size="lg"><Link to="/signup">Start free trial</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/contact">Talk to sales</Link></Button>
        </div>
      </section>
    </MarketingShell>
  );
}
