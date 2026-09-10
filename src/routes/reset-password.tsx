import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { AlertCircle, KeyRound, Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password  -  SEZA POS" },
      { name: "description", content: "Choose a new password for your SEZA POS account." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

type RecoveryState = "checking" | "ready" | "invalid";

type RecoveryUrlContext = {
  hasRecoveryProof: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  tokenHash: string | null;
  explicitError: string | null;
};

function recoveryUrlContext(): RecoveryUrlContext {
  if (typeof window === "undefined") {
    return {
      hasRecoveryProof: false,
      accessToken: null,
      refreshToken: null,
      code: null,
      tokenHash: null,
      explicitError: null,
    };
  }

  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const recoveryType = search.get("type") ?? hash.get("type");
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const code = search.get("code");
  const tokenHash = search.get("token_hash") ?? hash.get("token_hash");
  const explicitError =
    search.get("error_description") ??
    hash.get("error_description") ??
    search.get("error_code") ??
    hash.get("error_code") ??
    search.get("error") ??
    hash.get("error");

  return {
    hasRecoveryProof:
      recoveryType === "recovery" ||
      (!!accessToken && !!refreshToken) ||
      !!code ||
      !!tokenHash,
    accessToken,
    refreshToken,
    code,
    tokenHash,
    explicitError,
  };
}

function clearRecoverySecretsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of [
    "code",
    "token_hash",
    "type",
    "error",
    "error_code",
    "error_description",
  ]) {
    url.searchParams.delete(key);
  }
  url.hash = "";
  const query = url.searchParams.toString();
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${query ? `?${query}` : ""}`,
  );
}

function readableRecoveryError(value: string | null) {
  if (!value) {
    return "This password-reset link is invalid or has already expired. Request a new link and open the newest email.";
  }
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const adminRecovery =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("surface") === "admin";
  const authClient = adminRecovery ? supabaseAdminAuth : supabase;
  // Capture the recovery parameters before Supabase has a chance to consume
  // or clean them from the browser URL.
  const [recoveryContext] = useState<RecoveryUrlContext>(() => recoveryUrlContext());
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [recoveryError, setRecoveryError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let recoveredByEvent = false;

    const markReady = () => {
      if (cancelled) return;
      recoveredByEvent = true;
      setRecoveryError("");
      setRecoveryState("ready");
      clearRecoverySecretsFromUrl();
    };

    const { data: sub } = authClient.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) markReady();
    });

    void (async () => {
      let lastError: unknown = null;
      try {
        if (recoveryContext.explicitError) {
          throw new Error(readableRecoveryError(recoveryContext.explicitError));
        }

        // Implicit recovery links carry access/refresh tokens in the URL hash.
        // Explicitly establishing the session makes this reliable in browsers
        // where the automatic URL detector finishes before this route mounts.
        if (recoveryContext.accessToken && recoveryContext.refreshToken) {
          const { data, error } = await authClient.auth.setSession({
            access_token: recoveryContext.accessToken,
            refresh_token: recoveryContext.refreshToken,
          });
          if (error) lastError = error;
          if (data.session) {
            markReady();
            return;
          }
        }

        // Support PKCE-style callbacks too. This is harmless for the normal
        // implicit flow and makes recovery resilient if auth configuration is
        // changed later.
        if (!recoveredByEvent && recoveryContext.code) {
          const { data, error } = await authClient.auth.exchangeCodeForSession(
            recoveryContext.code,
          );
          if (error) lastError = error;
          if (data.session) {
            markReady();
            return;
          }
        }

        // Support secure token-hash recovery links used by customized Supabase
        // email templates.
        if (!recoveredByEvent && recoveryContext.tokenHash) {
          const { data, error } = await authClient.auth.verifyOtp({
            type: "recovery",
            token_hash: recoveryContext.tokenHash,
          });
          if (error) lastError = error;
          if (data.session) {
            markReady();
            return;
          }
        }

        // Automatic URL detection may have completed between subscription and
        // this point. Only trust an existing session when this page originally
        // contained recovery proof, so a normal logged-in session cannot turn
        // /reset-password into an unverified password-change shortcut.
        const { data, error } = await authClient.auth.getSession();
        if (error) lastError = error;
        if (recoveryContext.hasRecoveryProof && data.session) {
          markReady();
          return;
        }

        // Give onAuthStateChange one short turn to deliver PASSWORD_RECOVERY.
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        if (recoveredByEvent || cancelled) return;

        throw lastError instanceof Error
          ? lastError
          : new Error(readableRecoveryError(null));
      } catch (error) {
        if (cancelled || recoveredByEvent) return;
        setRecoveryState("invalid");
        setRecoveryError(
          error instanceof Error ? error.message : readableRecoveryError(null),
        );
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [authClient, recoveryContext]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recoveryState !== "ready") {
      toast.error("Open the newest password-reset link from your email first.");
      return;
    }
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      const { error } = await authClient.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated successfully.");
      navigate({ to: adminRecovery ? "/admin" : "/dashboard", replace: true } as any);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6">
          <Logo className="size-9 rounded-lg" />
          <span className="font-semibold tracking-tight text-lg">SEZA POS</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5" /> Choose a new password
            </CardTitle>
            <CardDescription>
              {recoveryState === "ready"
                ? "Enter a new password to complete recovery."
                : recoveryState === "checking"
                  ? "Checking your secure recovery link…"
                  : "This recovery link cannot be used."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recoveryState === "checking" ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Verifying recovery link…
              </div>
            ) : recoveryState === "invalid" ? (
              <div className="space-y-4">
                <div className="flex gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm">
                  <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                  <div>
                    <p className="font-medium text-foreground">Request a new password-reset email</p>
                    <p className="mt-1 text-muted-foreground">{recoveryError}</p>
                  </div>
                </div>
                <Button asChild className="w-full h-11">
                  <Link to={adminRecovery ? "/admin/auth" : "/auth"}>
                    Back to sign in
                  </Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="pw">New password</Label>
                  <Input
                    id="pw"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw2">Confirm password</Label>
                  <Input
                    id="pw2"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Update password"}
                </Button>
                <div className="text-center text-xs text-muted-foreground pt-1">
                  <Link to={adminRecovery ? "/admin/auth" : "/auth"} className="hover:underline">
                    Back to sign in
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
