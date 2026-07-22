import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { privacyPolicy } from "@/lib/legal/docs/privacy";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — SEZA POS" },
      { name: "description", content: privacyPolicy.summary },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/legal/privacy" }],
  }),
  component: () => (
    <MarketingShell>
      <LegalDocumentView doc={privacyPolicy} />
    </MarketingShell>
  ),
});
