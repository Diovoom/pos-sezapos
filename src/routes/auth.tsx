import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useServerFn } from "@tanstack/react-start";
import { signInWithEmployeePin } from "@/lib/employees.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Delete, LogIn, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

type Search = { mode?: "email" | "keypad" };

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Velocity POS" },
      { name: "description", content: "Sign in to your Velocity POS terminal." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: s.mode === "email" ? "email" : "keypad",
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/pos", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6">
          <div className="size-9 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">V</div>
          <span className="font-semibold tracking-tight text-lg">Velocity POS</span>
        </Link>

        <Card>
          <Tabs defaultValue={search.mode ?? "keypad"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-center">Sign in to your terminal</CardTitle>
              <CardDescription className="text-center">
                Employees sign in with their 6-digit ID.
              </CardDescription>
            </CardHeader>
            <div className="px-6">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="keypad">Employee ID</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
              </TabsList>
            </div>
            <CardContent className="pt-4">
              <TabsContent value="keypad" className="m-0">
                <KeypadLogin />
              </TabsContent>
              <TabsContent value="email" className="m-0">
                <EmailLogin />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------- Keypad ------------------------------- */

function KeypadLogin() {
  const navigate = useNavigate();
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [stage, setStage] = useState<"id" | "pin">("id");
  const [busy, setBusy] = useState(false);
  const signIn = useServerFn(signInWithEmployeePin);

  const active = stage === "id" ? empId : pin;
  const setActive = stage === "id" ? setEmpId : setPin;
  const label = stage === "id" ? "Employee ID" : "PIN";

  const dots = useMemo(() => {
    const len = 6;
    return Array.from({ length: len }, (_, i) => i < active.length);
  }, [active]);

  const press = (d: string) => {
    if (active.length >= 6) return;
    setActive(active + d);
  };
  const del = () => setActive(active.slice(0, -1));
  const clear = () => setActive("");

  useEffect(() => {
    if (stage === "id" && empId.length === 6) setStage("pin");
  }, [empId, stage]);

  useEffect(() => {
    if (stage !== "pin" || pin.length !== 6) return;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const submit = async () => {
    setBusy(true);
    try {
      const { email, token_hash } = await signIn({ data: { employee_id: empId, pin } });
      const { error } = await supabase.auth.verifyOtp({
        email,
        token_hash,
        type: "magiclink",
      });
      if (error) throw error;
      navigate({ to: "/pos", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setPin("");
      setStage("pin");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
        <div className="flex justify-center gap-2 mb-1">
          {dots.map((filled, i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full border-2",
                filled ? "bg-primary border-primary" : "border-muted-foreground/40",
                stage === "pin" && filled ? "bg-primary" : "",
              )}
            />
          ))}
        </div>
        {stage === "id" && empId.length > 0 && (
          <div className="text-2xl font-mono tracking-widest">{empId.padEnd(6, "•")}</div>
        )}
        {busy && <div className="mt-2 text-xs text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="size-3 animate-spin" />Signing you in…</div>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {["1","2","3","4","5","6","7","8","9"].map((d) => (
          <KeyBtn key={d} onClick={() => press(d)} disabled={busy}>{d}</KeyBtn>
        ))}
        <KeyBtn onClick={clear} disabled={busy} variant="ghost">C</KeyBtn>
        <KeyBtn onClick={() => press("0")} disabled={busy}>0</KeyBtn>
        <KeyBtn onClick={del} disabled={busy} variant="ghost"><Delete className="size-5" /></KeyBtn>
      </div>

      <div className="flex justify-between text-xs">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => { setStage("id"); setEmpId(""); setPin(""); }}
        >
          Switch employee
        </button>
        {stage === "pin" && (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => { setStage("id"); setPin(""); }}
          >
            Change ID
          </button>
        )}
      </div>
    </div>
  );
}

function KeyBtn({
  children, onClick, disabled, variant = "solid",
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; variant?: "solid" | "ghost" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-16 rounded-xl text-2xl font-semibold font-mono transition-all active:scale-95",
        variant === "solid"
          ? "bg-card border hover:border-primary/60 hover:bg-primary/5"
          : "text-muted-foreground hover:bg-accent",
        disabled && "opacity-50",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------ Email login --------------------------- */

function EmailLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/pos", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/pos", replace: true });
  };

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" className="w-full h-11" onClick={handleGoogle} disabled={busy}>
        <svg className="size-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
        Continue with Google
      </Button>
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <Button type="submit" className="w-full h-11" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <><LogIn className="size-4 mr-2" />Sign in</>}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
        <Mail className="size-3" /> Employees sign in with email <strong>only on first login</strong>.
      </p>
    </div>
  );
}
