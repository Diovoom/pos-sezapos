import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { Shield, Lock, Cloud, KeyRound, Eye, Server, AlertTriangle, FileCheck } from "lucide-react";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security — SEZA POS" },
      { name: "description", content: "How SEZA POS protects merchant data: encryption in transit and at rest, row-level authorization, verified webhook signatures, continuous backups, and PCI-compliant payments." },
      { property: "og:title", content: "Security — SEZA POS" },
      { property: "og:description", content: "Encryption, access controls, PCI-compliant payments, and continuous backups." },
    ],
  }),
  component: SecurityPage,
});

const PILLARS = [
  { icon: Lock, title: "Encryption everywhere", body: "All traffic to and from SEZA is served over TLS. Data at rest is encrypted with industry-standard algorithms provided by our cloud infrastructure." },
  { icon: KeyRound, title: "Least-privilege access", body: "Every merchant record is protected by row-level authorization. Employees only see the data their role permits, enforced at the database layer." },
  { icon: Cloud, title: "Continuous backups", body: "Managed daily backups with point-in-time recovery on the underlying platform. Cross-region replication for durability." },
  { icon: Server, title: "Modern infrastructure", body: "SEZA runs on modern managed cloud services. No self-hosted servers to patch; security updates are applied continuously by our providers." },
  { icon: Eye, title: "Audit trail", body: "Sensitive actions are logged: refunds, voids, permission changes, and administrative operations. Owners can review the log in Settings." },
  { icon: FileCheck, title: "PCI-compliant payments", body: `Card data is handled by ${LEGAL_CONFIG.merchantOfRecord} as merchant of record. SEZA never stores raw card numbers.` },
];

function SecurityPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-sm font-medium text-primary uppercase tracking-wide">Security</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">Security is the foundation, not a feature.</h1>
        <p className="mt-5 text-lg text-muted-foreground">
          SEZA POS is built on modern cloud infrastructure with defense in depth: strong encryption, row-level authorization, verified payment webhooks, and continuous backups.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="rounded-xl border p-6">
            <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center">
              <p.icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="mt-3 font-semibold">{p.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Data handling</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Merchant business data (products, sales, employees, customers) is stored in our managed database with row-level policies scoped to the owning store. Employees authenticate individually and inherit only the permissions their role grants. All queries pass through those policies — including our own internal tooling.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-primary" /> Incident response</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            If a security incident is confirmed, our commitment is to notify affected customers promptly, contain and remediate, and publish a public post-mortem when appropriate. Report suspected issues to <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.securityEmail}`}>{LEGAL_CONFIG.securityEmail}</a>.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Responsible disclosure</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            We welcome coordinated disclosure of security issues. Please email <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.securityEmail}`}>{LEGAL_CONFIG.securityEmail}</a> with a clear reproduction. We ask that you avoid disrupting live customer stores, do not access data beyond what is required to demonstrate the issue, and give us a reasonable window to remediate before public disclosure.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-12 text-center">
        <h2 className="text-2xl font-bold tracking-tight">More detail?</h2>
        <p className="mt-2 text-muted-foreground">See the Trust Center and Legal Center for policies and compliance documentation.</p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Button asChild><Link to="/trust">Visit Trust Center</Link></Button>
          <Button asChild variant="outline"><Link to="/legal">Legal Center</Link></Button>
        </div>
      </section>
    </MarketingShell>
  );
}
