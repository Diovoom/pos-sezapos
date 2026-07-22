import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { termsOfService } from "@/lib/legal/docs/terms";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — SEZA POS" },
      { name: "description", content: termsOfService.summary },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/legal/terms" }],
  }),
  component: () => (
    <MarketingShell>
      <LegalDocumentView doc={termsOfService} />
    </MarketingShell>
  ),
});
