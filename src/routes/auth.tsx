import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Fingerprint, KeyRound, Loader2, LogIn } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { hasAnyPlatformRole } from "@/lib/platform-roles";
import { marketingUrl } from "@/lib/host";
import { secureOwnerPasswordSignIn, securePasswordReset } from "@/lib/auth/auth.functions";
import { AuthTurnstile, authCaptchaEnabled, useAuthCooldown } from "@/features/auth";
import { startAuthentication } from "@simplewebauthn/browser";
import { beginPasskeyLogin, finishPasskeyLogin } from "@/lib/auth/passkeys.functions";

const PLATFORM_STAFF_MSG = "Platform administrators cannot sign in here. Use admin.sezapos.com.";
const OWNER_ONLY_MSG =
  "The SEZA website is for store owners. Employees use the paired SEZA POS Android app.";

async function ensureOwnerWebsiteAccess(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error) throw error;

    const roles = (data ?? []).map((row) => row.role as string);

    if (hasAnyPlatformRole(roles)) {
      await supabase.auth.signOut();
      toast.error(PLATFORM_STAFF_MSG);
      return false;
    }

    if (!roles.includes("owner")) {
      await supabase.auth.signOut();
      toast.error(OWNER_ONLY_MSG);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Owner website access]", error);
    await supabase.auth.signOut();
    toast.error("We could not verify owner access. Please try again.");
    return false;
  }
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Owner sign in  -  SEZA" },
      {
        name: "description",
        content: "Store owners sign in to the SEZA management dashboard.",
      },
      { property: "og:title", content: "Owner sign in  -  SEZA" },
      {
        property: "og:description",
        content: "Sign in to manage your SEZA store.",
      },
      { property: "og:url", content: "https://dashboard.sezapos.com/auth" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://dashboard.sezapos.com/auth" }],
  }),
  component: OwnerAuthPage,
});

function OwnerAuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || cancelled) return;

      if (await ensureOwnerWebsiteAccess(user.id)) {
        navigate({ to: "/dashboard", replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <a href={marketingUrl("/")} className="mb-6 flex items-center justify-center gap-2">
          <Logo className="size-9 rounded-lg" />
          <span className="text-lg font-semibold tracking-tight">SEZA</span>
        </a>

        <h1 className="sr-only">Sign in to the SEZA owner dashboard</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Owner sign in</CardTitle>
            <CardDescription className="text-center">
              Use the email and password connected to your store owner account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OwnerEmailLogin />
          </CardContent>
          <div className="px-6 pb-6 text-center text-xs text-muted-foreground">
            New merchant?{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function OwnerEmailLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const signIn = useServerFn(secureOwnerPasswordSignIn);
  const beginPasskey = useServerFn(beginPasskeyLogin);
  const finishPasskey = useServerFn(finishPasskeyLogin);
  const cooldown = useAuthCooldown();
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaReset, setCaptchaReset] = useState(0);

  const finishSignIn = async (userId: string) => {
    if (!(await ensureOwnerWebsiteAccess(userId))) return;

    void import("@/lib/audit-log").then((module) =>
      module.logAudit({ action: "login", details: { method: "password" } }),
    );
    navigate({ to: "/dashboard", replace: true });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (cooldown.active) return;
    setBusy(true);

    try {
      const result = await signIn({ data: { email, password, captchaToken } });
      if (!result.ok || !result.session || !result.user_id) {
        cooldown.start(result.ok ? 0 : result.retry_after_seconds);
        toast.error(result.ok ? "Sign in failed" : result.error);
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (error) throw error;
      navigate({ to: "/dashboard", replace: true });
    } catch {
      toast.error("Sign in is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
      setCaptchaReset((value) => value + 1);
    }
  };

  const handlePasskey = async () => {
    if (!email.trim()) {
      toast.error("Enter your owner email first.");
      return;
    }
    setBusy(true);
    try {
      const started = await beginPasskey({ data: { email: email.trim().toLowerCase() } });
      const response = await startAuthentication({ optionsJSON: started.options as any });
      const completed = await finishPasskey({ data: { challengeId: started.challengeId, response } });
      const { data, error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: completed.tokenHash,
      });
      if (error || !data.user) throw error ?? new Error("Could not create session");
      if (!(await ensureOwnerWebsiteAccess(data.user.id))) return;
      navigate({ to: "/dashboard", replace: true });
    } catch (error: any) {
      toast.error(error?.message || "Passkey sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const oauthRedirect = () => `${window.location.origin}/auth`;

  const handleOAuth = async (provider: "google" | "apple") => {
    setBusy(true);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: oauthRedirect(),
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });

    if (error) {
      toast.error(error.message ?? `${provider} sign in failed`);
      setBusy(false);
      return;
    }

    // Supabase redirects the browser to the provider when a URL is returned.
    if (data.url) return;

    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) await finishSignIn(userData.user.id);
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        onClick={() => handleOAuth("google")}
        disabled={busy}
      >
        <svg className="mr-2 size-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
          />
        </svg>
        Continue with Google
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <Button type="button" variant="outline" className="h-11 w-full" onClick={handlePasskey} disabled={busy || !email.trim()}>
          <Fingerprint className="mr-2 size-4" /> Sign in with passkey
        </Button>
        <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or password</span></div></div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </div>
        <AuthTurnstile onTokenChange={setCaptchaToken} resetKey={captchaReset} />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={busy || cooldown.active || (authCaptchaEnabled && !captchaToken)}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <LogIn className="mr-2 size-4" />{" "}
              {cooldown.active ? `Try again in ${cooldown.seconds}s` : "Sign in"}
            </>
          )}
        </Button>
      </form>

      <ForgotPasswordLink />
    </div>
  );
}

function ForgotPasswordLink() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const resetPassword = useServerFn(securePasswordReset);
  const cooldown = useAuthCooldown();
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaReset, setCaptchaReset] = useState(0);

  const sendReset = async () => {
    if (!email) return;
    setBusy(true);

    try {
      const result = await resetPassword({
        data: { email, surface: "owner", captchaToken },
      });
      cooldown.start(result.retry_after_seconds);
      toast.success("If that owner email exists, a reset link is on its way.");
      setOpen(false);
      setEmail("");
    } catch {
      toast.success("If that owner email exists, a reset link is on its way.");
      setOpen(false);
    } finally {
      setBusy(false);
      setCaptchaReset((value) => value + 1);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full text-center text-xs text-primary hover:underline"
      >
        Forgot password?
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset owner password</DialogTitle>
            <DialogDescription>
              Enter the email connected to your store owner account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reset-email">Owner email</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@example.com"
            />
          </div>
          <AuthTurnstile onTokenChange={setCaptchaToken} resetKey={captchaReset} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={sendReset}
              disabled={busy || !email || cooldown.active || (authCaptchaEnabled && !captchaToken)}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              <KeyRound className="mr-2 size-4" />
              Send reset link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
