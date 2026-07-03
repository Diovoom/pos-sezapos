import { createFileRoute, notFound } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { getLegalDoc } from "@/lib/legal";

export const Route = createFileRoute("/legal/$slug")({
  loader: ({ params }) => {
    const doc = getLegalDoc(params.slug);
    if (!doc) throw notFound();
    return { doc };
  },
  head: ({ loaderData }) => {
    const doc = loaderData?.doc;
    if (!doc) return { meta: [{ title: "Legal — SEZA POS" }] };
    const url = `https://sezapos.com/legal/${doc.slug}`;
    return {
      meta: [
        { title: `${doc.title} — SEZA POS` },
        { name: "description", content: doc.summary },
        { property: "og:title", content: `${doc.title} — SEZA POS` },
        { property: "og:description", content: doc.summary },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  notFoundComponent: () => (
    <MarketingShell>
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-3xl font-bold text-foreground">Document not found</h1>
        <p className="mt-3 text-muted-foreground">
          The legal document you are looking for doesn't exist. Return to the{" "}
          <a href="/legal" className="text-primary underline">Legal Center</a>.
        </p>
      </div>
    </MarketingShell>
  ),
  errorComponent: ({ error, reset }) => (
    <MarketingShell>
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-3xl font-bold text-foreground">Something went wrong</h1>
        <p className="mt-3 text-muted-foreground">{error.message}</p>
        <button className="mt-6 underline text-primary" onClick={reset}>Try again</button>
      </div>
    </MarketingShell>
  ),
  component: LegalDocPage,
});

function LegalDocPage() {
  const { doc } = Route.useLoaderData();
  return (
    <MarketingShell>
      <LegalDocumentView doc={doc} />
    </MarketingShell>
  );
}
