import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import {
  Shield,
  Lock,
  FileCheck,
  Activity,
  HeartHandshake,
  BookOpen,
  Database,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust Center  -  SEZA POS" },
      {
        name: "description",
        content: `${LEGAL_CONFIG.companyName}'s Trust Center: security practices, compliance posture, system status, privacy, incident response, and responsible disclosure.`,
      },
      { property: "og:title", content: "SEZA POS  -  Trust Center" },
      {
        property: "og:description",
        content: "Security, compliance, status, privacy, and incident response.",
      },
    ],
  }),
  component: TrustPage,
});

const TILES = [
  {
    icon: Shield,
    title: "Security",
    body: "Encryption, access control, and defense in depth.",
    to: "/security",
    external: false,
  },
  {
    icon: FileCheck,
    title: "Compliance",
    body: "Merchant obligations, Stripe billing and certification limits.",
    slug: "compliance",
  },
  {
    icon: Activity,
    title: "System status",
    body: "Live application health, service checks, and incident contact information.",
    to: "/status",
    external: false,
  },
  {
    icon: Lock,
    title: "Privacy",
    body: "How we collect, use, and protect your data.",
    slug: "privacy",
  },
  {
    icon: BookOpen,
    title: "Legal Center",
    body: "Terms, privacy, availability, and all published policies.",
    to: "/legal",
    external: false,
  },
  {
    icon: AlertCircle,
    title: "Incident response",
    body: "How we detect, contain, and communicate incidents.",
    to: "/security",
    external: false,
  },
  {
    icon: Lock,
    title: "Encryption",
    body: "Protected connections and managed-service security controls.",
    to: "/security",
    external: false,
  },
  {
    icon: Database,
    title: "Backups",
    body: "Managed-provider recovery capabilities and merchant continuity planning.",
    to: "/security",
    external: false,
  },
  {
    icon: HeartHandshake,
    title: "Responsible disclosure",
    body: `Report issues to ${LEGAL_CONFIG.securityEmail}.`,
    mail: true,
  },
];

function TrustPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-sm font-medium text-primary uppercase tracking-wide">Trust Center</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
          How we earn and keep your trust.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          This page is maintained by {LEGAL_CONFIG.companyName} to summarize the security, privacy,
          and reliability practices that underpin {LEGAL_CONFIG.productName}. It is app-owned
          content and is not an independent certification.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {TILES.map((t) => {
          const inner = (
            <>
              <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center">
                <t.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-3 font-semibold">{t.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
            </>
          );
          const cls = "rounded-xl border p-6 hover:border-primary/40 transition-colors block";
          if ("to" in t && t.to)
            return (
              <Link key={t.title} to={t.to} className={cls}>
                {inner}
              </Link>
            );
          if ("slug" in t && t.slug)
            return (
              <Link key={t.title} to="/legal/$slug" params={{ slug: t.slug }} className={cls}>
                {inner}
              </Link>
            );
          if ("mail" in t && t.mail)
            return (
              <a key={t.title} href={`mailto:${LEGAL_CONFIG.securityEmail}`} className={cls}>
                {inner}
              </a>
            );
          return (
            <div key={t.title} className={cls}>
              {inner}
            </div>
          );
        })}
      </section>

      <section className="max-w-3xl mx-auto px-6 py-8 text-sm text-muted-foreground text-center border-t">
        Questions about our security or compliance posture? Contact{" "}
        <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.securityEmail}`}>
          {LEGAL_CONFIG.securityEmail}
        </a>
        .
      </section>
    </MarketingShell>
  );
}
