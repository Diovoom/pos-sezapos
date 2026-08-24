import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { hasAnyPlatformRole } from "@/lib/platform-roles";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Completing sign in - SEZA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
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
        if (!user) throw new Error("Supabase did not create a user session.");

        const { data: roleRows, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        if (roleError) throw roleError;

        const roles = (roleRows ?? []).map((row) => row.role as string);
        if (hasAnyPlatformRole(roles)) {
          await supabase.auth.signOut();
          throw new Error("Platform administrators must use admin.sezapos.com.");
        }
        if (!roles.includes("owner")) {
          await supabase.auth.signOut();
          throw new Error("This account does not have SEZA owner access.");
        }

        if (!cancelled) {
          navigate({ to: "/dashboard", replace: true });
        }
      } catch (error) {
        console.error("[Google OAuth callback]", error);
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Google sign in failed.");
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
        <div className="w-full max-w-md rounded-xl border bg-background p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Google sign in failed</h1>
          <p className="mt-3 text-sm text-muted-foreground">{errorMessage}</p>
          <a
            href="/auth"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Back to sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Completing Google sign in...
      </div>
    </main>
  );
}
