import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { refundPolicy } from "@/lib/legal/docs/policies";

export const Route = createFileRoute("/legal/refund")({
  head: () => ({
    meta: [
      { title: "Refund Policy — SEZA POS" },
      { name: "description", content: refundPolicy.summary },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/legal/refund" }],
  }),
  component: () => (
    <MarketingShell>
      <LegalDocumentView doc={refundPolicy} />
    </MarketingShell>
  ),
});
