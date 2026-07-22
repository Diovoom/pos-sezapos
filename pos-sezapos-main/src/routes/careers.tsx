import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { Briefcase } from "lucide-react";

export const Route = createFileRoute("/careers")({
  head: () => ({
    meta: [
      { title: "Careers — SEZA POS" },
      { name: "description", content: "Join the team building modern point-of-sale software for independent retailers. Open roles and how to reach us." },
      { property: "og:title", content: "Careers at SEZA POS" },
      { property: "og:description", content: "Help us build POS software that independent retailers actually love." },
    ],
  }),
  component: CareersPage,
});

function CareersPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 grid place-items-center">
          <Briefcase className="h-6 w-6 text-primary" />
        </div>
        <p className="mt-4 text-sm font-medium text-primary uppercase tracking-wide">Careers</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">Build the tools independent retail runs on.</h1>
        <p className="mt-5 text-lg text-muted-foreground">
          {LEGAL_CONFIG.companyName} is a small, focused team. We aren't currently running an open hiring round — but we're always interested in hearing from thoughtful engineers, designers, and support leaders who care about small business.
        </p>
        <p className="mt-3 text-muted-foreground">
          Reach out at <a className="text-primary underline" href={`mailto:${LEGAL_CONFIG.supportEmail}`}>{LEGAL_CONFIG.supportEmail}</a> with a note about what you'd want to work on.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Button asChild variant="outline"><Link to="/about">Learn about SEZA</Link></Button>
        </div>
      </section>
    </MarketingShell>
  );
}
