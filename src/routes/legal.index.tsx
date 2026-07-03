import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, FileText, Shield, Lock, Scale, Code2, ChevronRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Input } from "@/components/ui/input";
import { LEGAL_DOCUMENTS, LEGAL_CATEGORIES } from "@/lib/legal";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import type { LegalDocument } from "@/lib/legal/types";

export const Route = createFileRoute("/legal/")({
  head: () => ({
    meta: [
      { title: "Legal Center — SEZA POS" },
      { name: "description", content: "Terms, privacy, security, compliance, and other legal documents for the SEZA POS platform." },
      { property: "og:title", content: "Legal Center — SEZA POS" },
      { property: "og:description", content: "Every legal document that governs the SEZA POS platform in one place." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/legal" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/legal" }],
  }),
  component: LegalCenterPage,
});

const CATEGORY_ICON: Record<LegalDocument["category"], React.ComponentType<{ className?: string }>> = {
  Terms: Scale,
  Privacy: Lock,
  Policies: FileText,
  Trust: Shield,
  Developer: Code2,
};

function LegalCenterPage() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LEGAL_DOCUMENTS;
    return LEGAL_DOCUMENTS.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <MarketingShell>
      <div className="border-b bg-gradient-to-b from-muted/40 to-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
            <Scale className="h-3.5 w-3.5" /> Legal Center
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground max-w-3xl">
            Everything legal, in one place.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl">
            The agreements, policies, and trust documentation that govern how {LEGAL_CONFIG.productName} is built,
            operated, and used. Effective {LEGAL_CONFIG.effectiveDate}.
          </p>
          <div className="mt-8 relative max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents (e.g. refunds, security, GDPR)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 space-y-14">
        {LEGAL_CATEGORIES.map((cat) => {
          const docs = filtered.filter((d) => d.category === cat.id);
          if (docs.length === 0) return null;
          const Icon = CATEGORY_ICON[cat.id];
          return (
            <section key={cat.id}>
              <div className="flex items-start gap-3 mb-6">
                <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/10 text-primary shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">{cat.label}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{cat.description}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {docs.map((d) => (
                  <Link
                    key={d.slug}
                    to={`/legal/${d.slug}`}
                    className="group relative rounded-xl border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-md"
                  >
                    <h3 className="font-semibold text-foreground leading-tight">{d.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{d.summary}</p>
                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Updated {d.lastUpdated}</span>
                      <ChevronRight className="h-4 w-4 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            No documents match "{query}".
          </div>
        )}

        <div className="rounded-2xl border bg-muted/30 p-8 sm:p-10 text-center">
          <h3 className="text-xl font-bold text-foreground">Need something else?</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
            For legal notices, contract requests, or law-enforcement inquiries, please email us at{" "}
            <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.legalEmail}`}>
              {LEGAL_CONFIG.legalEmail}
            </a>
            . For security disclosures, use{" "}
            <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.securityEmail}`}>
              {LEGAL_CONFIG.securityEmail}
            </a>
            .
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
