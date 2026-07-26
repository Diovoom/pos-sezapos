import type { ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  adminGetPlatformSettings,
  adminUpdatePlatformSettings,
  adminUpdateMyProfile,
} from "@/lib/admin/company-admin.functions";
import { adminPlatformHealth } from "@/lib/admin/admin.functions";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ShieldCheck,
  User,
  Bell,
  LockKeyhole,
  Building2,
  Activity,
  LogOut,
  Save,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminApp/admin/settings")({
  head: () => ({
    meta: [{ title: "Settings  -  SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const load = useServerFn(adminGetPlatformSettings);
  const savePlatform = useServerFn(adminUpdatePlatformSettings);
  const saveProfile = useServerFn(adminUpdateMyProfile);
  const healthFn = useServerFn(adminPlatformHealth);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["admin_real_settings"],
    queryFn: () => load(),
  });
  const healthQuery = useQuery({
    queryKey: ["admin_platform_health"],
    queryFn: () => healthFn(),
    refetchInterval: 60_000,
  });

  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState({
    fullName: "",
    phone: "",
    emailNotifications: true,
    urgentCaseNotifications: true,
    liveChatNotifications: true,
  });
  const [platform, setPlatform] = useState({
    companyName: "SEZA POS",
    supportEmail: "support@sezapos.com",
    billingEmail: "billing@sezapos.com",
    incidentEmail: "admin@sezapos.com",
    timezone: "America/New_York",
    defaultTrialDays: 14,
    supportSlaMinutes: 60,
    liveChatEnabled: true,
    maintenanceMode: false,
    maintenanceMessage: "",
    merchantBanner: "",
    reason: "",
  });

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    const prefs = data.staff?.notification_preferences ?? {};
    setProfile({
      fullName: data.profile?.full_name ?? "",
      phone: data.staff?.phone ?? data.profile?.phone ?? "",
      emailNotifications: prefs.email ?? true,
      urgentCaseNotifications: prefs.urgent_cases ?? true,
      liveChatNotifications: prefs.live_chat ?? true,
    });
    const s = data.settings;
    if (s) {
      setPlatform({
        companyName: s.company_name ?? "SEZA POS",
        supportEmail: s.support_email ?? "support@sezapos.com",
        billingEmail: s.billing_email ?? "billing@sezapos.com",
        incidentEmail: s.incident_email ?? "admin@sezapos.com",
        timezone: s.timezone ?? "America/New_York",
        defaultTrialDays: s.default_trial_days ?? 14,
        supportSlaMinutes: s.support_sla_minutes ?? 60,
        liveChatEnabled: s.live_chat_enabled ?? true,
        maintenanceMode: s.maintenance_mode ?? false,
        maintenanceMessage: s.maintenance_message ?? "",
        merchantBanner: s.merchant_banner ?? "",
        reason: "",
      });
    }
  }, [settingsQuery.data]);

  async function updateProfile() {
    setBusy(true);
    try {
      await saveProfile({ data: profile });
      toast.success("Admin profile and notifications updated");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin_real_settings"] }),
        qc.invalidateQueries({ queryKey: ["admin_company_employees"] }),
        qc.invalidateQueries({ queryKey: ["admin_founder_team"] }),
      ]);
      await settingsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update profile");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword() {
    if (password.length < 10) {
      toast.error("Use at least 10 characters");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabaseAdminAuth.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      toast.success("Admin password updated");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  async function revokeOtherSessions() {
    setBusy(true);
    try {
      const { error } = await supabaseAdminAuth.auth.signOut({ scope: "others" });
      if (error) throw error;
      toast.success("All other Admin sessions were revoked");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not revoke sessions");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabaseAdminAuth.auth.signOut();
    navigate({ to: "/admin/auth", replace: true });
  }

  async function updatePlatform() {
    if (platform.reason.trim().length < 4) {
      toast.error("Enter a reason for the platform audit log");
      return;
    }
    setBusy(true);
    try {
      await savePlatform({ data: platform });
      toast.success("SEZA platform settings updated");
      setPlatform((value) => ({ ...value, reason: "" }));
      qc.invalidateQueries({ queryKey: ["admin_real_settings"] });
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update platform settings");
    } finally {
      setBusy(false);
    }
  }

  const data = settingsQuery.data;
  const health = healthQuery.data;
  if (settingsQuery.isLoading)
    return <div className="text-sm text-muted-foreground">Loading real Admin settings…</div>;
  if (settingsQuery.isError || !data)
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <div className="text-sm text-destructive">
            {(settingsQuery.error as any)?.message ?? "Could not load Admin settings"}
          </div>
          <Button className="mt-3" variant="outline" onClick={() => settingsQuery.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Company identity, your Admin account, security, alerts, support rules, and live platform
          configuration.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" /> My SEZA profile
            </CardTitle>
            <CardDescription>
              This is your company staff profile - not a merchant employee profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name">
                <Input
                  value={profile.fullName}
                  onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                />
              </Field>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                <span className="font-mono">{data.profile?.email ?? " - "}</span>
              </div>
              <div className="mt-1">
                <span className="text-muted-foreground">Title:</span>{" "}
                {data.is_founder ? "Founder & CEO" : (data.staff?.title ?? "Not set")}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground">Roles:</span>
                {data.roles.map((role: string) => (
                  <Badge key={role} variant="outline">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
            <Button onClick={updateProfile} disabled={busy}>
              <Save className="mr-2 h-4 w-4" /> Save profile
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" /> My notifications
            </CardTitle>
            <CardDescription>
              Choose which company operations should get your attention.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleRow
              label="Email notifications"
              note="General SEZA Admin updates"
              checked={profile.emailNotifications}
              onCheckedChange={(value) => setProfile((p) => ({ ...p, emailNotifications: value }))}
            />
            <ToggleRow
              label="Urgent support alerts"
              note="Urgent merchant problems and store-down reports"
              checked={profile.urgentCaseNotifications}
              onCheckedChange={(value) =>
                setProfile((p) => ({ ...p, urgentCaseNotifications: value }))
              }
            />
            <ToggleRow
              label="Live chat alerts"
              note="New owner or cashier messages"
              checked={profile.liveChatNotifications}
              onCheckedChange={(value) =>
                setProfile((p) => ({ ...p, liveChatNotifications: value }))
              }
            />
            <Button onClick={updateProfile} disabled={busy}>
              Save notification preferences
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5" /> Security and sessions
          </CardTitle>
          <CardDescription>Changes apply to the isolated SEZA Admin login.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="New Admin password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters"
              />
            </Field>
            <Button onClick={updatePassword} disabled={busy || !password}>
              Update password
            </Button>
          </div>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="font-medium">Active sessions</div>
            <p className="text-sm text-muted-foreground">
              Use session revocation after a shared computer, lost device, or suspicious login.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={revokeOtherSessions} disabled={busy}>
                Sign out other devices
              </Button>
              <Button variant="destructive" onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out here
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> SEZA platform configuration
          </CardTitle>
          <CardDescription>
            {data.is_founder
              ? "Founder-only production settings. Every change requires a reason and is audited."
              : "Read-only. Only admin@sezapos.com can change company-wide settings."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <fieldset disabled={!data.is_founder || busy} className="space-y-5 disabled:opacity-70">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Company name">
                <Input
                  value={platform.companyName}
                  onChange={(e) => setPlatform((p) => ({ ...p, companyName: e.target.value }))}
                />
              </Field>
              <Field label="Support email">
                <Input
                  type="email"
                  value={platform.supportEmail}
                  onChange={(e) => setPlatform((p) => ({ ...p, supportEmail: e.target.value }))}
                />
              </Field>
              <Field label="Billing email">
                <Input
                  type="email"
                  value={platform.billingEmail}
                  onChange={(e) => setPlatform((p) => ({ ...p, billingEmail: e.target.value }))}
                />
              </Field>
              <Field label="Incident email">
                <Input
                  type="email"
                  value={platform.incidentEmail}
                  onChange={(e) => setPlatform((p) => ({ ...p, incidentEmail: e.target.value }))}
                />
              </Field>
              <Field label="Platform timezone">
                <Input
                  value={platform.timezone}
                  onChange={(e) => setPlatform((p) => ({ ...p, timezone: e.target.value }))}
                />
              </Field>
              <Field label="Default trial days">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={platform.defaultTrialDays}
                  onChange={(e) =>
                    setPlatform((p) => ({ ...p, defaultTrialDays: Number(e.target.value) }))
                  }
                />
              </Field>
              <Field label="Support SLA (minutes)">
                <Input
                  type="number"
                  min={5}
                  value={platform.supportSlaMinutes}
                  onChange={(e) =>
                    setPlatform((p) => ({ ...p, supportSlaMinutes: Number(e.target.value) }))
                  }
                />
              </Field>
            </div>

            <Separator />

            <div className="grid gap-4 lg:grid-cols-2">
              <ToggleRow
                label="Live merchant chat enabled"
                note="Allows Android register users to chat with SEZA Admin"
                checked={platform.liveChatEnabled}
                onCheckedChange={(value) => setPlatform((p) => ({ ...p, liveChatEnabled: value }))}
              />
              <ToggleRow
                label="Maintenance mode"
                note="Use only during a controlled platform outage"
                checked={platform.maintenanceMode}
                onCheckedChange={(value) => setPlatform((p) => ({ ...p, maintenanceMode: value }))}
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="Maintenance message">
                <Textarea
                  rows={3}
                  value={platform.maintenanceMessage}
                  onChange={(e) =>
                    setPlatform((p) => ({ ...p, maintenanceMessage: e.target.value }))
                  }
                />
              </Field>
              <Field label="Merchant dashboard banner">
                <Textarea
                  rows={3}
                  value={platform.merchantBanner}
                  onChange={(e) => setPlatform((p) => ({ ...p, merchantBanner: e.target.value }))}
                />
              </Field>
            </div>
            {data.is_founder && (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <Field label="Reason for changing production settings">
                  <Textarea
                    rows={2}
                    value={platform.reason}
                    onChange={(e) => setPlatform((p) => ({ ...p, reason: e.target.value }))}
                  />
                </Field>
                <Button onClick={updatePlatform} disabled={busy}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Save audited platform settings
                </Button>
              </div>
            )}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Platform information
          </CardTitle>
          <CardDescription>Live configuration checks for the Admin team.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <HealthRow
            label="Database"
            ok={!!health?.database?.ok}
            note={
              health?.database?.ok
                ? `Reachable in ${health.database.latency_ms ?? " - "} ms`
                : ((health as any)?.database?.error ?? "Unavailable")
            }
          />
          <HealthRow
            label="Supabase server"
            ok={!!health?.supabase?.configured}
            note={
              health?.supabase?.configured
                ? "Server configuration present"
                : "Missing required variable"
            }
          />
          <HealthRow
            label="Stripe sandbox"
            ok={
              !!health?.stripe_sandbox?.configured && !!health?.stripe_sandbox?.webhook_configured
            }
            note={`${health?.stripe_sandbox?.configured ? "API ready" : "API missing"} · ${health?.stripe_sandbox?.webhook_configured ? "webhook ready" : "webhook missing"}`}
          />
          <HealthRow
            label="Stripe live"
            ok={!!health?.stripe_live?.configured && !!health?.stripe_live?.webhook_configured}
            note={`${health?.stripe_live?.configured ? "API ready" : "API missing"} · ${health?.stripe_live?.webhook_configured ? "webhook ready" : "webhook missing"}`}
          />
          <HealthRow
            label="Email service"
            ok={!!health?.email?.configured}
            note={health?.email?.configured ? "Send service ready" : "Configuration missing"}
          />
          <div className="rounded-lg border p-3 text-sm">
            <div className="text-xs text-muted-foreground">Application version</div>
            <div className="font-mono">{health?.app_version ?? " - "}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Checked{" "}
              {health?.checked_at ? new Date(health.checked_at).toLocaleTimeString() : " - "}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  note,
  checked,
  onCheckedChange,
}: {
  label: string;
  note: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function HealthRow({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
        <span className="font-medium">{label}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}
