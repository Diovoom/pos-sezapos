import { createFileRoute, useNavigate, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabaseAdminAuth as supabase } from "@/integrations/supabase/admin-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useServerFn } from "@tanstack/react-start";
import { secureAdminPasswordSignIn, securePasswordReset } from "@/lib/auth/auth.functions";
import { AuthTurnstile, authCaptchaEnabled, useAuthCooldown } from "@/features/auth";

export const Route = createFileRoute("/admin/auth")({
  head: () => ({
    meta: [{ title: "SEZA Admin  -  Sign in" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminAuthPage,
});

import { PLATFORM_ROLES } from "@/lib/platform-roles";

const GENERIC_ERROR = "Invalid credentials or insufficient permissions.";

async function isPlatformStaff(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) return false;
  return (data ?? []).some((r) => (PLATFORM_ROLES as readonly string[]).includes(r.role as string));
}

function AdminAuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOAuthCallback = location.pathname === "/admin/auth/callback";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const signIn = useServerFn(secureAdminPasswordSignIn);
  const resetPassword = useServerFn(securePasswordReset);
  const cooldown = useAuthCooldown();
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    if (isOAuthCallback) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      if (await isPlatformStaff(data.session.user.id)) {
        navigate({ to: "/admin", replace: true });
      }
    })();
  }, [navigate, isOAuthCallback]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (loading || cooldown.active) return;
    setLoading(true);
    try {
      const result = await signIn({ data: { email, password, captchaToken } });
      if (!result.ok || !result.session) {
        cooldown.start(result.ok ? 0 : result.retry_after_seconds);
        toast.error(result.ok ? GENERIC_ERROR : result.error);
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (error) throw error;
      navigate({ to: "/admin", replace: true });
    } catch {
      toast.error(GENERIC_ERROR);
    } finally {
      setLoading(false);
      setCaptchaReset((value) => value + 1);
    }
  }

  async function handleGoogleSignIn() {
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/admin/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // Browser Supabase client performs the redirect automatically.
    } catch {
      toast.error(GENERIC_ERROR);
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (loading || cooldown.active) return;
    setLoading(true);
    try {
      const result = await resetPassword({ data: { email, surface: "admin", captchaToken } });
      cooldown.start(result.retry_after_seconds);
      toast.success("If that account exists, a reset link has been sent.");
      setForgotMode(false);
    } catch {
      toast.success("If that account exists, a reset link has been sent.");
    } finally {
      setLoading(false);
      setCaptchaReset((value) => value + 1);
    }
  }

  if (isOAuthCallback) return <Outlet />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <Logo className="h-12" alt="SEZA POS" />
          </div>
          <div className="flex items-center justify-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <CardTitle>SEZA Platform Admin</CardTitle>
          </div>
          <CardDescription>
            {forgotMode
              ? "Enter your admin email to receive a password reset link."
              : "Restricted access  -  authorized personnel only."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!forgotMode && (
            <>
              <Button
                type="button"
                variant="outline"
                className="mb-4 h-11 w-full"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                Continue with Google
              </Button>
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>
            </>
          )}
          <form onSubmit={forgotMode ? handleForgot : handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            {!forgotMode && (
              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <div className="relative">
                  <Input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <AuthTurnstile onTokenChange={setCaptchaToken} resetKey={captchaReset} />
            <Button
              type="submit"
              className="w-full"
              disabled={loading || cooldown.active || (authCaptchaEnabled && !captchaToken)}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : cooldown.active ? (
                `Try again in ${cooldown.seconds}s`
              ) : forgotMode ? (
                "Send reset link"
              ) : (
                "Sign In"
              )}
            </Button>

            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => setForgotMode((v) => !v)}
                className="text-primary hover:underline"
              >
                {forgotMode ? "Back to sign in" : "Forgot password?"}
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Not an administrator?{" "}
            <Link to="/auth" className="text-primary hover:underline">
              Merchant sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
