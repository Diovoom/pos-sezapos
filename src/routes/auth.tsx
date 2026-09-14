import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
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
import { deleteMeta, readMeta } from "@/lib/offline/db";
import { clearOwnerQueryCache } from "@/lib/owner-query-cache";
import {
  clearOwnerLoginIntent,
  clearOwnerSessionIdentity,
  rememberOwnerSessionIdentity,
  setOwnerLoginIntent,
} from "@/lib/owner-session-lock";

const PLATFORM_STAFF_MSG = "Platform administrators cannot sign in here. Use admin.sezapos.com.";
const OWNER_ONLY_MSG =
  "The SEZA website is for store owners. Employees use the paired SEZA POS Android app.";

const OWNER_SIGN_IN_TIMEOUT_MS = 12_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("OWNER_SIGN_IN_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function clearOwnerBrowserIdentity(
  queryClient: QueryClient,
  explicitUserId?: string | null,
) {
  await queryClient.cancelQueries().catch(() => undefined);
  queryClient.clear();

  const cachedUserId = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
  const userIds = [...new Set([cachedUserId, explicitUserId].filter(Boolean) as string[])];

  await Promise.all([
    deleteMeta("authenticated_me_current_user").catch(() => undefined),
    deleteMeta("authenticated_me").catch(() => undefined),
    deleteMeta("profile").catch(() => undefined),
    ...userIds.flatMap((userId) => [
      deleteMeta(`authenticated_me:${userId}`).catch(() => undefined),
      deleteMeta(`profile:${userId}`).catch(() => undefined),
    ]),
  ]);

  clearOwnerQueryCache();
  clearOwnerSessionIdentity();
}

async function ensureOwnerWebsiteAccess(userId: string): Promise<boolean> {
  try {
    const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] =
      await withTimeout(
        Promise.all([
          supabase.from("profiles").select("store_id").eq("id", userId).maybeSingle(),
          supabase.from("user_roles").select("role,store_id").eq("user_id", userId),
        ]),
        8_000,
      );
    if (profileError) throw profileError;
    if (roleError) throw roleError;

    const roles = (roleRows ?? []).map((row) => row.role as string);
    const profileStoreId = profile?.store_id ?? null;

    if (hasAnyPlatformRole(roles)) {
      await supabase.auth.signOut();
      toast.error(PLATFORM_STAFF_MSG);
      return false;
    }

    const ownsProfileStore = Boolean(
      profileStoreId &&
        (roleRows ?? []).some(
          (row) => row.role === "owner" && row.store_id === profileStoreId,
        ),
    );
    if (!ownsProfileStore) {
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
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthReturn =
      params.get("oauth") === "1" ||
      params.has("code") ||
      window.location.hash.includes("access_token=") ||
      window.location.hash.includes("error_description=");

    // A normal visit to /auth must stay on the sign-in page even if Safari
    // restored an older Supabase session from localStorage. Otherwise an old
    // owner can "win" the race and reopen before the newly-entered account is
    // submitted. OAuth is the only flow that intentionally restores a session
    // from the callback URL.
    if (!oauthReturn) return;

    let cancelled = false;
    let navigating = false;

    const finishOAuthSession = async (userId?: string) => {
      if (!userId || cancelled || navigating) return;
      navigating = true;

      await clearOwnerBrowserIdentity(queryClient);
      if (await ensureOwnerWebsiteAccess(userId)) {
        const { data: verified } = await supabase.auth.getUser();
        if (!verified.user || verified.user.id !== userId) {
          await supabase.auth.signOut({ scope: "local" } as any).catch(() => undefined);
          clearOwnerSessionIdentity();
          return;
        }
        rememberOwnerSessionIdentity(verified.user);
        clearOwnerLoginIntent();
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      navigating = false;
    };

    const oauthError = params.get("error_description");
    if (oauthError) toast.error(oauthError);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        void finishOAuthSession(session?.user?.id);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      void finishOAuthSession(data.session?.user?.id);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [navigate, queryClient]);

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
  const queryClient = useQueryClient();
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

    const normalizedEmail = email.trim().toLowerCase();
    setOwnerLoginIntent(normalizedEmail);

    try {
      let result: Awaited<ReturnType<typeof signIn>> | null = null;
      try {
        result = await withTimeout(
          signIn({ data: { email: normalizedEmail, password, captchaToken } }),
          OWNER_SIGN_IN_TIMEOUT_MS,
        );
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "OWNER_SIGN_IN_TIMEOUT") throw error;

        // Cloudflare/server-function cold starts must not leave the owner on an
        // endless spinner. Fall back to Supabase Auth directly, then run the
        // exact same owner/store authorization check before entering dashboard.
        const { data: direct, error: directError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
          options: captchaToken ? { captchaToken } : undefined,
        });
        if (directError || !direct.user || !direct.session) {
          clearOwnerLoginIntent();
          toast.error("Invalid email or password.");
          return;
        }

        rememberOwnerSessionIdentity(direct.user);
        clearOwnerLoginIntent();
        await finishSignIn(direct.user.id);
        return;
      }

      if (!result.ok || !result.session || !result.user_id) {
        clearOwnerLoginIntent();
        cooldown.start(result.ok ? 0 : result.retry_after_seconds);
        toast.error(result.ok ? "Sign in failed" : result.error);
        return;
      }

      // setSession replaces the browser's active Supabase session. Do not sign
      // out first: on Safari/WebKit the auth storage lock can stall between a
      // signOut() and an immediate setSession(), leaving the button spinning
      // even though the server already accepted the password.
      const previous = await withTimeout(supabase.auth.getSession(), 4_000).catch(() => null);
      const previousUserId = previous?.data.session?.user?.id ?? null;

      const { data: activated, error } = await withTimeout(
        supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        }),
        8_000,
      );
      if (error) throw error;

      const activeUser = activated.user ?? activated.session?.user;
      if (
        !activeUser ||
        activeUser.id !== result.user_id ||
        (activeUser.email ?? "").trim().toLowerCase() !== normalizedEmail
      ) {
        await supabase.auth.signOut({ scope: "local" } as any).catch(() => undefined);
        await clearOwnerBrowserIdentity(queryClient, activeUser?.id ?? result.user_id);
        throw new Error("The active account did not match the email that was submitted.");
      }

      await withTimeout(clearOwnerBrowserIdentity(queryClient, previousUserId), 3_000).catch(
        () => undefined,
      );
      rememberOwnerSessionIdentity(activeUser);
      clearOwnerLoginIntent();
      await finishSignIn(activeUser.id);
    } catch (error) {
      await supabase.auth.signOut({ scope: "local" } as any).catch(() => undefined);
      await clearOwnerBrowserIdentity(queryClient).catch(() => undefined);
      clearOwnerLoginIntent();
      console.error("[Owner password sign-in]", error);
      toast.error("Sign in is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
      setCaptchaReset((value) => value + 1);
    }
  };

  const handlePasskey = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Enter your owner email first.");
      return;
    }
    setOwnerLoginIntent(normalizedEmail);
    setBusy(true);
    try {
      const started = await beginPasskey({ data: { email: normalizedEmail } });
      const response = await startAuthentication({ optionsJSON: started.options as any });
      const completed = await finishPasskey({
        data: { challengeId: started.challengeId, response },
      });

      const { data: previous } = await supabase.auth.getSession();
      const previousUserId = previous.session?.user?.id ?? null;
      if (previousUserId) {
        await supabase.auth.signOut({ scope: "local" } as any).catch(() => undefined);
      }
      await clearOwnerBrowserIdentity(queryClient, previousUserId);

      const { data, error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: completed.tokenHash,
      });
      if (error || !data.user) throw error ?? new Error("Could not create session");
      if ((data.user.email ?? "").trim().toLowerCase() !== normalizedEmail) {
        await supabase.auth.signOut({ scope: "local" } as any).catch(() => undefined);
        throw new Error("Passkey account did not match the email entered.");
      }
      if (!(await ensureOwnerWebsiteAccess(data.user.id))) return;
      rememberOwnerSessionIdentity(data.user);
      clearOwnerLoginIntent();
      navigate({ to: "/dashboard", replace: true });
    } catch (error: any) {
      await supabase.auth.signOut({ scope: "local" } as any).catch(() => undefined);
      await clearOwnerBrowserIdentity(queryClient).catch(() => undefined);
      clearOwnerLoginIntent();
      toast.error(error?.message || "Passkey sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const oauthRedirect = () => `${window.location.origin}/auth?oauth=1`;

  const handleOAuth = async (provider: "google" | "apple") => {
    setBusy(true);
    clearOwnerLoginIntent();

    const { data: previous } = await supabase.auth.getSession();
    const previousUserId = previous.session?.user?.id ?? null;
    if (previousUserId) {
      await supabase.auth.signOut({ scope: "local" } as any).catch(() => undefined);
    }
    await clearOwnerBrowserIdentity(queryClient, previousUserId);

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

    // Supabase performs the browser redirect. When Google returns to /auth,
    // detectSessionInUrl restores the implicit session and the auth listener above
    // verifies owner access before navigating to /dashboard.
    if (!data.url) setBusy(false);
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
            name="username"
            autoComplete="username"
            value={email}
            onChange={(event) => {
              const nextEmail = event.target.value;
              if (nextEmail !== email && password) setPassword("");
              setEmail(nextEmail);
            }}
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
            name="password"
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
