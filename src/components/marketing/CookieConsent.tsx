import { useEffect, useState } from "react";
import { Cookie, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";

const STORAGE_KEY = "seza.cookie-consent.v1";
export const OPEN_COOKIE_SETTINGS_EVENT = "seza:open-cookie-settings";

type Consent = {
  version: 2;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

function applyConsent(consent: Consent) {
  document.documentElement.dataset.cookieAnalytics = consent.analytics ? "granted" : "denied";
  document.documentElement.dataset.cookieMarketing = consent.marketing ? "granted" : "denied";
  window.dispatchEvent(new CustomEvent("seza:cookie-consent-changed", { detail: consent }));
}

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Consent>;
    if (parsed.version !== 2) return null;
    return {
      version: 2,
      necessary: true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const saved = readConsent();
    if (saved) {
      setAnalytics(saved.analytics);
      setMarketing(saved.marketing);
      applyConsent(saved);
    } else {
      document.documentElement.dataset.cookieAnalytics = "denied";
      document.documentElement.dataset.cookieMarketing = "denied";
      const id = window.setTimeout(() => setVisible(true), 450);
      return () => window.clearTimeout(id);
    }
  }, []);

  useEffect(() => {
    const open = () => {
      const saved = readConsent();
      setAnalytics(saved?.analytics ?? false);
      setMarketing(saved?.marketing ?? false);
      setPreferencesOpen(true);
      setVisible(false);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, open);
  }, []);

  const save = (nextAnalytics: boolean, nextMarketing: boolean) => {
    const consent: Consent = {
      version: 2,
      necessary: true,
      analytics: nextAnalytics,
      marketing: nextMarketing,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch {
      // Privacy controls still apply for the current page when storage is unavailable.
    }
    applyConsent(consent);
    setAnalytics(nextAnalytics);
    setMarketing(nextMarketing);
    setVisible(false);
    setPreferencesOpen(false);
  };

  return (
    <>
      {visible && (
        <div className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-5xl rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:bottom-5 sm:p-5 dark:border-white/10 dark:bg-slate-950/95">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Cookie className="size-5" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Your privacy choices</div>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  SEZA uses necessary storage to keep the website secure and remember your choices.
                  Optional analytics and marketing technologies stay off unless you allow them. Read
                  our{" "}
                  <Link
                    to="/legal/$slug"
                    params={{ slug: "cookies" }}
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    Cookie Policy
                  </Link>
                  .
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="ghost" size="sm" onClick={() => setPreferencesOpen(true)}>
                <SlidersHorizontal className="size-4" /> Manage
              </Button>
              <Button variant="outline" size="sm" onClick={() => save(false, false)}>
                Necessary only
              </Button>
              <Button size="sm" onClick={() => save(true, true)}>
                Accept all
              </Button>
            </div>
          </div>
        </div>
      )}

      {preferencesOpen && (
        <div
          className="fixed inset-0 z-[90] grid place-items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookie-settings-title"
        >
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border bg-background p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <h2 id="cookie-settings-title" className="text-2xl font-bold tracking-tight">
                  Cookie settings
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Choose which optional technologies SEZA may use on this browser. Necessary storage
                  cannot be disabled because it supports security, authentication and your privacy
                  preferences.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPreferencesOpen(false)}
                aria-label="Close cookie settings"
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="mt-7 divide-y rounded-2xl border">
              <PreferenceRow
                title="Strictly necessary"
                description="Required for security, sign-in, load balancing and remembering your choices."
                checked
                disabled
                onCheckedChange={() => undefined}
              />
              <PreferenceRow
                title="Analytics"
                description="Helps us understand aggregate website usage so we can improve pages and performance."
                checked={analytics}
                onCheckedChange={setAnalytics}
              />
              <PreferenceRow
                title="Marketing"
                description="Allows campaign measurement and relevant advertising only when these tools are enabled."
                checked={marketing}
                onCheckedChange={setMarketing}
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => save(false, false)}>
                Reject optional
              </Button>
              <Button onClick={() => save(analytics, marketing)}>Save preferences</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PreferenceRow({
  title,
  description,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  const id = `cookie-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex items-start justify-between gap-4 p-4 sm:p-5">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-semibold">
          {title}
        </Label>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={`${title} cookies`}
      />
    </div>
  );
}
