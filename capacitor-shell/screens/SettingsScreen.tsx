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
  Activity, Radio, LifeBuoy,
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
import { collectDiagnostics as collectSupportDiagnostics } from "../support/diagnostics";
import { logAudit } from "@/lib/audit-log";
import { useTranslation } from "react-i18next";
import { userFacingError } from "@/lib/errors/user-facing";


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
  const save = (next: string) => {
    setV(next);
    window.localStorage.setItem(key, next);
    window.dispatchEvent(new CustomEvent("seza:device-config-changed", { detail: { key, value: next } }));
  };
  return [v, save] as const;
}
function useLocalBool(key: string, def: boolean) {
  const [v, setV] = useState<boolean>(() => {
    if (typeof window === "undefined") return def;
    const raw = window.localStorage.getItem(key);
    return raw === null ? def : raw === "1";
  });
  const save = (next: boolean) => {
    setV(next);
    window.localStorage.setItem(key, next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("seza:device-config-changed", { detail: { key, value: next } }));
  };
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
  const [paper, setPaper] = useLocalString(LS.paperWidth, "80");
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
              <SelectItem value="80">80mm (48 columns)</SelectItem>
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
    } catch (e) { toast.error(userFacingError(e, "Could not scan for printers.")); }
    finally { setScanning(false); }
  };

  const pair = async (d: { deviceId: string; name?: string }) => {
    setPairing(d.deviceId);
    try {
      const t = await escposBle.pair(d.deviceId, d.name);
      setSaved(t);
      toast.success(`Paired ${t.name ?? t.deviceId.slice(0, 8)}`);
    } catch (e) { toast.error(userFacingError(e, "Could not pair this printer.")); }
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
      else toast.error(userFacingError(res.error, "The printer could not complete the test."));
    } finally { setTesting(false); }
  };


  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Printer className="h-4 w-4" />Printer</CardTitle>
        <CardDescription>Choose the receipt printer used by this register. Available printer types depend on the connected hardware.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Active driver</Label>
          <Select value={activeId} onValueChange={onChangeDriver}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(printerDrivers).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
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
              {saved ? <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />Saved</Badge> : <Badge variant="outline">Not paired</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              Bluetooth ESC/POS printers reconnect on demand for each print job — there is no persistent session to end. Use <em>Remove printer</em> to forget the pairing on this device.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={scan} disabled={scanning}>{scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Scan for printers</Button>
              <Button size="sm" variant="outline" onClick={test} disabled={testing || !saved}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Test print</Button>
              {saved ? <Button size="sm" variant="destructive" onClick={() => { escposBle.saveTarget(null); setSaved(null); toast.success("Printer removed"); }}>Remove printer</Button> : null}
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
            {printerDrivers[activeId].label} is not available on this register yet. Contact SEZA Support if you need this printer type.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CashDrawerPanel() {
  const [enabled, setEnabled] = useLocalBool(LS.drawerEnabled, true);
  const [kickOnCash, setKickOnCash] = useLocalBool(LS.kickOnCash, true);
  const [kickOnRefund, setKickOnRefund] = useLocalBool(LS.kickOnRefund, false);
  const [pulseMs, setPulseMs] = useLocalString(LS.drawerPulseMs, "120");
  const [busy, setBusy] = useState(false);
  const linkedPrinter = getActivePrinter();
  const bleSaved = escposBle.getSavedTarget();
  const test = async () => {
    setBusy(true);
    try {
      const r = await runTestDrawer();
      if (r.ok) toast.success("Cash drawer opened");
      else if (r.reason === "no_driver") toast.error("Select a printer driver first");
      else if (r.reason === "not_ready") toast.error("Printer not connected — pair a printer to open the drawer.");
      else if (r.reason === "not_native") toast.error("Available only in the SEZA POS app.");
      else toast.error(userFacingError(r.error, "The cash drawer could not open."));
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-4 w-4" />Cash Drawer</CardTitle>
        <CardDescription>Use the connected receipt printer to open the cash drawer.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Linked printer</span>
            <span className="font-medium">{linkedPrinter.label}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Printer state</span>
            <span>{bleSaved ? <Badge variant="secondary">Paired</Badge> : <Badge variant="outline">Not paired</Badge>}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div><Label>Drawer enabled</Label><p className="text-sm text-muted-foreground">Master switch for this device.</p></div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="flex items-center justify-between">
          <div><Label>Open on cash sale</Label><p className="text-sm text-muted-foreground">Open the drawer when a cash payment completes.</p></div>
          <Switch checked={kickOnCash} onCheckedChange={setKickOnCash} disabled={!enabled} />
        </div>
        <div className="flex items-center justify-between">
          <div><Label>Open on cash refund</Label><p className="text-sm text-muted-foreground">Open the drawer when a cash refund is issued.</p></div>
          <Switch checked={kickOnRefund} onCheckedChange={setKickOnRefund} disabled={!enabled} />
        </div>
        <div className="space-y-2">
          <Label>Pulse duration (ms)</Label>
          <Input inputMode="numeric" value={pulseMs} onChange={(e) => setPulseMs(e.target.value.replace(/\D/g, "").slice(0, 4) || "120")} disabled={!enabled} />
          <p className="text-xs text-muted-foreground">Most drawers respond well to 100–200 ms. Increase only if your drawer fails to open reliably.</p>
        </div>
        <Button variant="outline" onClick={test} disabled={busy || !enabled}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Test open drawer</Button>
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
  const [pluginOk, setPluginOk] = useState<boolean | null>(null);
  const [tapToPayOk, setTapToPayOk] = useState<boolean | null>(null);
  const [readers, setReaders] = useState<Array<{ id: string; label: string }> | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<TerminalDriverId | null>(() => stripeTerminal.connectedReader());
  const [lastError, setLastError] = useState<string>(() => window.localStorage.getItem(LS.terminalLastError) ?? "");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    stripeTerminal.pluginAvailable().then(setPluginOk);
    stripeTerminal.isTapToPaySupported().then(setTapToPayOk);
  }, []);

  const change = (id: string) => {
    const next = id as TerminalDriverId;
    setActiveId(next); setActiveTerminal(next);
    setReaders(null);
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
  const discover = async () => {
    if (!pluginOk) return toast.error("Card reader service is unavailable. Contact SEZA Support.");
    setDiscovering(true); setReaders(null);
    try {
      const list = await stripeTerminal.discoverReaders(activeId);
      setReaders(list);
      if (list.length === 0) toast.info("No readers found on this network.");
    } catch (e) {
      const msg = userFacingError(e, "Could not discover a card reader. Please try again.");
      setLastError(msg); window.localStorage.setItem(LS.terminalLastError, msg);
      toast.error(msg);
    } finally { setDiscovering(false); }
  };
  const testCharge = async () => {
    setTesting(true);
    try {
      // Real preflight — creates the PaymentIntent on the server. We do NOT
      // simulate a fake "connected" state; charge() will honestly fail if the
      // plugin isn't present, so the merchant sees a real error and can act.
      const r = await stripeTerminal.charge(activeId, { amountCents: 1, currency: "usd", description: "SEZA Terminal test" });
      if (r.ok) {
        setConnected(activeId);
        window.localStorage.setItem(LS.terminalConnected, new Date().toISOString());
        toast.success("Card reader connection verified.");
      } else {
        const message = userFacingError(r.error, "The card reader connection could not be verified.");
        setLastError(message); window.localStorage.setItem(LS.terminalLastError, message);
        toast.error(message);
      }
    } finally { setTesting(false); }
  };
  const disconnect = async () => {
    await stripeTerminal.disconnect();
    setConnected(null);
    window.localStorage.setItem(LS.terminalDisconnected, new Date().toISOString());
    toast.success("Terminal disconnected");
  };
  const remove = () => {
    setActiveTerminal("none"); setActiveId("none"); setReaders(null);
    toast.success("Terminal removed");
  };

  const capacityLabel = activeId === "stripe-tap-to-pay"
    ? (tapToPayOk === null ? "Checking…" : tapToPayOk ? "Supported on this device" : "Not supported on this device")
    : activeId === "stripe-wisepos" ? "Wi-Fi reader" : activeId === "stripe-wisepad3" ? "Bluetooth reader" : "—";

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" />Payment Terminal</CardTitle>
        <CardDescription>Connect the card reader used by this register for in-person card payments.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Active terminal</Label>
          <Select value={activeId} onValueChange={change}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="stripe-tap-to-pay">Tap to Pay</SelectItem>
              <SelectItem value="stripe-wisepos">BBPOS WisePOS E</SelectItem>
              <SelectItem value="stripe-wisepad3">BBPOS WisePad 3</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Reader service</span>
            <span>{pluginOk === null ? "Checking…" : pluginOk ? <Badge variant="secondary">Yes</Badge> : <Badge variant="outline">Unavailable</Badge>}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Capability</span><span className="font-medium">{capacityLabel}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Connection</span>
            <span>{connected === activeId && activeId !== "none" ? <Badge variant="secondary">Connected</Badge> : <Badge variant="outline">Not connected</Badge>}</span></div>
          {lastError ? <div className="mt-1 text-xs text-destructive">Reader status: {userFacingError(lastError, "Needs attention")}</div> : null}
        </div>

        {activeId !== "none" && !pluginOk && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mr-1 inline h-4 w-4" />
            Card reader service is unavailable on this register. Contact SEZA Support.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={prefer} disabled={suggesting}>{suggesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Auto-pick best</Button>
          {(activeId === "stripe-wisepos" || activeId === "stripe-wisepad3") && (
            <Button variant="outline" onClick={discover} disabled={discovering || !pluginOk}>
              {discovering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radio className="mr-2 h-4 w-4" />}Discover readers
            </Button>
          )}
          <Button onClick={testCharge} disabled={testing || activeId === "none"}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Test connection ($0.01)</Button>
          <Button variant="outline" onClick={disconnect} disabled={!connected}>Disconnect</Button>
          <Button variant="destructive" onClick={remove} disabled={activeId === "none"}>Remove terminal</Button>
        </div>

        {readers && readers.length > 0 && (
          <ul className="divide-y rounded border">
            {readers.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 p-2">
                <div className="text-sm">{r.label}</div>
                <Button size="sm" onClick={() => { setConnecting(r.id); toast.info("Selected. Run a Test connection to confirm."); setConnecting(null); }} disabled={!!connecting}>Select</Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Use Test connection after selecting a reader to confirm it is ready for checkout.
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
  const qc = useQueryClient();
  const { data: ctx } = useQuery({
    queryKey: ["register-panel-ctx"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { isOwner: false, store: null as null | { id: string; allow_cashier_quick_add: boolean } };
      const [profile, roles] = await Promise.all([
        supabase.from("profiles").select("store_id").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      const storeId = profile.data?.store_id ?? null;
      const isOwner = (roles.data ?? []).some((r) => r.role === "owner" || r.role === "admin");
      if (!storeId) return { isOwner, store: null };
      const { data: store } = await supabase.from("stores").select("id, allow_cashier_quick_add").eq("id", storeId).maybeSingle();
      return { isOwner, store: (store ?? null) as { id: string; allow_cashier_quick_add: boolean } | null };
    },
  });

  const [saving, setSaving] = useState(false);
  const toggleQuickAdd = async (next: boolean) => {
    if (!ctx?.store) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("stores").update({ allow_cashier_quick_add: next }).eq("id", ctx.store.id);
      if (error) throw error;
      toast.success(next ? "Cashier quick-add enabled" : "Cashier quick-add disabled");
      qc.invalidateQueries({ queryKey: ["register-panel-ctx"] });
      logAudit({ action: "settings.update", entity: "stores", entity_id: ctx.store.id, details: { field: "allow_cashier_quick_add", enabled: next } }).catch(() => {});
    } catch (e) {
      toast.error(userFacingError(e, "Could not save this setting."));
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Register</CardTitle>
        <CardDescription>Defaults used when opening a new register session.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Default starting float</Label>
          <Input inputMode="decimal" value={startFloat} onChange={(e) => setStartFloat(e.target.value)} />
        </div>

        {ctx?.isOwner && ctx.store ? (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Allow cashier to add a product when a barcode is not found</Label>
              <p className="text-sm text-muted-foreground">
                When on, cashiers with the <code>products.quick_add</code> permission can create a minimal product from the POS Register. Owners and managers can always quick-add.
              </p>
            </div>
            <Switch checked={!!ctx.store.allow_cashier_quick_add} onCheckedChange={toggleQuickAdd} disabled={saving} />
          </div>
        ) : ctx && !ctx.isOwner ? (
          <p className="text-xs text-muted-foreground">Cashier quick-add is controlled by the store owner in the web dashboard or this panel.</p>
        ) : null}
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
    catch (e) { toast.error(userFacingError(e, "Could not save this setting.")); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try { await postAuthed("/api/public/pos/set-my-pin", { pin: null }); toast.success("PIN cleared"); }
    catch (e) { toast.error(userFacingError(e, "Could not clear the PIN.")); }
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
    catch (e) { toast.error(userFacingError(e, "Could not update the password.")); }
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
  const [scannerLast, setScannerLast] = useState<string>(() => loadScannerConfig().lastScanAt ?? "");
  const [terminalCap, setTerminalCap] = useState<{ pluginOk: boolean | null; tapToPay: boolean | null }>({ pluginOk: null, tapToPay: null });
  const [connected, setConnected] = useState<TerminalDriverId | null>(() => stripeTerminal.connectedReader());
  const [copyingDiag, setCopyingDiag] = useState(false);
  const scannerCfg = useMemo(() => loadScannerConfig(), []);
  const activeTerminal = getActiveTerminal();

  useEffect(() => {
    stripeTerminal.pluginAvailable().then((pluginOk) =>
      setTerminalCap((c) => ({ ...c, pluginOk })));
    stripeTerminal.isTapToPaySupported().then((tapToPay) =>
      setTerminalCap((c) => ({ ...c, tapToPay })));
  }, []);

  const refresh = () => {
    setSnap(hardwareSnapshot());
    setScannerLast(loadScannerConfig().lastScanAt ?? "");
    setConnected(stripeTerminal.connectedReader());
  };
  const runPrint = async () => {
    setBusy("print");
    try {
      const r = await runTestPrint();
      r.ok ? toast.success("Test print sent") : toast.error(r.reason === "not_ready" ? "Printer not connected" : userFacingError(r.error, "Printer test failed."));
    } finally { setBusy(null); refresh(); }
  };
  const runDrawer = async () => {
    setBusy("drawer");
    try {
      const r = await runTestDrawer();
      r.ok ? toast.success("Cash drawer opened") : toast.error(r.reason === "not_ready" ? "Drawer/printer not connected" : userFacingError(r.error, "Cash drawer test failed."));
    } finally { setBusy(null); refresh(); }
  };
  const copyDiag = async () => {
    setCopyingDiag(true);
    try {
      const diag = await collectSupportDiagnostics({ route: window.location.pathname, storeId: null, employeeId: null });
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      toast.success("Diagnostics copied to clipboard");
    } catch (e) {
      toast.error(userFacingError(e, "Could not prepare support information."));
    } finally { setCopyingDiag(false); }
  };

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );

  const bleSaved = escposBle.getSavedTarget();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />Hardware Status</CardTitle>
        <CardDescription>Live status of the printer, cash drawer, barcode scanner, and payment terminal on this device.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Printer className="h-4 w-4" />Printer</div>
          <Row label="Driver" value={snap.driverLabel} />
          <Row label="Paired" value={bleSaved ? (bleSaved.name ?? bleSaved.deviceId.slice(0, 10)) : "—"} />
          <Row label="Paper width" value={snap.paperWidth} />
          <Row label="Auto-print" value={snap.autoPrint ? "On" : "Off"} />
          <Row label="Copies per sale" value={snap.copies} />
          <Row label="Last successful print" value={snap.lastPrintOk ? new Date(snap.lastPrintOk).toLocaleString() : "—"} />
          <Row label="Last print status" value={snap.lastPrintErr ? userFacingError(snap.lastPrintErr, "Needs attention") : "—"} />
        </div>

        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><DollarSign className="h-4 w-4" />Cash Drawer</div>
          <Row label="Open on cash sale" value={snap.kickOnCash ? "On" : "Off"} />
          <Row label="Last drawer open" value={snap.lastDrawerOk ? new Date(snap.lastDrawerOk).toLocaleString() : "—"} />
          <Row label="Last drawer status" value={snap.lastDrawerErr ? userFacingError(snap.lastDrawerErr, "Needs attention") : "—"} />
        </div>

        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Scan className="h-4 w-4" />Barcode Scanner</div>
          <Row label="Mode" value={scannerCfg.type === "usb-wedge" ? "USB keyboard wedge" : scannerCfg.type === "bluetooth-wedge" ? "Bluetooth keyboard wedge" : "Generic HID"} />
          <Row label="Suffix" value={scannerCfg.suffixEnter ? "Enter" : scannerCfg.suffixTab ? "Tab" : "None"} />
          <Row label="Debounce (ms)" value={scannerCfg.debounceMs} />
          <Row label="Last scan" value={scannerLast || "—"} />
        </div>

        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><CreditCard className="h-4 w-4" />Payment Terminal</div>
          <Row label="Active" value={activeTerminal.label} />
          <Row label="Reader service" value={terminalCap.pluginOk === null ? "Checking…" : terminalCap.pluginOk ? "Available" : "Unavailable"} />
          <Row label="Tap to Pay" value={terminalCap.tapToPay === null ? "Checking…" : terminalCap.tapToPay ? "Supported" : "Not supported"} />
          <Row label="Connected reader" value={connected ?? "—"} />
          <Row label="Last connect" value={(() => { const v = window.localStorage.getItem(LS.terminalConnected); return v ? new Date(v).toLocaleString() : "—"; })()} />
          <Row label="Last reader status" value={(() => { const value = window.localStorage.getItem(LS.terminalLastError); return value ? userFacingError(value, "Needs attention") : "—"; })()} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refresh}>Refresh</Button>
          <Button onClick={runPrint} disabled={busy !== null}>
            {busy === "print" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test printer
          </Button>
          <Button variant="outline" onClick={runDrawer} disabled={busy !== null}>
            {busy === "drawer" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test cash drawer
          </Button>
          <Button variant="outline" onClick={() => { window.history.pushState({}, "", "/settings/scanner"); window.dispatchEvent(new PopStateEvent("popstate")); }}>
            <Scan className="mr-2 h-4 w-4" />Configure scanner
          </Button>
          <Button variant="outline" onClick={copyDiag} disabled={copyingDiag}>
            {copyingDiag ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LifeBuoy className="mr-2 h-4 w-4" />}Share device info
          </Button>
          <Button variant="outline" onClick={() => { window.history.pushState({}, "", "/support"); window.dispatchEvent(new PopStateEvent("popstate")); }}>
            <LifeBuoy className="mr-2 h-4 w-4" />Open Support
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Hardware failure never blocks a completed sale. Share device info into a Support ticket if the printer, drawer, scanner, or terminal is misbehaving.
        </p>
      </CardContent>
    </Card>
  );
}



/* ---------------------------------- page ---------------------------------- */

const SECTIONS = [
  { id: "receipt", labelKey: "settings.receipts", Panel: ReceiptPanel },
  { id: "printer", labelKey: "settings.hardware", Panel: PrinterPanel },
  { id: "drawer", labelKey: "settings.cash_rules", Panel: CashDrawerPanel },
  { id: "scanner", labelKey: "settings.hardware", Panel: ScannerPanel },
  { id: "status", labelKey: "settings.hardware", Panel: HardwareStatusPanel },
  { id: "terminal", labelKey: "settings.terminal", Panel: TerminalPanel },

  { id: "device", labelKey: "nav.devices", Panel: DevicePanel },
  { id: "register", labelKey: "posNav.register", Panel: RegisterPanel },
  { id: "shift", labelKey: "posNav.shift", Panel: ShiftPanel },
  { id: "pin", labelKey: "settings.manager_pin", Panel: PinPanel },
  { id: "account", labelKey: "settings.owner_profile", Panel: AccountPanel },
] as const;

export function SettingsScreen() {
  const { t } = useTranslation();
  const [active, setActive] = useState<(typeof SECTIONS)[number]["id"]>("receipt");
  const { data: access, isLoading } = useQuery({
    queryKey: ["android-settings-access"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return { privileged: false };
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.user.id);
      const roleNames = (roles ?? []).map((r) => String(r.role));
      if (roleNames.some((r) => r === "owner" || r === "admin" || r === "manager")) return { privileged: true };
      const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.user.id).maybeSingle();
      if (!profile?.store_id) return { privileged: false };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: perms } = await (supabase.from as any)("role_permissions")
        .select("permission")
        .eq("store_id", profile.store_id)
        .in("role", roleNames);
      const keys = new Set((perms ?? []).map((p: { permission: string }) => p.permission));
      return { privileged: keys.has("*") || keys.has("settings.edit") || keys.has("hardware.configure") };
    },
  });
  const visible = access?.privileged ? SECTIONS : SECTIONS.filter((s) => s.id === "account");
  useEffect(() => {
    if (!isLoading && !visible.some((s) => s.id === active)) setActive(visible[0]?.id ?? "account");
  }, [active, isLoading, visible]);
  const selected = visible.find((s) => s.id === active) ?? visible[0];
  const Panel = selected.Panel;

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:grid-cols-[220px_1fr] pb-24">
        <nav className="rounded-md border bg-card p-2 md:sticky md:top-4 md:self-start">
          <ul className="grid gap-1 md:grid-cols-1 grid-cols-2">
            {visible.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => setActive(section.id)}
                  className={`w-full rounded px-3 py-2 text-left text-sm min-h-11 ${active === section.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >{t(section.labelKey)}</button>
              </li>
            ))}
          </ul>
          <p className="mt-3 px-3 text-xs text-muted-foreground">
            {access?.privileged
              ? "Hardware is configured on this physical Android register. Branding, taxes, billing and store-wide language are controlled by the owner dashboard."
              : "Cashiers can manage only their account. PIN resets, hardware, and store configuration require manager or owner access."}
          </p>
        </nav>
        <section className="min-w-0"><Panel /></section>
      </div>
    </div>
  );
}
