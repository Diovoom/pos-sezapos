import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/admin/auth/callback")({
  head: () => ({
    meta: [
      { title: "Redirecting - SEZA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LegacyOAuthCallbackRedirect,
});

function LegacyOAuthCallbackRedirect() {
  useEffect(() => {
    window.location.replace("/admin/auth");
  }, []);

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Returning to SEZA sign in...</p>
    </main>
  );
}
