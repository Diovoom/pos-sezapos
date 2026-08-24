import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabaseAdminAuth as supabase } from "@/integrations/supabase/admin-client";
import { PLATFORM_ROLES } from "@/lib/platform-roles";

export const Route = createFileRoute("/admin/auth/callback")({
  head: () => ({
    meta: [
      { title: "Completing admin sign in - SEZA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminAuthCallbackPage,
});

function AdminAuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get("error_description") || params.get("error");
        if (oauthError) throw new Error(oauthError);

        const code = params.get("code");
        if (!code) throw new Error("Google did not return an authorization code.");

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;

        const user = data.session?.user ?? data.user;
        if (!user) throw new Error("Supabase did not create an admin session.");

        const { data: roleRows, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        if (roleError) throw roleError;

        const isPlatformStaff = (roleRows ?? []).some((row) =>
          (PLATFORM_ROLES as readonly string[]).includes(row.role as string),
        );
        if (!isPlatformStaff) {
          await supabase.auth.signOut();
          throw new Error("This Google account does not have SEZA platform admin access.");
        }

        if (!cancelled) navigate({ to: "/admin", replace: true });
      } catch (error) {
        console.error("[Admin Google OAuth callback]", error);
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Google admin sign in failed.");
        }
      }
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-surface p-6 flex items-center justify-center">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">Admin sign in failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
          <a className="mt-4 inline-block text-sm font-medium text-primary hover:underline" href="/admin/auth">
            Return to admin sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Completing secure admin sign in...
      </div>
    </main>
  );
}
