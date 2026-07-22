import { useMemo, useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Printer, Download, Search, ChevronRight, ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import type { LegalDocument, LegalSection } from "@/lib/legal/types";
import { cn } from "@/lib/utils";

type Props = { doc: LegalDocument };

function flatten(sections: LegalSection[], depth = 0): Array<LegalSection & { depth: number }> {
  const out: Array<LegalSection & { depth: number }> = [];
  for (const s of sections) {
    out.push({ ...s, depth });
    if (s.children?.length) out.push(...flatten(s.children, depth + 1));
  }
  return out;
}

function sectionMatches(section: LegalSection, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const inTitle = section.title.toLowerCase().includes(lower);
  const inBody =
    typeof section.body === "string"
      ? section.body.toLowerCase().includes(lower)
      : JSON.stringify(section.body ?? "").toLowerCase().includes(lower);
  const inChildren = section.children?.some((c) => sectionMatches(c, q)) ?? false;
  return inTitle || inBody || inChildren;
}

export function LegalDocumentView({ doc }: Props) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const allSections = useMemo(() => flatten(doc.sections), [doc.sections]);
  const filteredTopLevel = useMemo(
    () => doc.sections.filter((s) => sectionMatches(s, query)),
    [doc.sections, query]
  );

  // Scroll-spy for active TOC highlight
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    allSections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [allSections]);

  const handlePrint = () => window.print();

  return (
    <div className="bg-background">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-container { max-width: 100% !important; padding: 0 !important; }
          .print-body { grid-template-columns: 1fr !important; }
          h1, h2, h3 { page-break-after: avoid; }
          section { page-break-inside: avoid; }
          body { font-size: 11pt; }
        }
      `}</style>

      <div className="print-container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Breadcrumb */}
        <nav className="no-print flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/legal" className="hover:text-foreground">Legal Center</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{doc.shortTitle}</span>
        </nav>

        {/* Header */}
        <header className="border-b pb-8 mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                <FileText className="h-3.5 w-3.5" />
                {doc.category}
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
                {doc.title}
              </h1>
              <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-3xl">
                {doc.summary}
              </p>
              <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 text-sm max-w-md">
                <div>
                  <dt className="text-muted-foreground">Effective date</dt>
                  <dd className="font-medium text-foreground">{doc.effectiveDate}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last updated</dt>
                  <dd className="font-medium text-foreground">{doc.lastUpdated}</dd>
                </div>
              </dl>
            </div>
            <div className="no-print flex flex-col sm:flex-row gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Download className="h-4 w-4" /> Save PDF
              </Button>
            </div>
          </div>
        </header>

        {/* Body: TOC + Content */}
        <div className="print-body grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Sticky TOC */}
          <aside className="no-print lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search this document…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
              Contents
            </div>
            <nav className="text-sm space-y-1">
              {filteredTopLevel.length === 0 && (
                <p className="text-muted-foreground text-xs px-1">No sections match "{query}".</p>
              )}
              {filteredTopLevel.map((s, i) => (
                <TocLink key={s.id} section={s} index={i + 1} activeId={activeId} />
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div ref={contentRef} className="min-w-0">
            {doc.intro && (
              <div className="mb-10 rounded-lg border bg-muted/30 p-5 text-sm leading-relaxed text-muted-foreground">
                {doc.intro}
              </div>
            )}

            <article className="space-y-12">
              {doc.sections.map((s, i) => (
                <SectionBlock key={s.id} section={s} number={`${i + 1}`} query={query} />
              ))}
            </article>

            {/* Footer of document */}
            <footer className="mt-16 pt-8 border-t text-sm text-muted-foreground space-y-4">
              <p>
                Questions about this document? Contact us at{" "}
                <a className="text-foreground underline" href={`mailto:${LEGAL_CONFIG.legalEmail}`}>
                  {LEGAL_CONFIG.legalEmail}
                </a>. Electronic legal notices are accepted at the address above.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild variant="outline" size="sm">
                  <Link to="/legal"><ArrowLeft className="h-4 w-4" /> Back to Legal Center</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={handlePrint}>
                  <Printer className="h-4 w-4" /> Print / Save PDF
                </Button>
              </div>
              <p className="text-xs">
                © {new Date().getFullYear()} {LEGAL_CONFIG.companyName}. All rights reserved.
              </p>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function TocLink({
  section,
  index,
  activeId,
  parentNumber,
}: {
  section: LegalSection & { depth?: number };
  index: number;
  activeId: string | null;
  parentNumber?: string;
}) {
  const number = parentNumber ? `${parentNumber}.${index}` : `${index}`;
  const isActive = activeId === section.id;
  return (
    <div>
      <a
        href={`#${section.id}`}
        className={cn(
          "flex items-start gap-2 rounded-md px-2 py-1.5 leading-snug transition-colors",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <span className="tabular-nums text-xs pt-0.5 opacity-70">{number}.</span>
        <span className="min-w-0">{section.title}</span>
      </a>
      {section.children && section.children.length > 0 && (
        <div className="ml-4 mt-1 space-y-1 border-l pl-2">
          {section.children.map((c, i) => (
            <TocLink key={c.id} section={c} index={i + 1} activeId={activeId} parentNumber={number} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  number,
  query,
}: {
  section: LegalSection;
  number: string;
  query: string;
}) {
  const isHit = !query || sectionMatches(section, query);
  if (!isHit) return null;
  return (
    <section id={section.id} className="scroll-mt-24">
      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-baseline gap-3">
        <span className="text-muted-foreground tabular-nums text-base font-semibold">{number}.</span>
        <span>{section.title}</span>
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-foreground/90 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2 [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground">
        {section.body}
      </div>
      {section.children && section.children.length > 0 && (
        <div className="mt-6 space-y-8 border-l pl-6">
          {section.children.map((c, i) => (
            <SectionBlock key={c.id} section={c} number={`${number}.${i + 1}`} query={query} />
          ))}
        </div>
      )}
    </section>
  );
}
