import {
  createFileRoute,
  Link,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle2, RefreshCw, Check } from "lucide-react";
import { z } from "zod";
import { getLatestSignupEmailStatus } from "@/lib/auth/verification-status.functions";
import { dashboardUrl, marketingUrl } from "@/lib/host";
import { LEGAL_CONFIG } from "@/lib/legal/config";

const signupSearch = z.object({
  plan: z.enum(["starter", "pro", "business"]).optional(),
});

export const Route = createFileRoute("/signup")({
  validateSearch: signupSearch,
  head: () => ({
    meta: [
      { title: "Create your SEZA store — Start your free trial" },
      {
        name: "description",
        content:
          "Create your SEZA POS store and start a 14-day free trial. No credit card required. Cancel anytime.",
      },
      { property: "og:title", content: "Create your SEZA store — SEZA POS" },
      {
        property: "og:description",
        content: "14-day free trial. No credit card required. Cancel anytime.",
      },
      { property: "og:url", content: "https://dashboard.sezapos.com/signup" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://dashboard.sezapos.com/signup" }],
  }),
  component: SignupPage,
});

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

const schema = z.object({
  businessName: z.string().trim().min(2, "Business name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  accept: z.literal(true, { message: "You must accept the terms" }),
});

function SignupPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/signup" });
  const [selectedPlan, setSelectedPlan] = useState<string | undefined>(
    search.plan,
  );

  useEffect(() => {
    setSelectedPlan(search.plan);
  }, [search.plan]);

  const detectedTz = useMemo(() => {
    try {
      return (
        Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
      );
    } catch {
      return "America/New_York";
    }
  }, []);

  const [form, setForm] = useState({
    businessName: "",
    email: "",
    password: "",
    accept: false,
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: dashboardUrl(
            `/select-plan${selectedPlan ? `?plan=${selectedPlan}` : ""}`,
          ),
          data: {
            business_name: form.businessName.trim(),
            time_zone: detectedTz,
            country: "US",
            selected_plan: selectedPlan ?? null,
            legal_accepted_at: new Date().toISOString(),
            terms_version: LEGAL_CONFIG.termsVersion,
            privacy_version: LEGAL_CONFIG.privacyVersion,
          },
        },
      });
      if (error) throw error;

      if (data.session) {
        toast.success("Welcome to SEZA POS!");
        navigate({ to: "/select-plan", replace: true });
        return;
      }
      setSent(form.email);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not create your account";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return <SentPanel email={sent} onReset={() => setSent(null)} />;
  }

  const planLabel = selectedPlan ? PLAN_LABELS[selectedPlan] : null;

  return (
    <div className="min-h-screen bg-surface p-4 py-10">
      <div className="max-w-5xl mx-auto">
        <a
          href={marketingUrl("/")}
          className="flex items-center justify-center gap-2 mb-6"
        >
          <div className="size-9 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">
            S
          </div>
          <span className="font-semibold tracking-tight text-lg">SEZA POS</span>
        </a>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Create your SEZA store</CardTitle>
              <CardDescription>
                Your 14-day free trial starts after you verify your email.
              </CardDescription>
              {planLabel && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Selected plan:</span>
                  <span className="font-semibold text-foreground">
                    {planLabel}
                  </span>
                  <Link
                    to="/pricing"
                    className="ml-auto text-xs text-primary hover:underline"
                  >
                    Change plan
                  </Link>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business name</Label>
                  <Input
                    id="businessName"
                    value={form.businessName}
                    onChange={(e) => update("businessName", e.target.value)}
                    placeholder="Corner Market"
                    autoComplete="organization"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Business email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    At least 8 characters.
                  </p>
                </div>

                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={form.accept}
                    onCheckedChange={(v) => update("accept", v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-muted-foreground">
                    I agree to the{" "}
                    <Link
                      to="/legal/$slug"
                      params={{ slug: "terms" }}
                      className="text-primary hover:underline"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      to="/legal/$slug"
                      params={{ slug: "privacy" }}
                      className="text-primary hover:underline"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>

                <Button type="submit" className="w-full h-11" disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="size-4 mr-2" />
                      Create my store
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  No credit card required. Takes about 2 minutes.
                </p>

                <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                  Already have an account?{" "}
                  <Link to="/auth" className="text-primary hover:underline">
                    Sign in
                  </Link>
                </p>
              </form>
            </CardContent>
          </Card>

          <aside className="rounded-xl border bg-muted/30 p-6 h-fit">
            <h2 className="font-semibold">During your trial:</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                "Add products or import a CSV",
                "Connect compatible hardware",
                "Invite employees and test PIN access",
                "Run a test sale and review the report",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-muted-foreground">
              14-day free trial. No credit card required. Cancel anytime.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SentPanel({ email, onReset }: { email: string; onReset: () => void }) {
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [devStatus, setDevStatus] = useState<null | {
    status: string;
    error_message?: string | null;
    created_at?: string;
  }>(null);
  const checkFn = useServerFn(getLatestSignupEmailStatus);
  const isDev = import.meta.env.DEV;
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [cooldown]);

  const refresh = async () => {
    if (!isDev) return;
    try {
      const res = await checkFn({ data: { email } });
      setDevStatus(res as any);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!isDev) return;
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const resend = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Verification email sent again");
      setCooldown(60);
      refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not resend email",
      );
    } finally {
      setResending(false);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      sent: "bg-emerald-100 text-emerald-800",
      pending: "bg-amber-100 text-amber-800",
      failed: "bg-red-100 text-red-800",
      dlq: "bg-red-100 text-red-800",
      suppressed: "bg-orange-100 text-orange-800",
      none: "bg-slate-100 text-slate-700",
    };
    return map[s] ?? "bg-slate-100 text-slate-700";
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto size-12 rounded-full bg-primary/10 grid place-items-center mb-2">
            <Mail className="size-6 text-primary" />
          </div>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            We sent a verification link to <strong>{email}</strong>. Click it to
            activate your account and start your 14-day free trial. The link
            expires in 24 hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={resend}
            disabled={resending || cooldown > 0}
          >
            {resending ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="size-4 mr-2" />
            )}
            {cooldown > 0
              ? `Resend in ${cooldown}s`
              : "Resend verification email"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Didn't get it? Check spam, or{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={onReset}
            >
              use a different email
            </button>
            .
          </p>

          {isDev && (
            <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-900">
                  Developer diagnostic
                </span>
                <button
                  type="button"
                  onClick={refresh}
                  className="text-amber-700 hover:underline"
                >
                  refresh
                </button>
              </div>
              {devStatus ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">Last signup email:</span>
                    <span
                      className={`px-2 py-0.5 rounded font-medium ${statusBadge(devStatus.status)}`}
                    >
                      {devStatus.status}
                    </span>
                  </div>
                  {devStatus.created_at && (
                    <div className="text-slate-500">
                      logged{" "}
                      {new Date(devStatus.created_at).toLocaleTimeString()}
                    </div>
                  )}
                  {devStatus.error_message && (
                    <div className="text-red-700">
                      Error: {devStatus.error_message}
                    </div>
                  )}
                  {devStatus.status === "none" && (
                    <div className="text-slate-600">
                      No send row yet — the queue processes every ~5s. Give it a
                      moment or click resend.
                    </div>
                  )}
                </>
              ) : (
                <div className="text-slate-600">Checking…</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
