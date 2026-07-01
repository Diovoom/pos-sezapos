import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { completeFirstLogin } from "@/lib/employees.functions";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const submit = useServerFn(completeFirstLogin);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords don't match");
    if (password.length < 8) return toast.error("Password must be 8+ characters");
    if (pin && !/^\d{6}$/.test(pin)) return toast.error("PIN must be 6 digits");
    setBusy(true);
    try {
      await submit({ data: { new_password: password, pin: pin || undefined } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Account secured. Welcome!");
      navigate({ to: "/pos", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Set up your account" subtitle="First-time sign-in" />
      <div className="flex-1 overflow-y-auto p-6 grid place-items-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />Secure your login
            </CardTitle>
            <CardDescription>
              Choose a permanent password, then optionally a 6-digit PIN for
              quick keypad sign-in on this terminal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>New password</Label>
                <Input type="password" value={password} minLength={8} autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Confirm password</Label>
                <Input type="password" value={confirm} minLength={8} autoComplete="new-password"
                  onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Quick sign-in PIN <span className="text-muted-foreground font-normal">(optional, 6 digits)</span></Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  className="font-mono text-lg tracking-widest text-center"
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                Save and continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
