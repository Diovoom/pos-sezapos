// First-login onboarding for the bundled Android shell. Talks directly
// to the public HTTPS endpoint /api/public/pos/complete-first-login with
// the current employee's bearer token — no server functions required.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { postAuthed } from "../api";

export function OnboardingScreen() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords don't match");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (pin && !/^\d{6}$/.test(pin)) return toast.error("PIN must be 6 digits");
    setBusy(true);
    try {
      await postAuthed("/api/public/pos/complete-first-login", { new_password: password, pin: pin || undefined });
      toast.success("Account secured. Welcome!");
      navigate({ to: "/pos", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Finish setting up your account</CardTitle>
          <CardDescription>Choose a permanent password. You can also set a 6-digit PIN for fast register sign-in.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">6-digit PIN (optional)</Label>
              <Input id="pin" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save and continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
