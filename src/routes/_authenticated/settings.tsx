import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Loader2, Store, Users, Shield, CreditCard, Printer, Scan, Camera,
  DollarSign, Monitor, Package, Truck, Heart, Percent, RotateCcw,
  Wallet, BarChart3, Bell, Lock, HardDrive, Plug, Palette, Info, ScrollText, ShieldAlert, Receipt as ReceiptIcon,
  Zap, ClipboardList, Clock, FileSearch, Banknote, KeyRound, UserCog, LifeBuoy, ExternalLink, MessageSquare, Languages, Building2,
  ChevronRight,
} from "lucide-react";
import { BillingPanel } from "@/components/settings/BillingPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { RolePermissionsPanel } from "@/components/settings/RolePermissionsPanel";
import { AuditLogPanel } from "@/components/settings/AuditLogPanel";
import { HardwareCard } from "@/components/settings/HardwareCard";
import { logAudit } from "@/lib/audit-log";
import { getActiveProvider } from "@/lib/pos/payment-terminal";
import { PaymentTerminalsPanel } from "@/components/settings/PaymentTerminalsPanel";
import { SmsSettingsPanel } from "@/components/settings/SmsSettingsPanel";
import { useServerFn } from "@tanstack/react-start";
import { setMyPin } from "@/lib/employees.functions";
import {
  loadAgeSettings, saveAgeSettings, AGE_CATEGORIES, DEFAULT_AGE_SETTINGS,
  type AgeVerificationSettings,
} from "@/lib/age-verification";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — SEZA POS" }, { name: "description", content: "Store administration, hardware setup, inventory preferences, and billing." }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    section: typeof search.section === "string" ? search.section : undefined,
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
  }),
  component: SettingsPage,
});

type Section = { id: string; label: string; icon: React.ComponentType<{ className?: string }>; href?: string };
type Group = { id: string; label: string; items: Section[] };

const GROUPS: Group[] = [
  {
    id: "mode",
    label: "Mode",
    items: [
      { id: "mode_quickorder", label: "Quick Order", icon: Zap, href: "/pos" },
      { id: "mode_retail", label: "Retail Mode", icon: Store, href: "/pos" },
      { id: "terminal", label: "Payment Terminal", icon: CreditCard },
      { id: "mode_pending", label: "Pending Orders", icon: ClipboardList, href: "/sales" },
    ],
  },
  {
    id: "manager",
    label: "Manager Activities",
    items: [
      { id: "mgr_shifts", label: "Review Employee Shifts", icon: Clock, href: "/shifts" },
      { id: "mgr_timecards", label: "Review Time Cards", icon: Clock, href: "/timeclock" },
      { id: "mgr_close", label: "Close Out Day", icon: Wallet, href: "/register" },
      { id: "mgr_service", label: "Service Reports", icon: BarChart3, href: "/reports" },
      { id: "mgr_find_sales", label: "Find Sales", icon: FileSearch, href: "/sales" },
      { id: "mgr_find_refunds", label: "Find Refunds", icon: RotateCcw, href: "/refunds" },
    ],
  },
  {
    id: "cash",
    label: "Cash Management",
    items: [
      { id: "cash_drawers", label: "Cash Drawers", icon: DollarSign },
      { id: "register", label: "Cash Payouts & Deposits", icon: Banknote },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      { id: "reports_sales", label: "Sales Reports", icon: BarChart3, href: "/reports" },
      { id: "reports_menu", label: "Menu / Product Reports", icon: Package, href: "/products" },
      { id: "reports_labor", label: "Labor Reports", icon: Users, href: "/payroll" },
      { id: "reports", label: "Report Preferences", icon: BarChart3 },
    ],
  },
  {
    id: "account",
    label: "My Account",
    items: [
      { id: "account_preshift", label: "Pre-Shift Notes", icon: ClipboardList, href: "/shifts" },
      { id: "account_review", label: "Shift Review", icon: FileSearch, href: "/shifts" },
      { id: "account_timeclock", label: "Time Clock", icon: Clock, href: "/timeclock" },
      { id: "account_pin", label: "Change PIN", icon: KeyRound },
      { id: "account_password", label: "Change Password", icon: Lock },
      { id: "account_profile", label: "Update Profile", icon: UserCog },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    items: [
      { id: "general", label: "Store Information", icon: Building2 },
      { id: "employees", label: "Labor / Employees", icon: Users },
      { id: "roles", label: "Roles & Permissions", icon: Shield },
      { id: "inventory", label: "Menu / Inventory", icon: Package },
      { id: "suppliers", label: "Suppliers", icon: Truck },
      { id: "customers", label: "Loyalty", icon: Heart },
      { id: "discounts", label: "Discounts", icon: Percent },
      { id: "refunds", label: "Refunds", icon: RotateCcw },
      { id: "printer", label: "Printer Setup", icon: Printer },
      { id: "scanner", label: "Barcode Scanner", icon: Scan },
      { id: "camera", label: "Camera Scanner", icon: Camera },
      { id: "drawer", label: "Cash Drawer Setup", icon: DollarSign },
      { id: "display", label: "Customer Display", icon: Monitor },
      { id: "setup_receipt", label: "Receipt Setup", icon: ReceiptIcon },
      { id: "setup_email", label: "Email Setup", icon: MessageSquare },
      { id: "setup_sms", label: "SMS Setup", icon: MessageSquare },
      { id: "setup_tax", label: "Tax Setup", icon: Percent },
      { id: "age", label: "Age Verification", icon: ShieldAlert },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "security", label: "Security", icon: Lock },
      { id: "appearance", label: "Appearance & Language", icon: Palette },
      { id: "integrations", label: "Integrations", icon: Plug },
      { id: "backup", label: "Backup", icon: HardDrive },
      { id: "billing", label: "Billing", icon: ReceiptIcon },
      { id: "audit", label: "Audit Log", icon: ScrollText },
    ],
  },
  {
    id: "support",
    label: "Support",
    items: [
      { id: "support_contact", label: "Contact Support", icon: LifeBuoy },
      { id: "support_website", label: "Support Website", icon: ExternalLink },
      { id: "support_status", label: "System Status", icon: Zap },
      { id: "support_releases", label: "Release Notes", icon: ScrollText },
      { id: "support_terms", label: "Terms of Service", icon: ScrollText, href: "/terms" },
      { id: "support_privacy", label: "Privacy Policy", icon: ScrollText, href: "/privacy" },
      { id: "about", label: "About", icon: Info },
    ],
  },
];

function SettingsPage() {
  const search = Route.useSearch();
  const [tab, setTab] = useState(search.section ?? "general");
  useEffect(() => {
    if (search.section && search.section !== tab) setTab(search.section);
    if (search.checkout === "success") {
      toast.success("Subscription updated — welcome aboard!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.section, search.checkout]);
  const { has, isSuper } = usePermissions();
  const canEditSettings = isSuper || has("settings.edit");
  const canEditRoles = isSuper;

  return (
    <>
      <PageHeader title="Settings" subtitle="Modes, hardware, staff, cash, reports, and account" />
      <div className="flex-1 overflow-hidden flex min-h-0">
        <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="flex flex-1 min-h-0">
          <aside className="w-64 border-r bg-surface/40 overflow-y-auto shrink-0">
            <TabsList className="flex flex-col h-auto items-stretch bg-transparent p-2 gap-0.5">
              {GROUPS.map((g) => (
                <div key={g.id} className="mb-2">
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </div>
                  {g.items.map((s) => s.href ? (
                    <Link
                      key={s.id}
                      to={s.href}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <s.icon className="size-4 shrink-0" />
                      <span className="flex-1">{s.label}</span>
                      <ChevronRight className="size-3 opacity-50" />
                    </Link>
                  ) : (
                    <TabsTrigger
                      key={s.id}
                      value={s.id}
                      className="justify-start gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      <s.icon className="size-4 shrink-0" />
                      <span className="text-sm text-left flex-1">{s.label}</span>
                    </TabsTrigger>
                  ))}
                </div>
              ))}
            </TabsList>
          </aside>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <TabsContent value="general" className="mt-0"><GeneralPanel canEdit={canEditSettings} /></TabsContent>
            <TabsContent value="billing" className="mt-0"><BillingPanel /></TabsContent>
            <TabsContent value="employees" className="mt-0"><EmployeesPanel /></TabsContent>
            <TabsContent value="roles" className="mt-0"><RolePermissionsPanel canEdit={canEditRoles} /></TabsContent>
            <TabsContent value="terminal" className="mt-0"><TerminalPanel /></TabsContent>
            <TabsContent value="printer" className="mt-0">
              <HardwareCard kind="printer" title="Receipt Printer" description="Connect a thermal receipt printer via USB, Bluetooth, or Serial." transports={["usb", "bluetooth", "serial"]} />
              <ReceiptPreferences />
            </TabsContent>
            <TabsContent value="setup_receipt" className="mt-0"><ReceiptPreferences /></TabsContent>
            <TabsContent value="scanner" className="mt-0">
              <HardwareCard kind="scanner" title="Barcode Scanner" description="USB or Bluetooth HID scanner. Most keyboard-emulating scanners work automatically without pairing." transports={["usb", "bluetooth", "hid"]} />
              <ScannerPreferences />
            </TabsContent>
            <TabsContent value="camera" className="mt-0"><CameraPanel /></TabsContent>
            <TabsContent value="drawer" className="mt-0">
              <HardwareCard kind="drawer" title="Cash Drawer" description="Serial or USB cash drawer. Opens automatically after cash payments." transports={["usb", "serial"]} />
            </TabsContent>
            <TabsContent value="cash_drawers" className="mt-0">
              <HardwareCard kind="drawer" title="Cash Drawers" description="Connected cash drawers for this terminal." transports={["usb", "serial"]} />
            </TabsContent>
            <TabsContent value="display" className="mt-0"><CustomerDisplayPanel /></TabsContent>
            <TabsContent value="inventory" className="mt-0"><PrefPanel prefKey="inventory" title="Menu & Inventory" desc="Low stock alerts, auto-reorder, expiration, and tracking preferences." fields={[
              { k: "low_stock_threshold", label: "Low stock threshold", type: "number", default: "5" },
              { k: "auto_reorder", label: "Enable auto-reorder suggestions", type: "switch", default: "true" },
              { k: "expiration_alerts", label: "Expiration alerts", type: "switch", default: "false" },
              { k: "lot_tracking", label: "Lot tracking", type: "switch", default: "false" },
              { k: "waste_tracking", label: "Waste tracking", type: "switch", default: "false" },
            ]} /></TabsContent>
            <TabsContent value="suppliers" className="mt-0"><ComingSoon title="Suppliers" desc="Supplier profiles, purchase orders, and automatic reordering." /></TabsContent>
            <TabsContent value="customers" className="mt-0"><PrefPanel prefKey="customers" title="Loyalty & customers" desc="Loyalty program and reward defaults." fields={[
              { k: "loyalty_enabled", label: "Enable loyalty program", type: "switch", default: "false" },
              { k: "points_per_dollar", label: "Points per dollar", type: "number", default: "1" },
              { k: "birthday_reward", label: "Birthday reward ($)", type: "number", default: "5" },
            ]} /></TabsContent>
            <TabsContent value="discounts" className="mt-0"><PrefPanel prefKey="discounts" title="Discounts" desc="Discount limits and approval thresholds." fields={[
              { k: "cashier_max_pct", label: "Cashier max discount (%)", type: "number", default: "10" },
              { k: "manager_approval_pct", label: "Manager approval required above (%)", type: "number", default: "15" },
              { k: "employee_discount_pct", label: "Employee discount (%)", type: "number", default: "20" },
            ]} /></TabsContent>
            <TabsContent value="refunds" className="mt-0"><PrefPanel prefKey="refunds" title="Refunds" desc="Refund reasons, approvals, and limits." fields={[
              { k: "manager_approval", label: "Require manager approval for refunds", type: "switch", default: "true" },
              { k: "auto_restock", label: "Automatically restock refunded items", type: "switch", default: "true" },
              { k: "max_refund_days", label: "Max refund window (days)", type: "number", default: "30" },
              { k: "reasons", label: "Refund reasons (comma separated)", type: "text", default: "Defective, Wrong item, Customer changed mind, Duplicate charge" },
            ]} /></TabsContent>
            <TabsContent value="register" className="mt-0"><PrefPanel prefKey="register" title="Cash payouts, deposits & register" desc="Cash drawer float, payouts, deposits, and close-of-day rules." fields={[
              { k: "default_float", label: "Starting float ($)", type: "number", default: "100" },
              { k: "require_close_reason", label: "Require reason if cash differs", type: "switch", default: "true" },
              { k: "over_short_alert", label: "Alert threshold ($)", type: "number", default: "5" },
              { k: "allow_payouts", label: "Allow cash payouts", type: "switch", default: "true" },
              { k: "allow_deposits", label: "Allow mid-shift deposits", type: "switch", default: "true" },
            ]} /></TabsContent>
            <TabsContent value="reports" className="mt-0"><PrefPanel prefKey="reports" title="Reports" desc="Default report windows and export preferences." fields={[
              { k: "default_range", label: "Default range (days)", type: "number", default: "7" },
              { k: "email_daily_summary", label: "Email daily summary", type: "switch", default: "false" },
              { k: "summary_recipients", label: "Summary recipients (comma separated emails)", type: "text", default: "" },
            ]} /></TabsContent>
            <TabsContent value="notifications" className="mt-0"><PrefPanel prefKey="notifications" title="Notifications" desc="Toggle which events trigger notifications." fields={[
              { k: "low_stock", label: "Low stock", type: "switch", default: "true" },
              { k: "refund_alerts", label: "Refund alerts", type: "switch", default: "true" },
              { k: "failed_payments", label: "Failed payments", type: "switch", default: "true" },
              { k: "terminal_offline", label: "Terminal offline", type: "switch", default: "true" },
              { k: "printer_offline", label: "Printer offline", type: "switch", default: "true" },
              { k: "employee_login", label: "Employee login alerts", type: "switch", default: "false" },
            ]} /></TabsContent>
            <TabsContent value="security" className="mt-0"><PrefPanel prefKey="security" title="Security" desc="PIN, password, and session policies." fields={[
              { k: "session_minutes", label: "Session timeout (minutes)", type: "number", default: "480" },
              { k: "pin_length", label: "PIN length", type: "number", default: "6" },
              { k: "password_min_length", label: "Password min length", type: "number", default: "8" },
              { k: "failed_login_lockout", label: "Lockout after N failed logins", type: "number", default: "5" },
              { k: "require_2fa_managers", label: "Require 2FA for managers/owners", type: "switch", default: "false" },
            ]} /></TabsContent>
            <TabsContent value="age" className="mt-0"><AgeVerificationPanel /></TabsContent>
            <TabsContent value="audit" className="mt-0"><AuditLogPanel /></TabsContent>
            <TabsContent value="backup" className="mt-0"><BackupPanel /></TabsContent>
            <TabsContent value="integrations" className="mt-0"><IntegrationsPanel /></TabsContent>
            <TabsContent value="appearance" className="mt-0"><AppearancePanel /></TabsContent>
            <TabsContent value="about" className="mt-0"><AboutPanel /></TabsContent>
            <TabsContent value="setup_email" className="mt-0"><EmailSetupPanel /></TabsContent>
            <TabsContent value="setup_sms" className="mt-0"><SmsSetupPanel /></TabsContent>
            <TabsContent value="setup_tax" className="mt-0"><TaxSetupPanel /></TabsContent>
            <TabsContent value="account_pin" className="mt-0"><ChangePinPanel /></TabsContent>
            <TabsContent value="account_password" className="mt-0"><ChangePasswordPanel /></TabsContent>
            <TabsContent value="account_profile" className="mt-0"><ProfilePanel /></TabsContent>
            <TabsContent value="support_contact" className="mt-0"><SupportPanel kind="contact" /></TabsContent>
            <TabsContent value="support_website" className="mt-0"><SupportPanel kind="website" /></TabsContent>
            <TabsContent value="support_status" className="mt-0"><SupportPanel kind="status" /></TabsContent>
            <TabsContent value="support_releases" className="mt-0"><SupportPanel kind="releases" /></TabsContent>
          </div>
        </Tabs>
      </div>
    </>
  );
}

/* ================= Account & Setup add-on panels ================= */

function ChangePinPanel() {
  const setPin = useServerFn(setMyPin);
  const [pin, setPinVal] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!/^\d{6}$/.test(pin)) return toast.error("PIN must be exactly 6 digits");
    if (pin !== confirm) return toast.error("PINs do not match");
    setBusy(true);
    try {
      await setPin({ data: { pin } });
      toast.success("PIN updated");
      setPinVal(""); setConfirm("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(false); }
  };
  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle>Change PIN</CardTitle><CardDescription>Your 6-digit quick sign-in PIN.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2"><Label>New PIN</Label><Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPinVal(e.target.value.replace(/\D/g, ""))} /></div>
        <div className="space-y-2"><Label>Confirm PIN</Label><Input type="password" inputMode="numeric" maxLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} /></div>
        <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin mr-2" />}Update PIN</Button>
      </CardContent>
    </Card>
  );
}

function ChangePasswordPanel() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated"); setPw(""); setConfirm("");
  };
  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle>Change Password</CardTitle><CardDescription>Used for email sign-in and account recovery.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2"><Label>New password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} /></div>
        <div className="space-y-2"><Label>Confirm password</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} /></div>
        <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin mr-2" />}Update password</Button>
      </CardContent>
    </Card>
  );
}

function ProfilePanel() {
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      return data;
    },
  });
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (profile) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = profile as any;
      setForm({ first_name: p.first_name ?? "", last_name: p.last_name ?? "", phone: p.phone ?? "" });
    }
  }, [profile]);
  const save = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = profile as any;
    if (!p?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from as any)("profiles").update({
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      full_name: `${form.first_name ?? ""} ${form.last_name ?? ""}`.trim() || null,
      phone: form.phone || null,
    }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["me-profile"] });
  };
  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle>Update Profile</CardTitle><CardDescription>Your name and phone number.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2"><Label>First name</Label><Input value={form.first_name ?? ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
        <div className="space-y-2"><Label>Last name</Label><Input value={form.last_name ?? ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
        <div className="space-y-2"><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <Button onClick={save}>Save profile</Button>
      </CardContent>
    </Card>
  );
}

function EmailSetupPanel() {
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Email Setup</CardTitle><CardDescription>Transactional and receipt emails are sent through Lovable Cloud.</CardDescription></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-md border p-3 flex items-center justify-between">
          <span>Delivery status</span>
          <Badge variant="outline" className="bg-success/15 text-success border-success/30">Active</Badge>
        </div>
        <p className="text-muted-foreground">To customize the sender domain (e.g. notify.yourdomain.com), open the Email domain settings from the Backend view.</p>
      </CardContent>
    </Card>
  );
}

function SmsSetupPanel() {
  return <SmsSettingsPanel />;
}

function TaxSetupPanel() {
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Tax Setup</CardTitle><CardDescription>The store-wide tax rate is configured under Store Information.</CardDescription></CardHeader>
      <CardContent><Button asChild variant="outline"><Link to="/settings" search={{ section: "general" }}>Open Store Information</Link></Button></CardContent>
    </Card>
  );
}

function SupportPanel({ kind }: { kind: "contact" | "website" | "status" | "releases" }) {
  const map = {
    contact: { title: "Contact Support", desc: "We're here to help.", body: <p>Email <a className="text-primary hover:underline" href="mailto:support@sezapos.com">support@sezapos.com</a> — most requests are answered within one business day.</p> },
    website: { title: "Support Website", desc: "Docs, guides, and how-tos.", body: <Button asChild><a href="https://sezapos.com/support" target="_blank" rel="noreferrer">Open support site <ExternalLink className="size-4 ml-2" /></a></Button> },
    status: { title: "System Status", desc: "Live service health.", body: <Button asChild><a href="https://status.sezapos.com" target="_blank" rel="noreferrer">Open status page <ExternalLink className="size-4 ml-2" /></a></Button> },
    releases: { title: "Release Notes", desc: "Latest updates and improvements.", body: <p className="text-sm text-muted-foreground">Version 1.0.0 — initial commercial release. Full change log available on the support site.</p> },
  }[kind];
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><LifeBuoy className="size-5" />{map.title}</CardTitle><CardDescription>{map.desc}</CardDescription></CardHeader>
      <CardContent className="text-sm">{map.body}</CardContent>
    </Card>
  );
}


/* ================= General ================= */

function GeneralPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () => (await supabase.from("stores").select("*").limit(1).maybeSingle()).data,
  });

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (store) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = store as any;
      setForm({
        name: s.name ?? "", business_type: s.business_type ?? "", address: s.address ?? "",
        city: s.city ?? "", state: s.state ?? "", zip: s.zip ?? "", country: s.country ?? "US",
        phone: s.phone ?? "", email: s.email ?? "", website: s.website ?? "",
        tax_id: s.tax_id ?? "", tax_rate: String(s.tax_rate ?? "0.0825"),
        currency: s.currency ?? "USD", language: s.language ?? "en",
        time_zone: s.time_zone ?? "America/New_York", date_format: s.date_format ?? "MM/DD/YYYY",
        logo_url: s.logo_url ?? "",
      });
    }
  }, [store]);

  const save = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!store) return;
      const patch: Record<string, unknown> = {
        name: form.name, business_type: form.business_type || null, address: form.address || null,
        city: form.city || null, state: form.state || null, zip: form.zip || null,
        country: form.country || null, phone: form.phone || null, email: form.email || null,
        website: form.website || null, tax_id: form.tax_id || null, tax_rate: Number(form.tax_rate),
        currency: form.currency, language: form.language, time_zone: form.time_zone,
        date_format: form.date_format, logo_url: form.logo_url || null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)("stores").update(patch).eq("id", (store as any).id);
      if (error) throw error;
      void logAudit({ action: "settings.update", entity: "store", details: { section: "general" } });
    },
    onSuccess: () => { toast.success("Store settings saved"); qc.invalidateQueries({ queryKey: ["store"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const F = ({ k, label, type = "text", cols = 1 }: { k: string; label: string; type?: string; cols?: number }) => (
    <div className={`space-y-2 ${cols === 2 ? "col-span-2" : ""}`}>
      <Label>{label}</Label>
      <Input type={type} disabled={!canEdit} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>Business identity, contact, and locale. Shown on receipts and reports.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <F k="name" label="Store name" />
          <F k="business_type" label="Business type" />
          <F k="address" label="Street address" cols={2} />
          <F k="city" label="City" />
          <F k="state" label="State / Region" />
          <F k="zip" label="ZIP / Postal code" />
          <F k="country" label="Country" />
          <F k="phone" label="Phone" />
          <F k="email" label="Email" type="email" />
          <F k="website" label="Website" />
          <F k="tax_id" label="Tax ID / EIN" />
          <F k="tax_rate" label="Tax rate (decimal, e.g. 0.0825)" type="number" />
          <F k="currency" label="Currency" />
          <F k="language" label="Language" />
          <F k="time_zone" label="Time zone" />
          <F k="date_format" label="Date format" />
          <F k="logo_url" label="Store logo URL" cols={2} />
        </div>
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button onClick={() => save.mutate()} disabled={!canEdit || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Save general settings
          </Button>
          <Button variant="outline" asChild disabled={!canEdit}>
            <a href="/setup">Run Setup Wizard Again</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================= Employees (redirect card) ================= */

function EmployeesPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Employees</CardTitle>
        <CardDescription>Employee onboarding, quick-login, PINs, and profiles live in the Employees section.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild><a href="/employees">Open Employees</a></Button>
      </CardContent>
    </Card>
  );
}

/* ================= Terminal ================= */

function TerminalPanel() {
  const provider = getActiveProvider();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Payment Terminal</span>
            {provider ? (
              <Badge className="bg-success/15 text-success border-success/30" variant="outline">Connected</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Not connected</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Card, tap, and mobile-wallet payments require a connected certified terminal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {provider ? (
            <div className="rounded-md border p-3 text-sm space-y-1 bg-surface/40">
              <div><span className="text-muted-foreground">Provider:</span> {provider.name} <span className="text-xs text-muted-foreground">({provider.id})</span></div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No payment terminal is connected. Card payments are blocked until a provider is registered at boot.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <ProviderCard name="Stripe Terminal" desc="Reader-based EMV, tap, and wallet." status="planned" />
            <ProviderCard name="Square" desc="Square Terminal & Reader SDK." status="planned" />
            <ProviderCard name="Clover" desc="Clover devices via Clover SDK." status="planned" />
            <ProviderCard name="Custom / Future" desc="Register a provider via registerProvider()." status="ready" />
          </div>
        </CardContent>
      </Card>

      <PaymentTerminalsPanel canEdit={true} />

      <HardwareCard
        kind="terminal"
        title="Hardware transport"
        description="For non-cloud terminals connected directly (Serial, USB HID, Bluetooth)."
        transports={["usb", "bluetooth", "serial", "hid"]}
      />
    </div>
  );
}

function ProviderCard({ name, desc, status }: { name: string; desc: string; status: "planned" | "ready" }) {
  return (
    <div className="rounded-md border p-3 space-y-1">
      <div className="flex items-center justify-between">
        <div className="font-medium">{name}</div>
        <Badge variant="outline" className="text-xs">{status === "ready" ? "Ready to register" : "Coming soon"}</Badge>
      </div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </div>
  );
}

/* ================= Simple pref panel ================= */

type Field = { k: string; label: string; type: "text" | "number" | "switch"; default: string };

function PrefPanel({ prefKey, title, desc, fields }: { prefKey: string; title: string; desc: string; fields: Field[] }) {
  const storageKey = `pos.prefs.${prefKey}`;
  const [state, setState] = useState<Record<string, string>>(() => {
    try { return { ...Object.fromEntries(fields.map((f) => [f.k, f.default])), ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") }; }
    catch { return Object.fromEntries(fields.map((f) => [f.k, f.default])); }
  });
  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify(state));
    void logAudit({ action: "settings.update", entity: prefKey, details: { keys: Object.keys(state) } });
    toast.success(`${title} saved`);
  };
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {fields.map((f) => (
          <div key={f.k} className={f.type === "switch" ? "flex items-center justify-between gap-4" : "space-y-2"}>
            <Label className={f.type === "switch" ? "flex-1" : ""}>{f.label}</Label>
            {f.type === "switch" ? (
              <Switch checked={state[f.k] === "true"} onCheckedChange={(v) => setState({ ...state, [f.k]: v ? "true" : "false" })} />
            ) : (
              <Input type={f.type} value={state[f.k] ?? ""} onChange={(e) => setState({ ...state, [f.k]: e.target.value })} />
            )}
          </div>
        ))}
        <Button onClick={save}>Save {title.toLowerCase()}</Button>
      </CardContent>
    </Card>
  );
}

/* ================= Receipt / Scanner / Camera / Display ================= */

function ReceiptPreferences() {
  return <PrefPanel prefKey="receipt" title="Receipt preferences" desc="Format, footer, and delivery." fields={[
    { k: "width_mm", label: "Receipt width (58 or 80 mm)", type: "number", default: "80" },
    { k: "auto_print", label: "Auto-print after sale", type: "switch", default: "true" },
    { k: "show_logo", label: "Show store logo", type: "switch", default: "true" },
    { k: "footer", label: "Footer message", type: "text", default: "Thank you for your business!" },
    { k: "return_policy", label: "Return policy line", type: "text", default: "Returns within 30 days with receipt." },
    { k: "qr_code", label: "Include QR code", type: "switch", default: "false" },
    { k: "email_receipt", label: "Offer email receipt", type: "switch", default: "true" },
    { k: "sms_receipt", label: "Offer SMS receipt", type: "switch", default: "false" },
  ]} />;
}

function ScannerPreferences() {
  return <PrefPanel prefKey="scanner" title="Scanner behavior" desc="How scans are processed at the POS." fields={[
    { k: "auto_add", label: "Auto-add product on scan", type: "switch", default: "true" },
    { k: "beep", label: "Play sound on scan", type: "switch", default: "true" },
    { k: "continuous", label: "Continuous scan mode", type: "switch", default: "false" },
  ]} />;
}

function CameraPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Camera scanner</CardTitle><CardDescription>Uses the device camera to scan UPC / EAN / QR / Code128 barcodes. Requires HTTPS and camera permission.</CardDescription></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Open the POS or a product form and press the camera button next to the barcode field.</p></CardContent>
      </Card>
      <PrefPanel prefKey="camera" title="Camera behavior" desc="How camera scans are processed." fields={[
        { k: "auto_close", label: "Auto-close after successful scan", type: "switch", default: "true" },
        { k: "lookup_online", label: "Auto-lookup unknown barcodes online", type: "switch", default: "true" },
        { k: "beep", label: "Play sound on scan", type: "switch", default: "true" },
      ]} />
    </div>
  );
}

function CustomerDisplayPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Customer display</CardTitle><CardDescription>Second-screen or tablet display for customers to see the cart, tax, and total.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => window.open("/customer-display", "customer-display", "width=800,height=600")}>Open customer display window</Button>
          <p className="text-xs text-muted-foreground">Tip: drag the window onto your second monitor and press F11 for fullscreen.</p>
        </CardContent>
      </Card>
      <PrefPanel prefKey="display" title="Display preferences" desc="What to show on the customer display." fields={[
        { k: "show_items", label: "Show items", type: "switch", default: "true" },
        { k: "show_tax", label: "Show tax breakdown", type: "switch", default: "true" },
        { k: "show_thank_you", label: "Show 'Thank you' screen after sale", type: "switch", default: "true" },
      ]} />
    </div>
  );
}

/* ================= Backup / Integrations / Appearance / About ================= */

function BackupPanel() {
  const doExport = async () => {
    const [stores, products, categories, sales, sale_items, refunds, refund_items] = await Promise.all([
      supabase.from("stores").select("*"), supabase.from("products").select("*"),
      supabase.from("categories").select("*"), supabase.from("sales").select("*"),
      supabase.from("sale_items").select("*"), supabase.from("refunds").select("*"),
      supabase.from("refund_items").select("*"),
    ]);
    const dump = { exported_at: new Date().toISOString(), stores: stores.data, products: products.data, categories: categories.data, sales: sales.data, sale_items: sale_items.data, refunds: refunds.data, refund_items: refund_items.data };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `pos-backup-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
    void logAudit({ action: "settings.update", entity: "backup", details: { type: "manual_export" } });
  };
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Backup</CardTitle><CardDescription>Cloud backup runs automatically. Export a local JSON snapshot any time.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border p-3 text-sm bg-surface/40">
          <div className="flex justify-between"><span className="text-muted-foreground">Cloud backup</span><Badge variant="outline" className="bg-success/15 text-success border-success/30">Active</Badge></div>
          <div className="flex justify-between mt-1"><span className="text-muted-foreground">Retention</span><span>30 days</span></div>
        </div>
        <Button onClick={doExport}>Download manual backup</Button>
      </CardContent>
    </Card>
  );
}

function IntegrationsPanel() {
  const rows = [
    { name: "Stripe", desc: "Payments and terminal", status: "Not connected" },
    { name: "Square", desc: "Payments and terminal", status: "Not connected" },
    { name: "Clover", desc: "Payments and terminal", status: "Not connected" },
    { name: "QuickBooks", desc: "Accounting sync", status: "Not connected" },
    { name: "Xero", desc: "Accounting sync", status: "Not connected" },
    { name: "Mailgun", desc: "Email receipts", status: "Not connected" },
    { name: "Twilio", desc: "SMS receipts", status: "Not connected" },
    { name: "Webhooks", desc: "Push events to your own URL", status: "Not connected" },
  ];
  return (
    <Card>
      <CardHeader><CardTitle>Integrations</CardTitle><CardDescription>Payment, accounting, and messaging integrations.</CardDescription></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {rows.map((r) => (
            <div key={r.name} className="rounded-md border p-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.desc}</div>
              </div>
              <Badge variant="outline" className="text-xs">{r.status}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AppearancePanel() {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("pos.theme") ?? "system");
  const apply = (t: string) => {
    setTheme(t); localStorage.setItem("pos.theme", t);
    document.documentElement.classList.toggle("dark", t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches));
  };
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Theme and accessibility.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="flex-1">Theme</Label>
          {(["light", "dark", "system"] as const).map((t) => (
            <Button key={t} size="sm" variant={theme === t ? "default" : "outline"} onClick={() => apply(t)}>{t}</Button>
          ))}
        </div>
        <PrefPanelInline prefKey="appearance" fields={[
          { k: "compact", label: "Compact mode", type: "switch", default: "false" },
          { k: "touch_mode", label: "Touch mode (larger targets)", type: "switch", default: "false" },
          { k: "large_text", label: "Large text", type: "switch", default: "false" },
        ]} />
      </CardContent>
    </Card>
  );
}

function PrefPanelInline({ prefKey, fields }: { prefKey: string; fields: Field[] }) {
  const storageKey = `pos.prefs.${prefKey}`;
  const [state, setState] = useState<Record<string, string>>(() => {
    try { return { ...Object.fromEntries(fields.map((f) => [f.k, f.default])), ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") }; }
    catch { return Object.fromEntries(fields.map((f) => [f.k, f.default])); }
  });
  const save = (next: Record<string, string>) => { setState(next); localStorage.setItem(storageKey, JSON.stringify(next)); };
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.k} className="flex items-center justify-between gap-4">
          <Label className="flex-1">{f.label}</Label>
          <Switch checked={state[f.k] === "true"} onCheckedChange={(v) => save({ ...state, [f.k]: v ? "true" : "false" })} />
        </div>
      ))}
    </div>
  );
}

function AboutPanel() {
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>About</CardTitle><CardDescription>Software and support.</CardDescription></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row k="Software version" v="1.0.0" />
        <Row k="Build" v={new Date().toISOString().slice(0, 10)} />
        <Row k="License" v="Commercial" />
        <Row k="Support" v="support@example.com" />
      </CardContent>
    </Card>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between border-b py-2 last:border-b-0"><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>;
}

function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader>
      <CardContent><Badge variant="outline">Coming soon</Badge></CardContent>
    </Card>
  );
}

/* ================= Age Verification ================= */

function AgeVerificationPanel() {
  const [s, setS] = useState<AgeVerificationSettings>(() => loadAgeSettings());
  const update = <K extends keyof AgeVerificationSettings>(k: K, v: AgeVerificationSettings[K]) =>
    setS((cur) => ({ ...cur, [k]: v }));
  const setMinAge = (cat: string, v: number) =>
    setS((cur) => ({ ...cur, categoryMinAges: { ...cur.categoryMinAges, [cat]: v } }));

  const save = () => {
    saveAgeSettings(s);
    void logAudit({ action: "settings.update", entity: "age_verification", details: { enabled: s.enabled } });
    toast.success("Age verification settings saved");
  };
  const reset = () => setS(DEFAULT_AGE_SETTINGS);

  const idTypes = ["Driver's License", "State ID", "Passport", "Military ID", "Tribal ID", "Foreign Passport"];
  const toggleIdType = (label: string) => {
    const has = s.acceptedIdTypes.includes(label);
    update("acceptedIdTypes", has ? s.acceptedIdTypes.filter((x) => x !== label) : [...s.acceptedIdTypes, label]);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Age Verification</CardTitle>
          <CardDescription>
            Configure ID verification for age-restricted products. Rules apply globally at checkout; per-product age
            limits live on each product.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Enable age verification"
            desc="Pauses checkout when age-restricted products are in the cart until an ID is verified."
            checked={s.enabled}
            onChange={(v) => update("enabled", v)}
          />
          <ToggleRow
            label="Require ID scan for every restricted transaction"
            desc="If disabled, verification carries over within the same shift for the same customer profile."
            checked={s.requireIdEveryTime}
            onChange={(v) => update("requireIdEveryTime", v)}
          />
          <ToggleRow
            label="Allow manual date-of-birth entry"
            desc="Cashiers can type a DOB when a customer's ID cannot be scanned."
            checked={s.allowManualEntry}
            onChange={(v) => update("allowManualEntry", v)}
          />
          <ToggleRow
            label="Require manager approval for manual entry"
            desc="Manual DOB entry requires a manager PIN and is recorded in the audit log."
            checked={s.requireManagerForManual}
            onChange={(v) => update("requireManagerForManual", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Minimum age by category</CardTitle>
          <CardDescription>
            Local law prevails. Set the minimum legal age for each restricted category sold at this store.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {AGE_CATEGORIES.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 border rounded-md p-3">
                <Label className="flex-1">{c.label}</Label>
                <Input
                  type="number"
                  min={13}
                  max={99}
                  className="w-20"
                  value={s.categoryMinAges[c.id] ?? 21}
                  onChange={(e) => setMinAge(c.id, Number(e.target.value) || 21)}
                />
                <span className="text-xs text-muted-foreground w-6 text-right">+</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accepted ID types</CardTitle>
          <CardDescription>Only these documents may be used for verification at this location.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {idTypes.map((t) => (
            <button
              key={t}
              onClick={() => toggleIdType(t)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                s.acceptedIdTypes.includes(t)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy & retention</CardTitle>
          <CardDescription>
            Only masked identifiers (name initial, last 4 of the document number, DOB) are stored. Full ID numbers and
            addresses are never persisted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label className="flex-1">Audit log retention (days)</Label>
            <Input
              type="number"
              min={30}
              max={3650}
              className="w-28"
              value={s.retentionDays}
              onChange={(e) => update("retentionDays", Number(e.target.value) || 365)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={save}>Save age verification settings</Button>
        <Button variant="outline" onClick={reset}>Reset to defaults</Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
      <div className="flex-1">
        <Label className="font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
