import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminPlatformHealth } from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit-log";

export const Route = createFileRoute("/_adminApp/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const health = useServerFn(adminPlatformHealth);
  const { data } = useQuery({ queryKey: ["admin_platform_health"], queryFn: () => health(), refetchInterval: 60_000 });
  const [email, setEmail] = useState<string | null>(null);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function changePassword() {
    if (pwd.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      toast.success("Password updated");
      setPwd("");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  async function signOut() {
    await logAudit({ action: "logout", entity: "admin" }).catch(() => {});
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin/auth", replace: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Admin profile and platform status.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Admin profile</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Email:</span> <span className="font-mono">{email ?? "—"}</span></div>
          <div><span className="text-muted-foreground">Role:</span> super_admin</div>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Change password</CardTitle><CardDescription>Signs you out of other devices when combined with session revocation.</CardDescription></CardHeader>
        <CardContent className="space-y-2 max-w-md">
          <Label>New password</Label>
          <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <Button onClick={changePassword} disabled={busy || !pwd}>Update password</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Platform status</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <Row label="Database" ok={!!data?.database?.ok} note={data?.database?.ok ? "reachable" : (data as any)?.database?.error ?? "—"} />
          <Row label="Stripe sandbox" ok={!!data?.stripe_sandbox?.configured} note={data?.stripe_sandbox?.configured ? "configured" : "missing"} />
          <Row label="Stripe live" ok={!!data?.stripe_live?.configured} note={data?.stripe_live?.configured ? "configured" : "missing"} />
          <Row label="Email service" ok={!!data?.email?.configured} note="configured" />
          <div className="text-xs text-muted-foreground pt-2">App version: <span className="font-mono">{data?.app_version ?? "—"}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <div className="flex items-center justify-between border rounded px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full inline-block ${ok ? "bg-green-500" : "bg-red-500"}`} />
        <span>{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  );
}
