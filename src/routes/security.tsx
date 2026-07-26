import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { Shield, Lock, Cloud, KeyRound, Eye, Server, AlertTriangle, FileCheck } from "lucide-react";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security — SEZA POS" },
      {
        name: "description",
        content:
          "How SEZA POS protects merchant data through encrypted connections, row-level authorization, role controls, audited operations, signed payment webhooks and Stripe-hosted billing.",
      },
      { property: "og:title", content: "Security — SEZA POS" },
      {
        property: "og:description",
        content:
          "Encrypted connections, access controls, audit trails and Stripe-hosted subscription billing.",
      },
    ],
  }),
  component: SecurityPage,
});

const PILLARS = [
  {
    icon: Lock,
    title: "Encrypted connections",
    body: "Production traffic is served over HTTPS/TLS so information is encrypted while moving between supported browsers, devices and SEZA services.",
  },
  {
    icon: KeyRound,
    title: "Least-privilege access",
    body: "Merchant records are protected with database authorization rules. Employees receive access based on the store, role and permissions assigned to them.",
  },
  {
    icon: Cloud,
    title: "Managed data platform",
    body: "SEZA uses managed cloud database and application services with provider security controls, operational monitoring and backup capabilities configured for the deployed environment.",
  },
  {
    icon: Server,
    title: "Separated surfaces",
    body: "The public website, merchant dashboard, Android register and platform-admin workflows are separated and require the appropriate authentication and role.",
  },
  {
    icon: Eye,
    title: "Audit history",
    body: "Sensitive operations—including refunds, voids, cash movements, permission changes and admin actions—can be recorded for review.",
  },
  {
    icon: FileCheck,
    title: "Stripe-hosted billing",
    body: `SEZA Subscription card details are handled by ${LEGAL_CONFIG.billingProcessor}. SEZA receives payment tokens and status information rather than storing full card numbers.`,
  },
];

function SecurityPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">Security</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
          Security is designed into the workflow.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          SEZA combines access controls, role-based permissions, audit records, protected payment
          integrations and operational safeguards designed for a multi-tenant point-of-sale
          platform.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-16 md:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((pillar) => (
          <div key={pillar.title} className="rounded-2xl border p-6">
            <div className="grid size-10 place-items-center rounded-lg bg-primary/10">
              <pillar.icon className="size-5 text-primary" />
            </div>
            <h3 className="mt-3 font-semibold">{pillar.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{pillar.body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-3xl space-y-8 px-6 py-12">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Shield className="size-5 text-primary" /> Merchant data boundaries
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Products, sales, employees, customers and operational records are scoped to the relevant
            merchant and store. Application queries are expected to pass through authorization
            policies, while elevated platform operations require separate admin access and are
            subject to audit controls.
          </p>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <AlertTriangle className="size-5 text-primary" /> Incident response
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            When a security incident is confirmed, SEZA's priorities are to contain the issue,
            preserve evidence, restore safe service, assess affected data and notify customers or
            authorities when required by law. Report suspected issues to{" "}
            <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.securityEmail}`}>
              {LEGAL_CONFIG.securityEmail}
            </a>
            .
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Responsible disclosure</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Please send a clear reproduction to{" "}
            <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.securityEmail}`}>
              {LEGAL_CONFIG.securityEmail}
            </a>
            . Do not disrupt live stores, use social engineering, access more data than necessary to
            demonstrate the issue, or publish sensitive details before SEZA has a reasonable
            opportunity to investigate and remediate.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12 text-center">
        <h2 className="text-2xl font-bold tracking-tight">More detail?</h2>
        <p className="mt-2 text-muted-foreground">
          Review the Trust Center and Legal Center for security, privacy and data-processing
          documentation.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link to="/trust">Visit Trust Center</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/legal">Legal Center</Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
