import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useServerFn } from "@tanstack/react-start";
import { signInWithPin, signInWithEmployeePin } from "@/lib/employees.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Delete, LogIn, Mail, KeyRound, ArrowLeft, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";

const MANAGER_ROLES = new Set(["owner", "admin", "manager"]);

import { hasAnyPlatformRole } from "@/lib/platform-roles";

async function landingRouteForUser(userId: string): Promise<"/dashboard" | "/pos" | "/admin"> {
  try {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (data ?? []).map((r) => r.role as string);
    if (hasAnyPlatformRole(roles)) return "/admin";
    return roles.some((r) => MANAGER_ROLES.has(r)) ? "/dashboard" : "/pos";
  } catch {
    return "/pos";
  }
}

// Single-domain navigation after auth.
function goToLanding(navigate: (opts: { to: "/dashboard" | "/pos" | "/admin"; replace: true }) => void, dest: "/dashboard" | "/pos" | "/admin") {
  navigate({ to: dest, replace: true });
}

// Only same-origin relative paths are honored for `next` (defense against open-redirect).
function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function goAfterAuth(
  navigate: (opts: { to: "/dashboard" | "/pos"; replace: true }) => void,
  dest: "/dashboard" | "/pos",
  next: string | undefined,
) {
  const safe = safeNext(next);
  if (safe) {
    window.location.replace(safe);
    return;
  }
  goToLanding(navigate, dest);
}


type Mode = "pin" | "email" | "pin_with_id";
type Search = { mode?: Mode; next?: string };

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SEZA POS" },
      { name: "description", content: "Sign in to your SEZA POS terminal with your 6-digit PIN." },
      { property: "og:title", content: "Sign in — SEZA POS" },
      { property: "og:description", content: "Sign in to your SEZA POS terminal." },
      { property: "og:url", content: "https://sezapos.com/auth" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/auth" }],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: s.mode === "email" ? "email" : s.mode === "pin_with_id" ? "pin_with_id" : "pin",
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<Mode>(search.mode ?? "pin");
  const next = search.next;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const dest = await landingRouteForUser(data.session.user.id);
      goAfterAuth(navigate, dest, next);
    })();
  }, [navigate, next]);


  const switchUser = async () => {
    await supabase.auth.signOut();
    setMode("pin");
    toast.success("Ready for the next employee");
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6">
          <Logo className="size-9 rounded-lg" />
          <span className="font-semibold tracking-tight text-lg">SEZA POS</span>
        </Link>

        <h1 className="sr-only">Sign in to SEZA POS</h1>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-center">
              {mode === "email" ? "Sign in with email" : "Enter your PIN"}
            </CardTitle>
            <CardDescription className="text-center">
              {mode === "email"
                ? "For owners, managers, and first-time device sign-in."
                : mode === "pin_with_id"
                  ? "More than one employee shares this PIN — please also enter your 6-digit Employee ID."
                  : "Employees sign in with their 6-digit PIN."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {mode === "email" ? (
              <EmailLogin onBack={() => setMode("pin")} next={next} />
            ) : (
              <PinLogin mode={mode} setMode={setMode} next={next} />
            )}

            {mode !== "email" && (
              <div className="mt-4 pt-4 border-t space-y-2">
                <Button variant="outline" className="w-full" onClick={() => setMode("email")}>
                  <Mail className="size-4 mr-2" /> Sign in with Email
                </Button>
                <ForgotLoginLink />
              </div>
            )}
          </CardContent>
          <div className="px-6 pb-6 -mt-2 text-center text-xs text-muted-foreground">
            New merchant?{" "}
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Create an account
            </Link>
          </div>
        </Card>
      </div>

      <Button
        onClick={switchUser}
        variant="secondary"
        className="fixed bottom-4 right-4 shadow-lg"
        size="lg"
      >
        <ArrowLeftRight className="size-4 mr-2" /> Switch User
      </Button>
    </div>
  );
}

/* ------------------------------- PIN login ------------------------------- */

function PinLogin({ mode, setMode, next }: { mode: Mode; setMode: (m: Mode) => void; next?: string }) {
  const navigate = useNavigate();
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const signPin = useServerFn(signInWithPin);
  const signPinId = useServerFn(signInWithEmployeePin);

  // In pin_with_id mode, the ID is captured first, then the PIN.
  const [stage, setStage] = useState<"id" | "pin">(mode === "pin_with_id" ? "id" : "pin");
  useEffect(() => { setStage(mode === "pin_with_id" ? "id" : "pin"); }, [mode]);

  const active = stage === "id" ? empId : pin;
  const setActive = stage === "id" ? setEmpId : setPin;
  const label = stage === "id" ? "Employee ID" : "PIN";

  const dots = useMemo(() => Array.from({ length: 6 }, (_, i) => i < active.length), [active]);

  const press = (d: string) => { if (active.length < 6) setActive(active + d); };
  const del = () => setActive(active.slice(0, -1));
  const clear = () => setActive("");

  // Auto-advance ID -> PIN
  useEffect(() => {
    if (mode === "pin_with_id" && stage === "id" && empId.length === 6) setStage("pin");
  }, [empId, mode, stage]);

  // Auto-submit when PIN is 6 digits
  useEffect(() => {
    if (stage !== "pin" || pin.length !== 6) return;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // Physical keyboard input — numpad and top-row digits, Backspace, Escape.
  // Ignores keys while the user is typing in another input (email login, etc.).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        del();
      } else if (e.key === "Escape") {
        e.preventDefault();
        clear();
      } else if (e.key === "Enter" && stage === "pin" && pin.length >= 4) {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stage, busy, pin]);


  const submit = async () => {
    setBusy(true);
    try {
      const result = mode === "pin_with_id"
        ? await signPinId({ data: { employee_id: empId, pin } })
        : await signPin({ data: { pin } });
      const { error } = await supabase.auth.verifyOtp({
        token_hash: result.token_hash,
        type: "magiclink",
      });
      if (error) throw error;
      goAfterAuth(navigate, "/pos", next);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      if (rawMsg.startsWith("MULTIPLE_MATCHES:")) {
        toast.info(rawMsg.slice("MULTIPLE_MATCHES:".length));
        setMode("pin_with_id");
        setPin(""); setEmpId("");
      } else if (
        rawMsg === "Incorrect PIN" ||
        rawMsg === "PIN must be exactly 6 digits" ||
        rawMsg === "Invalid PIN" ||
        rawMsg === "Invalid employee ID"
      ) {
        toast.error("Invalid PIN. Please try again.");
        setPin("");
      } else if (rawMsg.includes("No PIN set")) {
        toast.error("No PIN set for this account. Sign in with email first.");
        setPin("");
      } else if (rawMsg === "Account is disabled" || rawMsg === "No employee found with that ID" || rawMsg === "Employee has no email on file") {
        toast.error(rawMsg);
        setPin("");
      } else {
        // Log technical errors to the console, show a friendly message.
        console.error("[PIN sign-in]", err);
        toast.error("Sign in failed. Please try again.");
        setPin("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
        <div className="flex justify-center gap-2 mb-1">
          {dots.map((filled, i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full border-2",
                filled ? "bg-primary border-primary" : "border-muted-foreground/40",
              )}
            />
          ))}
        </div>
        {stage === "id" && empId.length > 0 && (
          <div className="text-2xl font-mono tracking-widest">{empId.padEnd(6, "•")}</div>
        )}
        {busy && (
          <div className="mt-2 text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-3 animate-spin" />Signing you in…
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {["1","2","3","4","5","6","7","8","9"].map((d) => (
          <KeyBtn key={d} onClick={() => press(d)} disabled={busy}>{d}</KeyBtn>
        ))}
        <KeyBtn onClick={clear} disabled={busy} variant="ghost">C</KeyBtn>
        <KeyBtn onClick={() => press("0")} disabled={busy}>0</KeyBtn>
        <KeyBtn onClick={del} disabled={busy} variant="ghost"><Delete className="size-5" /></KeyBtn>
      </div>

      {mode === "pin_with_id" && stage === "pin" && (
        <button
          type="button"
          onClick={() => { setStage("id"); setPin(""); }}
          className="text-xs text-primary hover:underline w-full text-center"
        >
          Change Employee ID
        </button>
      )}
    </div>
  );
}

function KeyBtn({
  children, onClick, disabled, variant = "solid",
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; variant?: "solid" | "ghost" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-16 rounded-xl text-2xl font-semibold font-mono transition-all active:scale-95",
        variant === "solid"
          ? "bg-card border hover:border-primary/60 hover:bg-primary/5"
          : "text-muted-foreground hover:bg-accent",
        disabled && "opacity-50",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------ Email login --------------------------- */

function EmailLogin({ onBack, next }: { onBack: () => void; next?: string }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      void import("@/lib/audit-log").then((m) => m.logAudit({ action: "login", details: { method: "password" } }));
      const dest = signIn.user ? await landingRouteForUser(signIn.user.id) : "/pos";
      goAfterAuth(navigate, dest, next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const oauthRedirect = () => {
    const safe = safeNext(next);
    // For social providers, always return to a public route. If `next` is set,
    // return to /auth?next=... so this page can resume the redirect after the
    // session hydrates. Otherwise return to the app origin.
    return safe
      ? `${window.location.origin}/auth?next=${encodeURIComponent(safe)}`
      : window.location.origin;
  };

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: oauthRedirect() });
    if (result.error) { toast.error(result.error.message ?? "Google sign-in failed"); setBusy(false); return; }
    if (result.redirected) return;
    const { data: u } = await supabase.auth.getUser();
    goAfterAuth(navigate, u.user ? await landingRouteForUser(u.user.id) : "/pos", next);
  };

  const handleApple = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("apple", { redirect_uri: oauthRedirect() });
    if (result.error) { toast.error(result.error.message ?? "Apple sign-in failed"); setBusy(false); return; }
    if (result.redirected) return;
    const { data: u } = await supabase.auth.getUser();
    goAfterAuth(navigate, u.user ? await landingRouteForUser(u.user.id) : "/pos", next);
  };


  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="size-3" /> Back to PIN sign-in
      </button>
      <Button type="button" variant="outline" className="w-full h-11" onClick={handleGoogle} disabled={busy}>
        <svg className="size-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
        Continue with Google
      </Button>
      <Button type="button" variant="outline" className="w-full h-11" onClick={handleApple} disabled={busy}>
        <svg className="size-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
        Continue with Apple
      </Button>
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <Button type="submit" className="w-full h-11" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <><LogIn className="size-4 mr-2" />Sign in</>}
        </Button>
      </form>
      <ForgotLoginLink />
    </div>
  );
}

/* ---------------------------- Forgot login --------------------------- */

function ForgotLoginLink() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "password" | "username">("menu");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setView("menu"); setEmail(""); };

  const sendReset = async () => {
    if (!email) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("If that email exists, a reset link is on its way.");
      setOpen(false); reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        className="text-xs text-primary hover:underline w-full text-center block"
      >
        Forgot Username / Password?
      </button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent>
          {view === "menu" && (
            <>
              <DialogHeader>
                <DialogTitle>What do you need help with?</DialogTitle>
                <DialogDescription>Choose an option and we'll walk you through recovery.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={() => setView("password")}>
                  <KeyRound className="size-4 mr-3 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium text-sm">I forgot my password</div>
                    <div className="text-xs text-muted-foreground">We'll email you a reset link.</div>
                  </div>
                </Button>
                <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={() => setView("username")}>
                  <Mail className="size-4 mr-3 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium text-sm">I forgot my username (email)</div>
                    <div className="text-xs text-muted-foreground">Ask your store owner to look it up.</div>
                  </div>
                </Button>
              </div>
            </>
          )}
          {view === "password" && (
            <>
              <DialogHeader>
                <DialogTitle>Reset your password</DialogTitle>
                <DialogDescription>Enter your account email. If it exists, we'll send a secure reset link.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setView("menu")}>Back</Button>
                <Button onClick={sendReset} disabled={busy || !email}>
                  {busy && <Loader2 className="size-4 animate-spin mr-2" />}Send reset link
                </Button>
              </DialogFooter>
            </>
          )}
          {view === "username" && (
            <>
              <DialogHeader>
                <DialogTitle>Recover your username</DialogTitle>
                <DialogDescription>Your username is the email address on your employee profile.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2 text-sm text-muted-foreground">
                <p>For security, we can't display employee emails here. Please ask your store owner or manager to open <strong>Settings → Employees</strong> and share your email with you.</p>
                <p>If you are the store owner, use the email you registered with when you created this account.</p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setView("menu")}>Back</Button>
                <Button onClick={() => { setOpen(false); reset(); }}>Got it</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
