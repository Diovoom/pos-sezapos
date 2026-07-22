import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, BookOpen, MessageSquare, Mail, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { MerchantLiveSupport, type SupportIdentity } from "@/components/support/MerchantLiveSupport";
import { hasAnyPlatformRole } from "@/lib/platform-roles";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — SEZA POS" },
      { name: "description", content: "Get help with SEZA POS: setup, hardware, billing, and troubleshooting. Answers to common questions and how to reach our team." },
      { property: "og:title", content: "Support — SEZA POS" },
      { property: "og:description", content: "Setup, hardware, billing, and troubleshooting — get answers and reach our team." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/support" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/support" }],
  }),
  component: SupportPage,
});

const FAQS = [
  { q: "How does the free trial work?", a: "Every new account gets a 14-day free trial of the Pro plan. You add a payment method during signup, and you're only charged when the trial ends. Cancel any time before then and you won't be billed." },
  { q: "Can I use my existing hardware?", a: "Yes. SEZA POS works with standard receipt printers, USB / Bluetooth barcode scanners, cash drawers, and card terminals. See the Hardware page for tested models." },
  { q: "How do I change my plan?", a: "Sign in and go to Settings → Billing. You can upgrade, downgrade, update your card, or cancel. Upgrades are prorated; downgrades apply at the next billing cycle." },
  { q: "What happens if my internet goes down?", a: "Checkout continues to work in a limited offline mode and syncs to the cloud as soon as you're back online." },
  { q: "How is my data backed up?", a: "All data is stored in the cloud, encrypted at rest and in transit, and backed up automatically. You can export sales, products, and reports at any time." },
  { q: "How do refunds work?", a: "Any sale can be fully or partially refunded from the Sales page. Refunds can restock inventory automatically and require manager approval by default." },
  { q: "Do you support multiple stores?", a: "The Business plan supports multi-store operations with a shared product catalog and per-store reporting." },
  { q: "How do I cancel?", a: "Go to Settings → Billing → Cancel plan. Your access continues through the end of your current billing period." },
];

function SupportPage() {
  const identity = useQuery<SupportIdentity | null>({
    queryKey: ["support-current-merchant"],
    queryFn: async () => {
      const { data: userResult } = await supabase.auth.getUser();
      const user = userResult.user;
      if (!user) return null;
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,store_id").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      const roles = (roleRows ?? []).map((row: any) => String(row.role));
      if (hasAnyPlatformRole(roles) || !profile?.store_id) return null;
      return {
        userId: user.id,
        email: user.email ?? profile.email ?? null,
        fullName: profile.full_name ?? null,
        storeId: profile.store_id,
        roles,
      };
    },
    staleTime: 60_000,
  });

  if (identity.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening support…</div>;
  }
  if (identity.data) return <MerchantLiveSupport identity={identity.data} />;
  return <MarketingSupportPage />;
}

function MarketingSupportPage() {
  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <LifeBuoy className="h-10 w-10 text-primary mx-auto" />
        <h1 className="mt-3 text-4xl font-bold tracking-tight">We're here to help</h1>
        <p className="mt-3 text-lg text-muted-foreground max-w-xl mx-auto">
          Setup guides, common questions, and direct access to our support team.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-8 grid gap-4 md:grid-cols-3">
        {[
          { icon: BookOpen, title: "Getting started", body: "Set up your first store, add products, and take your first sale.", cta: "Create account", to: "/signup" as const },
          { icon: MessageSquare, title: "Contact us", body: "Talk to a real person about pricing, hardware, or migrations.", cta: "Send a message", to: "/contact" as const },
          { icon: Mail, title: "Email support", body: "support@sezapos.com — we respond within one business day.", href: "mailto:support@sezapos.com", cta: "Email us" },
        ].map((c) => (
          <div key={c.title} className="rounded-xl border p-6 flex flex-col">
            <c.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">{c.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground flex-1">{c.body}</p>
            {c.href ? (
              <Button asChild variant="outline" className="mt-4"><a href={c.href}>{c.cta}</a></Button>
            ) : (
              <Button asChild variant="outline" className="mt-4"><Link to={c.to!}>{c.cta}</Link></Button>
            )}
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14">
        <h2 className="text-2xl font-bold tracking-tight text-center">Frequently asked questions</h2>
        <div className="mt-8 divide-y border rounded-xl">
          {FAQS.map((f) => (
            <FaqRow key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="w-full text-left px-5 py-4 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">{q}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </div>
      {open && <p className="mt-2 text-sm text-muted-foreground">{a}</p>}
    </button>
  );
}
