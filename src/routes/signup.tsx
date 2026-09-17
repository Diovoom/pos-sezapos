import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle2, RefreshCw, Check } from "lucide-react";
import { z } from "zod";
import { marketingUrl } from "@/lib/host";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { secureMerchantSignUp, secureResendVerification } from "@/lib/auth/auth.functions";
import { AuthTurnstile, authCaptchaEnabled, useAuthCooldown } from "@/features/auth";
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "@/lib/security/disposable-email";

const signupSearch = z.object({
  plan: z.enum(["starter", "pro", "business"]).optional(),
});

export const Route = createFileRoute("/signup")({
  validateSearch: signupSearch,
  head: () => ({
    meta: [
      { title: "Create your SEZA store  -  Start your free trial" },
      {
        name: "description",
        content:
          "Create your SEZA POS store and start a 14-day free trial. No credit card required. Cancel anytime.",
      },
      { property: "og:title", content: "Create your SEZA store  -  SEZA POS" },
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
  businessName: z.string().trim().min(2, "Legal business name is required").max(120),
  phone: z.string().trim().min(10, "Business phone is required").max(30),
  address: z.string().trim().min(5, "Business address is required").max(160),
  zip: z.string().trim().min(5, "ZIP code is required").max(10),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(255)
    .refine((email) => !isDisposableEmail(email), DISPOSABLE_EMAIL_MESSAGE),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  accept: z.literal(true, { message: "You must accept the terms" }),
});

function SignupPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/signup" });
  const [selectedPlan, setSelectedPlan] = useState<string | undefined>(search.plan);

  useEffect(() => {
    setSelectedPlan(search.plan);
  }, [search.plan]);

  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  const [form, setForm] = useState({
    businessName: "",
    phone: "",
    address: "",
    zip: "",
    email: "",
    password: "",
    accept: false,
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const signUp = useServerFn(secureMerchantSignUp);
  const cooldown = useAuthCooldown();
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaReset, setCaptchaReset] = useState(0);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    if (cooldown.active) return;
    setBusy(true);
    try {
      const result = await signUp({
        data: {
          businessName: form.businessName,
          phone: form.phone,
          address: form.address,
          zip: form.zip,
          email: form.email,
          password: form.password,
          timeZone: detectedTz,
          selectedPlan: (selectedPlan as "starter" | "pro" | "business" | undefined) ?? null,
          termsVersion: LEGAL_CONFIG.termsVersion,
          privacyVersion: LEGAL_CONFIG.privacyVersion,
          captchaToken,
        },
      });
      if (!result.ok) {
        cooldown.start(result.retry_after_seconds);
        toast.error(result.error);
        return;
      }

      if (result.session) {
        const { error } = await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
        if (error) throw error;
        toast.success("Welcome to SEZA POS!");
        navigate({ to: "/select-plan", replace: true });
        return;
      }
      setSent(form.email);
    } catch {
      toast.error("Could not create your account. Please try again.");
    } finally {
      setBusy(false);
      setCaptchaReset((value) => value + 1);
    }
  };

  if (sent) {
    return <SentPanel email={sent} onReset={() => setSent(null)} />;
  }

  const planLabel = selectedPlan ? PLAN_LABELS[selectedPlan] : null;

  return (
    <div className="min-h-screen bg-surface p-4 py-10">
      <div className="max-w-5xl mx-auto">
        <a href={marketingUrl("/")} className="flex items-center justify-center gap-2 mb-6">
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
                  <span className="font-semibold text-foreground">{planLabel}</span>
                  <Link to="/pricing" className="ml-auto text-xs text-primary hover:underline">
                    Change plan
                  </Link>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="businessName">Legal business name</Label>
                  <Input
                    id="businessName"
                    value={form.businessName}
                    onChange={(e) => update("businessName", e.target.value)}
                    placeholder="Corner Market"
                    autoComplete="organization"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Business phone</Label>
                    <Input id="phone" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} autoComplete="tel" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip">ZIP code</Label>
                    <Input id="zip" inputMode="numeric" value={form.zip} onChange={(e) => update("zip", e.target.value)} autoComplete="postal-code" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Business street address</Label>
                  <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} autoComplete="street-address" required />
                  <p className="text-xs text-muted-foreground">Used securely to enforce one free trial per business.</p>
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
                  <p className="text-xs text-muted-foreground">At least 8 characters.</p>
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

                <AuthTurnstile onTokenChange={setCaptchaToken} resetKey={captchaReset} />
                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={busy || cooldown.active || (authCaptchaEnabled && !captchaToken)}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="size-4 mr-2" />
                      {cooldown.active ? `Try again in ${cooldown.seconds}s` : "Create my store"}
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
  const resendVerification = useServerFn(secureResendVerification);
  const serverCooldown = useAuthCooldown();
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaReset, setCaptchaReset] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [cooldown]);


  const resend = async () => {
    setResending(true);
    try {
      const result = await resendVerification({ data: { email, captchaToken } });
      if (!result.ok) {
        serverCooldown.start(result.retry_after_seconds);
        toast.error(result.error);
        return;
      }
      toast.success("If the account is awaiting verification, another email was sent.");
      setCooldown(60);
    } catch {
      toast.error("Could not resend email. Please try again later.");
    } finally {
      setResending(false);
      setCaptchaReset((value) => value + 1);
    }
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
            We sent a verification link to <strong>{email}</strong>. Click it to activate your
            account and start your 14-day free trial. The link expires in 24 hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <AuthTurnstile onTokenChange={setCaptchaToken} resetKey={captchaReset} />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={resend}
            disabled={
              resending ||
              cooldown > 0 ||
              serverCooldown.active ||
              (authCaptchaEnabled && !captchaToken)
            }
          >
            {resending ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="size-4 mr-2" />
            )}
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Didn't get it? Check spam, or{" "}
            <button type="button" className="text-primary hover:underline" onClick={onReset}>
              use a different email
            </button>
            .
          </p>


        </CardContent>
      </Card>
    </div>
  );
}
