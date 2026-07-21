import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabaseAdminAuth as supabase } from "@/integrations/supabase/admin-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { logAudit } from "@/lib/audit-log";
import { recordAdminLoginAttempt } from "@/lib/admin/login-attempts.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/admin/auth")({
  head: () => ({
    meta: [
      { title: "SEZA Admin — Sign in" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminAuthPage,
});

import { PLATFORM_ROLES } from "@/lib/platform-roles";

const GENERIC_ERROR = "Invalid credentials or insufficient permissions.";

async function isPlatformStaff(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) return false;
  return (data ?? []).some((r) => (PLATFORM_ROLES as readonly string[]).includes(r.role as string));
}

function AdminAuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const recordAttempt = useServerFn(recordAdminLoginAttempt);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      if (await isPlatformStaff(data.session.user.id)) {
        navigate({ to: "/admin", replace: true });
      }
    })();
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        await logAudit({ action: "login", entity: "admin", details: { ok: false, email, reason: "invalid_credentials" } }).catch(() => {});
        toast.error(GENERIC_ERROR);
        return;
      }
      const ok = await isPlatformStaff(data.session.user.id);
      if (!ok) {
        await logAudit({ action: "override.denied", entity: "admin", details: { reason: "not_super_admin" } });
        await supabase.auth.signOut();
        toast.error(GENERIC_ERROR);
        return;
      }
      await logAudit({ action: "login", entity: "admin", details: { ok: true } });
      navigate({ to: "/admin", replace: true });
    } catch {
      toast.error(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Always show the same generic message — never reveal whether an
      // email exists in the system.
      toast.success("If that account exists, a reset link has been sent.");
      setForgotMode(false);
    } catch {
      toast.success("If that account exists, a reset link has been sent.");
    } finally {
      setLoading(false);
    }
  }

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
              : "Restricted access — authorized personnel only."}
          </CardDescription>
        </CardHeader>
        <CardContent>
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

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : forgotMode ? "Send reset link" : "Sign In"}
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
