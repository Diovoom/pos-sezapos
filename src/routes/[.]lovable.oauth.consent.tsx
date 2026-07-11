import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Logo } from "@/components/brand/Logo";
import { Loader2 } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type OAuthNS = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
function oauth(): OAuthNS {
  return (supabase.auth as unknown as { oauth: OAuthNS }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Supabase session lives in localStorage; the server can't see it.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-4 bg-surface">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Could not load this authorization request</CardTitle>
          <CardDescription className="text-destructive">
            {String((error as Error)?.message ?? error)}
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "an app";
  const redirectUri = details?.client?.redirect_uris?.[0] ?? details?.client?.redirect_uri;
  const scopes: string[] = Array.isArray(details?.scopes)
    ? details.scopes
    : typeof details?.scope === "string"
      ? details.scope.split(/\s+/).filter(Boolean)
      : [];

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message ?? "Authorization failed");
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-surface">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Logo className="size-9 rounded-lg" />
          <span className="font-semibold tracking-tight text-lg">SEZA POS</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Connect {clientName} to your account</CardTitle>
            <CardDescription>
              This lets <strong>{clientName}</strong> use SEZA POS as you. It can call this app's enabled
              tools while you are signed in. This does not bypass SEZA POS permissions or backend policies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {redirectUri && (
              <div className="text-xs text-muted-foreground break-all">
                Redirect: <span className="font-mono">{redirectUri}</span>
              </div>
            )}
            {scopes.length > 0 && (
              <div className="text-sm">
                <div className="font-medium mb-1">Requested access</div>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  {scopes.map((s) => (
                    <li key={s}>{scopeLabel(s)}</li>
                  ))}
                </ul>
              </div>
            )}
            {error && (
              <div role="alert" className="text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
                Cancel connection
              </Button>
              <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Approve"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case "openid":
      return "Verify your identity";
    case "email":
      return "Share your email address";
    case "profile":
      return "Share your basic profile";
    default:
      return `Additional permission requested: ${scope}`;
  }
}
