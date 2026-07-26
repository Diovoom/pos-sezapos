import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, MailX, CheckCircle2, AlertTriangle } from "lucide-react";

type Search = { token?: string };

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({
    meta: [
      { title: "Unsubscribe  -  SEZA POS" },
      { name: "description", content: "Manage your SEZA POS email subscription." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
  component: UnsubscribePage,
});

type State =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "already" }
  | { kind: "ready" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setState({ kind: "invalid", message: "Missing unsubscribe token." });
        return;
      }
      try {
        const res = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`);
        const body = await res.json().catch(() => ({}) as any);
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "invalid", message: body?.error ?? "Invalid or expired link." });
          return;
        }
        if (body?.valid === false && body?.reason === "already_unsubscribed") {
          setState({ kind: "already" });
          return;
        }
        if (body?.valid) {
          setState({ kind: "ready" });
          return;
        }
        setState({ kind: "invalid", message: "Invalid link." });
      } catch {
        if (!cancelled) setState({ kind: "invalid", message: "Could not validate link." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}) as any);
      if (!res.ok) throw new Error(body?.error ?? "Could not unsubscribe.");
      if (body?.success === false && body?.reason === "already_unsubscribed") {
        setState({ kind: "already" });
        return;
      }
      setState({ kind: "done" });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Failed" });
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-surface">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto size-12 rounded-full bg-primary/10 grid place-items-center mb-2">
            <MailX className="size-6 text-primary" />
          </div>
          <CardTitle>Unsubscribe</CardTitle>
          <CardDescription>Manage email preferences for SEZA POS.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {state.kind === "loading" && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Verifying link…
            </div>
          )}
          {state.kind === "invalid" && (
            <div className="flex flex-col items-center gap-2 text-destructive">
              <AlertTriangle className="size-6" />
              <p className="text-sm">{state.message}</p>
            </div>
          )}
          {state.kind === "already" && (
            <div className="flex flex-col items-center gap-2 text-emerald-700">
              <CheckCircle2 className="size-6" />
              <p className="text-sm">
                You are already unsubscribed. No further emails will be sent.
              </p>
            </div>
          )}
          {state.kind === "ready" && (
            <>
              <p className="text-sm text-muted-foreground">
                Click below to stop receiving emails from SEZA POS.
              </p>
              <Button className="w-full" onClick={confirm}>
                Confirm unsubscribe
              </Button>
            </>
          )}
          {state.kind === "submitting" && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Unsubscribing…
            </div>
          )}
          {state.kind === "done" && (
            <div className="flex flex-col items-center gap-2 text-emerald-700">
              <CheckCircle2 className="size-6" />
              <p className="text-sm">You've been unsubscribed. Sorry to see you go.</p>
            </div>
          )}
          {state.kind === "error" && (
            <div className="flex flex-col items-center gap-2 text-destructive">
              <AlertTriangle className="size-6" />
              <p className="text-sm">{state.message}</p>
              <Button variant="outline" onClick={confirm}>
                Try again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
