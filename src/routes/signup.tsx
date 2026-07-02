import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle2, RefreshCw } from "lucide-react";
import { z } from "zod";
import { getLatestSignupEmailStatus } from "@/lib/auth/verification-status.functions";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Start your free trial — SEZA POS" },
      { name: "description", content: "Create your SEZA POS account. 14-day free trial. No credit card required." },
    ],
  }),
  component: SignupPage,
});

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "HT", name: "Haiti" },
  { code: "DO", name: "Dominican Republic" },
  { code: "FR", name: "France" },
  { code: "BR", name: "Brazil" },
  { code: "ES", name: "Spain" },
  { code: "DE", name: "Germany" },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Mexico_City",
  "America/Port-au-Prince",
  "America/Santo_Domingo",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Berlin",
  "Australia/Sydney",
  "UTC",
];

const schema = z.object({
  businessName: z.string().trim().min(2, "Business name is required").max(120),
  fullName: z.string().trim().min(2, "Owner name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  phone: z.string().trim().min(5, "Phone is required").max(30),
  country: z.string().min(2),
  timeZone: z.string().min(1),
  accept: z.literal(true, { message: "You must accept the terms" }),
});

function SignupPage() {
  const navigate = useNavigate();
  const detectedTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; }
    catch { return "America/New_York"; }
  }, []);

  const [form, setForm] = useState({
    businessName: "",
    fullName: "",
    email: "",
    password: "",
    phone: "",
    country: "US",
    timeZone: detectedTz,
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
      const [first_name, ...rest] = form.fullName.trim().split(/\s+/);
      const last_name = rest.join(" ");
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/pos`,
          data: {
            business_name: form.businessName.trim(),
            full_name: form.fullName.trim(),
            first_name,
            last_name,
            phone: form.phone.trim(),
            country: form.country,
            time_zone: form.timeZone,
          },
        },
      });
      if (error) throw error;

      // If the project auto-confirms emails, there is a session immediately — send them in.
      if (data.session) {
        toast.success("Welcome to SEZA POS!");
        navigate({ to: "/pos", replace: true });
        return;
      }
      setSent(form.email);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create your account";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return <SentPanel email={sent} onReset={() => setSent(null)} />;
  }

  return (
    <div className="min-h-screen bg-surface p-4 py-10">
      <div className="max-w-lg mx-auto">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6">
          <div className="size-9 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">S</div>
          <span className="font-semibold tracking-tight text-lg">SEZA POS</span>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Start your 14-day free trial</CardTitle>
            <CardDescription>
              No credit card required. Cancel anytime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business name</Label>
                <Input id="businessName" value={form.businessName}
                  onChange={(e) => update("businessName", e.target.value)}
                  placeholder="Corner Market" autoComplete="organization" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Owner full name</Label>
                <Input id="fullName" value={form.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  placeholder="Jane Doe" autoComplete="name" required />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Business email</Label>
                  <Input id="email" type="email" value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    autoComplete="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input id="phone" type="tel" value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    autoComplete="tel" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  autoComplete="new-password" minLength={8} required />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={form.country} onValueChange={(v) => update("country", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Time zone</Label>
                  <Select value={form.timeZone} onValueChange={(v) => update("timeZone", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.includes(form.timeZone) ? null : (
                        <SelectItem value={form.timeZone}>{form.timeZone} (detected)</SelectItem>
                      )}
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={form.accept}
                  onCheckedChange={(v) => update("accept", v === true)}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  I agree to the{" "}
                  <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                </span>
              </label>

              <Button type="submit" className="w-full h-11" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : (
                  <><CheckCircle2 className="size-4 mr-2" />Create account</>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Already have an account?{" "}
                <Link to="/auth" className="text-primary hover:underline">Sign in</Link>
              </p>
            </form>
          </CardContent>
        </Card>
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
      toast.error(err instanceof Error ? err.message : "Could not resend email");
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
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Didn't get it? Check spam, or{" "}
            <button type="button" className="text-primary hover:underline" onClick={onReset}>
              use a different email
            </button>
            .
          </p>

          {isDev && (
            <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-900">Developer diagnostic</span>
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
                    <span className={`px-2 py-0.5 rounded font-medium ${statusBadge(devStatus.status)}`}>
                      {devStatus.status}
                    </span>
                  </div>
                  {devStatus.created_at && (
                    <div className="text-slate-500">
                      logged {new Date(devStatus.created_at).toLocaleTimeString()}
                    </div>
                  )}
                  {devStatus.error_message && (
                    <div className="text-red-700">Error: {devStatus.error_message}</div>
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
              <div className="text-slate-500 pt-1 border-t border-amber-200">
                Verification links are one-time tokens minted by auth and aren't
                exposed here. Watch this panel and your inbox.
              </div>
            </div>
          )}

          <Button asChild variant="ghost" className="w-full">
            <Link to="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
