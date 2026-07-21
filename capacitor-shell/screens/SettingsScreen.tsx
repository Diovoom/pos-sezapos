// POS-terminal Settings for the bundled Android shell.
//
// Intentionally scoped to what makes sense on a physical register:
//   Receipt, Printer, Cash Drawer, Barcode Scanner, Payment Terminal,
//   Device, Register, Shift, Employee PIN, Account, Sign Out.
//
// Store profile, taxes, billing, subscriptions, integrations, and
// analytics remain in the web dashboard (owner surface).
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Receipt, Printer, DollarSign, Scan, CreditCard, Monitor, ShoppingCart,
  Clock, KeyRound, User, LogOut, Loader2, Bluetooth, CheckCircle2, AlertTriangle,
  Activity, Wifi, Radio, LifeBuoy,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../supabase";
import { postAuthed } from "../api";
import {
  printerDrivers, terminalDrivers,
  getActivePrinter, setActivePrinter, getActiveTerminal, setActiveTerminal,
  suggestPreferredTerminal, type PrinterDriverId, type TerminalDriverId,
} from "@/lib/hardware";
import * as escposBle from "@/lib/hardware/escpos-ble";
import * as stripeTerminal from "@/lib/hardware/terminal-stripe";
import {
  testPrint as runTestPrint, testDrawer as runTestDrawer, hardwareSnapshot,
} from "@/lib/hardware/native-receipt";
import { loadScannerConfig } from "../lib/scannerConfig";
import { collectSupportDiagnostics } from "../support/diagnostics";
import { logAudit } from "@/lib/audit-log";


/* ------------------------------ device settings --------------------------- */

const LS = {
  device: "pos.device.label",
  paperWidth: "pos.receipt.paperWidth", // "58" | "80"
  autoPrint: "pos.receipt.autoPrint",
  copies: "pos.receipt.copies",
  kickOnCash: "pos.drawer.kickOnCash",
  kickOnRefund: "pos.drawer.kickOnRefund",
  drawerPulseMs: "pos.drawer.pulseMs",
  drawerEnabled: "pos.drawer.enabled",
  scannerPref: "pos.scanner.preferred", // "camera" | "hid"
  scannerBeep: "pos.scanner.beep",
  startFloat: "pos.register.startFloat",
  shiftAutoCloseHours: "pos.shift.autoCloseHours",
  safeDropThreshold: "pos.shift.safeDropThreshold",
  installId: "pos.device.installId",
  terminalConnected: "pos.terminal.connectedAt",
  terminalDisconnected: "pos.terminal.disconnectedAt",
  terminalLastError: "pos.terminal.lastError",
} as const;

function useLocalString(key: string, def: string) {
  const [v, setV] = useState<string>(() =>
    typeof window === "undefined" ? def : window.localStorage.getItem(key) ?? def,
  );
  const save = (next: string) => { setV(next); window.localStorage.setItem(key, next); };
  return [v, save] as const;
}
function useLocalBool(key: string, def: boolean) {
  const [v, setV] = useState<boolean>(() => {
    if (typeof window === "undefined") return def;
    const raw = window.localStorage.getItem(key);
    return raw === null ? def : raw === "1";
  });
  const save = (next: boolean) => { setV(next); window.localStorage.setItem(key, next ? "1" : "0"); };
  return [v, save] as const;
}

function ensureInstallId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(LS.installId);
  if (!id) {
    id = (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;
    window.localStorage.setItem(LS.installId, id);
  }
  return id;
}


/* ------------------------------- sub-panels ------------------------------- */

function ReceiptPanel() {
  const [paper, setPaper] = useLocalString(LS.paperWidth, "58");
  const [autoPrint, setAutoPrint] = useLocalBool(LS.autoPrint, true);
  const [copies, setCopies] = useLocalString(LS.copies, "1");
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" />Receipt</CardTitle>
        <CardDescription>How receipts print on this device. Store name, header and footer text are set in the web dashboard.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Paper width</Label>
          <Select value={paper} onValueChange={setPaper}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="58">58mm (32 columns)</SelectItem>
              <SelectItem value="80">80mm (42 columns)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <div><Label>Auto-print on sale</Label><p className="text-sm text-muted-foreground">Send receipt automatically when payment completes.</p></div>
          <Switch checked={autoPrint} onCheckedChange={setAutoPrint} />
        </div>
        <div className="space-y-2">
          <Label>Copies per sale</Label>
          <Input type="number" min={1} max={3} value={copies} onChange={(e) => setCopies(e.target.value.replace(/\D/g, "") || "1")} />
        </div>
      </CardContent>
    </Card>
  );
}

function PrinterPanel() {
  const [activeId, setActiveId] = useState<PrinterDriverId>(() => getActivePrinter().id);
  const [saved, setSaved] = useState(escposBle.getSavedTarget());
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Array<{ deviceId: string; name?: string; rssi?: number }>>([]);
  const [pairing, setPairing] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const onChangeDriver = (id: string) => {
    const next = id as PrinterDriverId;
    setActiveId(next); setActivePrinter(next);
    toast.success(`Printer: ${printerDrivers[next].label}`);
  };

  const scan = async () => {
    setScanning(true); setDevices([]);
    try {
      await escposBle.scanForPrinters((d) => setDevices((prev) =>
        prev.some((x) => x.deviceId === d.deviceId) ? prev : [...prev, d].sort((a, b) => (b.rssi ?? -99) - (a.rssi ?? -99)),
      ));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Scan failed"); }
    finally { setScanning(false); }
  };

  const pair = async (d: { deviceId: string; name?: string }) => {
    setPairing(d.deviceId);
    try {
      const t = await escposBle.pair(d.deviceId, d.name);
      setSaved(t);
      toast.success(`Paired ${t.name ?? t.deviceId.slice(0, 8)}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Pairing failed"); }
    finally { setPairing(null); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await runTestPrint();
      if (res.ok) toast.success("Test page sent to printer");
      else if (res.reason === "no_driver") toast.error("Select a printer driver first");
      else if (res.reason === "not_ready") toast.error("Printer not connected. Pair a printer and try again.");
      else if (res.reason === "not_native") toast.error("Test print is available only in the SEZA POS app.");
      else toast.error(res.error ?? "Printer error");
    } finally { setTesting(false); }
  };


  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Printer className="h-4 w-4" />Printer</CardTitle>
        <CardDescription>Generic ESC/POS over Bluetooth is the default production driver. Star Micronics and Epson slots are ready — the merchant's admin must install the vendor SDK to enable them.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Active driver</Label>
          <Select value={activeId} onValueChange={onChangeDriver}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(printerDrivers).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.label}{d.id === "star" || d.id === "epson" ? " — SDK required" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeId === "escpos-ble" && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bluetooth className="h-4 w-4" />
                <span className="text-sm">{saved ? `Paired: ${saved.name ?? saved.deviceId.slice(0, 8)}` : "No printer paired"}</span>
              </div>
              {saved ? <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />Ready</Badge> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={scan} disabled={scanning}>{scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Scan for printers</Button>
              {saved ? <Button size="sm" variant="outline" onClick={() => { escposBle.saveTarget(null); setSaved(null); }}>Forget</Button> : null}
              <Button size="sm" variant="outline" onClick={test} disabled={testing || !saved}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Test print</Button>
            </div>
            {devices.length > 0 && (
              <ul className="divide-y rounded border">
                {devices.map((d) => (
                  <li key={d.deviceId} className="flex items-center justify-between gap-2 p-2">
                    <div><div className="text-sm">{d.name || "(unnamed)"}</div><div className="text-xs text-muted-foreground">{d.deviceId} {typeof d.rssi === "number" ? `· ${d.rssi} dBm` : ""}</div></div>
                    <Button size="sm" onClick={() => pair(d)} disabled={!!pairing}>{pairing === d.deviceId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Pair</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(activeId === "star" || activeId === "epson") && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mr-1 inline h-4 w-4" />
            {printerDrivers[activeId].label} requires the vendor SDK. Contact your SEZA support rep to enable this driver — the architecture is ready.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CashDrawerPanel() {
  const [kickOnCash, setKickOnCash] = useLocalBool(LS.kickOnCash, true);
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try {
      const r = await runTestDrawer();
      if (r.ok) toast.success("Drawer pulse sent");
      else if (r.reason === "no_driver") toast.error("Select a printer driver first");
      else if (r.reason === "not_ready") toast.error("Printer not connected");
      else if (r.reason === "not_native") toast.error("Available only in the SEZA POS app.");
      else toast.error(r.error ?? "Drawer failed");
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-4 w-4" />Cash Drawer</CardTitle>
        <CardDescription>Cash drawers open via the connected receipt printer's kick-out signal.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div><Label>Open drawer on cash sale</Label><p className="text-sm text-muted-foreground">Automatically pulses the drawer when a cash payment completes.</p></div>
          <Switch checked={kickOnCash} onCheckedChange={setKickOnCash} />
        </div>
        <Button variant="outline" onClick={test} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Test open drawer</Button>
      </CardContent>
    </Card>
  );
}

function ScannerPanel() {
  const [beep, setBeep] = useLocalBool(LS.scannerBeep, true);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Scan className="h-4 w-4" />Barcode Scanner</CardTitle>
        <CardDescription>Configure your USB or Bluetooth keyboard-wedge scanner. The Android POS does not use the phone camera.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div><Label>Beep on scan</Label><p className="text-sm text-muted-foreground">Play a short tone when a barcode is recognized.</p></div>
          <Switch checked={beep} onCheckedChange={setBeep} />
        </div>
        <Button variant="outline" onClick={() => { window.location.hash = ""; window.history.pushState({}, "", "/settings/scanner"); window.dispatchEvent(new PopStateEvent("popstate")); }}>
          Open Scanner Setup & Test
        </Button>
        <p className="text-xs text-muted-foreground">
          Configure debounce, suffix keys, and length limits, and verify scans against your product catalog.
        </p>
      </CardContent>
    </Card>
  );
}


function TerminalPanel() {
  const [activeId, setActiveId] = useState<TerminalDriverId>(() => getActiveTerminal().id);
  const [suggesting, setSuggesting] = useState(false);
  const change = (id: string) => {
    const next = id as TerminalDriverId;
    setActiveId(next); setActiveTerminal(next);
    toast.success(`Terminal: ${terminalDrivers[next].label}`);
  };
  const prefer = async () => {
    setSuggesting(true);
    try {
      const id = await suggestPreferredTerminal();
      setActiveId(id); setActiveTerminal(id);
      toast.success(id === "none" ? "No supported terminal detected" : `Selected ${terminalDrivers[id].label}`);
    } finally { setSuggesting(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" />Payment Terminal</CardTitle>
        <CardDescription>Tap to Pay is preferred on NFC-capable devices; WisePOS E and WisePad 3 are supported for external readers.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Active terminal</Label>
          <Select value={activeId} onValueChange={change}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(terminalDrivers).map((d) => (<SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={prefer} disabled={suggesting}>{suggesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Auto-pick best</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Card-present charges create a Stripe PaymentIntent server-side. Tap to Pay and WisePOS/WisePad readers require the Stripe Terminal Capacitor plugin to be linked in the Android build; the payment flow works end-to-end once it's installed.
        </p>
      </CardContent>
    </Card>
  );
}

function DevicePanel() {
  const [label, setLabel] = useLocalString(LS.device, "");
  const installId = ensureInstallId();
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Monitor className="h-4 w-4" />Device</CardTitle>
        <CardDescription>Identify this register on receipts and audit logs.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Device label</Label>
          <Input value={label} placeholder="e.g. Front Counter" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Install ID</Label>
          <code className="block rounded bg-muted p-2 text-xs">{installId}</code>
        </div>
      </CardContent>
    </Card>
  );
}

function RegisterPanel() {
  const [startFloat, setStartFloat] = useLocalString(LS.startFloat, "100.00");
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Register</CardTitle>
        <CardDescription>Defaults used when opening a new register session.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Default starting float</Label>
          <Input inputMode="decimal" value={startFloat} onChange={(e) => setStartFloat(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

function ShiftPanel() {
  const [hrs, setHrs] = useLocalString(LS.shiftAutoCloseHours, "12");
  const [drop, setDrop] = useLocalString(LS.safeDropThreshold, "500.00");
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" />Shift</CardTitle>
        <CardDescription>Prompts and thresholds for cashier shift management.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Auto-close after (hours)</Label>
          <Input type="number" min={1} max={24} value={hrs} onChange={(e) => setHrs(e.target.value.replace(/\D/g, "") || "12")} />
        </div>
        <div className="space-y-2">
          <Label>Prompt safe-drop when drawer exceeds</Label>
          <Input inputMode="decimal" value={drop} onChange={(e) => setDrop(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

function PinPanel() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!/^\d{6}$/.test(pin)) return toast.error("PIN must be 6 digits");
    setBusy(true);
    try { await postAuthed("/api/public/pos/set-my-pin", { pin }); toast.success("PIN updated"); setPin(""); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try { await postAuthed("/api/public/pos/set-my-pin", { pin: null }); toast.success("PIN cleared"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not clear"); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Employee PIN</CardTitle>
        <CardDescription>Change your 6-digit register sign-in PIN.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>New PIN</Label>
          <Input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save PIN</Button>
          <Button variant="outline" onClick={clear} disabled={busy}>Clear PIN</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountPanel() {
  const [email, setEmail] = useState<string | null>(null);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  const changePwd = async () => {
    if (pwd.length < 8) return toast.error("Password must be 8+ characters");
    setBusy(true);
    try { await postAuthed("/api/public/pos/complete-first-login", { new_password: pwd }); toast.success("Password updated"); setPwd(""); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update"); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-4 w-4" />Account</CardTitle>
        <CardDescription>Signed in as {email ?? "…"}.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Change password</Label>
          <Input type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </div>
        <Button onClick={changePwd} disabled={busy || !pwd}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Update password</Button>
      </CardContent>
    </Card>
  );
}

function SignOutPanel() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><LogOut className="h-4 w-4" />Sign Out</CardTitle>
        <CardDescription>End this employee's session on this device.</CardDescription></CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={signOut} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Sign out</Button>
      </CardContent>
    </Card>
  );
}

function HardwareStatusPanel() {
  const [snap, setSnap] = useState(() => hardwareSnapshot());
  const [busy, setBusy] = useState<"print" | "drawer" | null>(null);
  const refresh = () => setSnap(hardwareSnapshot());
  const runPrint = async () => {
    setBusy("print");
    try {
      const r = await runTestPrint();
      r.ok ? toast.success("Test print sent") : toast.error(r.reason === "not_ready" ? "Printer not connected" : (r.error ?? "Printer error"));
    } finally { setBusy(null); refresh(); }
  };
  const runDrawer = async () => {
    setBusy("drawer");
    try {
      const r = await runTestDrawer();
      r.ok ? toast.success("Drawer pulse sent") : toast.error(r.reason === "not_ready" ? "Drawer/printer not connected" : (r.error ?? "Drawer error"));
    } finally { setBusy(null); refresh(); }
  };
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />Hardware Status</CardTitle>
        <CardDescription>Live status of the printer and cash drawer on this device.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3">
          <Row label="Printer driver" value={snap.driverLabel} />
          <Row label="Paper width" value={snap.paperWidth} />
          <Row label="Auto-print" value={snap.autoPrint ? "On" : "Off"} />
          <Row label="Copies per sale" value={snap.copies} />
          <Row label="Open drawer on cash sale" value={snap.kickOnCash ? "On" : "Off"} />
          <Row label="Last successful print" value={snap.lastPrintOk ? new Date(snap.lastPrintOk).toLocaleString() : "—"} />
          <Row label="Last print error" value={snap.lastPrintErr || "—"} />
          <Row label="Last drawer open" value={snap.lastDrawerOk ? new Date(snap.lastDrawerOk).toLocaleString() : "—"} />
          <Row label="Last drawer error" value={snap.lastDrawerErr || "—"} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refresh}>Refresh</Button>
          <Button onClick={runPrint} disabled={busy !== null}>
            {busy === "print" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test printer
          </Button>
          <Button variant="outline" onClick={runDrawer} disabled={busy !== null}>
            {busy === "drawer" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test cash drawer
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Hardware failure never blocks a completed sale. Use the Support screen to send diagnostics if the printer or drawer is misbehaving.
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- page ---------------------------------- */

const SECTIONS = [
  { id: "receipt", label: "Receipt", Panel: ReceiptPanel },
  { id: "printer", label: "Printer", Panel: PrinterPanel },
  { id: "drawer", label: "Cash Drawer", Panel: CashDrawerPanel },
  { id: "scanner", label: "Barcode Scanner", Panel: ScannerPanel },
  { id: "status", label: "Hardware Status", Panel: HardwareStatusPanel },
  { id: "terminal", label: "Payment Terminal", Panel: TerminalPanel },

  { id: "device", label: "Device", Panel: DevicePanel },
  { id: "register", label: "Register", Panel: RegisterPanel },
  { id: "shift", label: "Shift", Panel: ShiftPanel },
  { id: "pin", label: "Employee PIN", Panel: PinPanel },
  { id: "account", label: "Account", Panel: AccountPanel },
] as const;

export function SettingsScreen() {
  const [active, setActive] = useState<(typeof SECTIONS)[number]["id"]>("receipt");
  const Panel = SECTIONS.find((s) => s.id === active)!.Panel;
  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:grid-cols-[220px_1fr] pb-24">
        <nav className="rounded-md border bg-card p-2 md:sticky md:top-4 md:self-start">
          <ul className="grid gap-1 md:grid-cols-1 grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={`w-full rounded px-3 py-2 text-left text-sm min-h-11 ${active === s.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >{s.label}</button>
              </li>
            ))}
          </ul>
          <p className="mt-3 px-3 text-xs text-muted-foreground">Owner-only settings (store profile, taxes, billing, integrations) live in the web dashboard. Sign out from the cashier menu.</p>
        </nav>
        <section className="min-w-0"><Panel /></section>
      </div>
    </div>
  );
}
