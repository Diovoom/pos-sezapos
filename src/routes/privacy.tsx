import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { readPrivacyConsent, savePrivacyConsent } from "@/lib/privacy-consent";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { toast } from "sonner";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Your Privacy Choices - SEZA POS" }] }),
  component: PrivacyChoicesPage,
});

function PrivacyChoicesPage() {
  const [analytics, setAnalytics] = useState(false);
  const [personalization, setPersonalization] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const saved = readPrivacyConsent();
    setAnalytics(saved.analytics);
    setPersonalization(saved.personalization);
    setMarketing(saved.marketing);
  }, []);

  const save = () => {
    savePrivacyConsent({ analytics, personalization, marketing });
    toast.success("Your privacy choices were saved on this browser.");
  };

  const setAll = (allowed: boolean) => {
    setAnalytics(allowed);
    setPersonalization(allowed);
    setMarketing(allowed);
    savePrivacyConsent({ analytics: allowed, personalization: allowed, marketing: allowed });
    toast.success(allowed ? "Optional features were allowed." : "Optional data uses were turned off.");
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:py-12">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border bg-white shadow-xl">
        <div className="bg-gradient-to-br from-blue-700 to-blue-500 p-6 text-white sm:p-8">
          <div className="flex items-center gap-3"><ShieldCheck className="size-8" /><div><h1 className="text-2xl font-black">Your Privacy Choices</h1><p className="mt-1 text-sm text-blue-100">Choose how optional browser data may be used.</p></div></div>
        </div>
        <div className="space-y-5 p-5 sm:p-8">
          <Choice title="Essential services" description="Required for sign-in, security, fraud prevention, preferences, transactions, and reliable operation." checked disabled icon={<LockKeyhole className="size-5" />} />
          <Choice title="Analytics and performance" description="Helps SEZA understand page performance and feature usage. This does not include payment-card numbers or employee PINs." checked={analytics} onCheckedChange={setAnalytics} />
          <Choice title="Personalized experience" description="Remembers optional display and workflow preferences so the dashboard can be more relevant to you." checked={personalization} onCheckedChange={setPersonalization} />
          <Choice title="Marketing communications" description="Allows promotional messages about SEZA products and offers. Account, security, billing, receipt, and support messages remain enabled." checked={marketing} onCheckedChange={setMarketing} />

          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            <Button variant="outline" onClick={save}><Check className="mr-2 size-4" />Save choices</Button>
            <Button variant="secondary" onClick={() => setAll(false)}>Turn off optional</Button>
            <Button onClick={() => setAll(true)}>Allow optional</Button>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            These settings apply to this browser. Depending on your location, you may also have rights to access, correct, delete, or receive a copy of personal information, or to opt out of a covered sale or sharing. Email <a className="font-semibold text-blue-700 underline" href={`mailto:${LEGAL_CONFIG.privacyEmail}`}>{LEGAL_CONFIG.privacyEmail}</a> to submit a verified request.
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-blue-700">
            <Link to="/legal/$slug" params={{ slug: "privacy" }}>Privacy Policy</Link>
            <Link to="/legal/$slug" params={{ slug: "privacy-choices" }}>Privacy rights details</Link>
            <Link to="/legal/$slug" params={{ slug: "terms" }}>Terms of Service</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function Choice({ title, description, checked, onCheckedChange, disabled = false, icon }: { title: string; description: string; checked: boolean; onCheckedChange?: (checked: boolean) => void; disabled?: boolean; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border p-4 sm:p-5">
      <div className="flex gap-3">{icon && <span className="mt-0.5 text-blue-700">{icon}</span>}<div><div className="font-bold">{title}</div><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div></div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={title} />
    </div>
  );
}
