// Scanner Settings + Test Scanner (APK).
// USB / Bluetooth keyboard-wedge configuration. No camera scanner.
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Scan, Bluetooth, RotateCcw } from "lucide-react";
import { loadScannerConfig, saveScannerConfig, attachWedgeListener, type ScannerConfig } from "../lib/scannerConfig";
import { supabase } from "../supabase";
import { userFacingError } from "@/lib/errors/user-facing";

export function ScannerSettingsScreen() {
  const [cfg, setCfg] = useState<ScannerConfig>(() => loadScannerConfig());
  const [testMode, setTestMode] = useState(false);

  const update = (patch: Partial<ScannerConfig>) => {
    const next = saveScannerConfig(patch);
    setCfg(next);
  };

  return (
    <div className="space-y-4 p-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Scan className="h-4 w-4" />Barcode Scanner</CardTitle>
          <CardDescription>
            The SEZA POS Android app supports USB and Bluetooth keyboard-wedge scanners only.
            Pair Bluetooth scanners in Android Settings first, then return here to test.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Scanner enabled</Label>
            <Switch checked={cfg.enabled} onCheckedChange={(v) => update({ enabled: v })} />
          </div>

          <div className="space-y-2">
            <Label>Scanner type</Label>
            <Select value={cfg.type} onValueChange={(v: ScannerConfig["type"]) => update({ type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="usb-wedge">USB keyboard-wedge</SelectItem>
                <SelectItem value="bluetooth-wedge">Bluetooth keyboard-wedge</SelectItem>
                <SelectItem value="generic-hid">Generic HID</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {cfg.type === "bluetooth-wedge" && (
            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="flex items-center gap-2"><Bluetooth className="h-4 w-4" /> Bluetooth pairing is handled by Android.</div>
              <Button variant="outline" size="sm" onClick={() => openBluetoothSettings()}>Open Bluetooth Settings</Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label>Enter suffix</Label>
              <Switch checked={cfg.suffixEnter} onCheckedChange={(v) => update({ suffixEnter: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label>Tab suffix</Label>
              <Switch checked={cfg.suffixTab} onCheckedChange={(v) => update({ suffixTab: v })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Debounce (ms)</Label>
              <Input type="number" value={cfg.debounceMs} min={100} max={5000}
                onChange={(e) => update({ debounceMs: clamp(+e.target.value || 400, 100, 5000) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min length</Label>
              <Input type="number" value={cfg.minLength} min={1} max={64}
                onChange={(e) => update({ minLength: clamp(+e.target.value || 4, 1, 64) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max length</Label>
              <Input type="number" value={cfg.maxLength} min={1} max={256}
                onChange={(e) => update({ maxLength: clamp(+e.target.value || 64, 1, 256) })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <SwitchRow label="Success sound" checked={cfg.successSound} onChange={(v) => update({ successSound: v })} />
            <SwitchRow label="Error sound" checked={cfg.errorSound} onChange={(v) => update({ errorSound: v })} />
            <SwitchRow label="Vibrate" checked={cfg.vibrate} onChange={(v) => update({ vibrate: v })} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <SwitchRow label="Allow in Register" checked={cfg.allowInRegister} onChange={(v) => update({ allowInRegister: v })} />
            <SwitchRow label="Allow in Product search" checked={cfg.allowInSearch} onChange={(v) => update({ allowInSearch: v })} />
          </div>

          <div className="rounded-md border p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">Last scan:</span> {cfg.lastScanAt ?? "—"}</div>
            <div><span className="text-muted-foreground">Last barcode:</span> {cfg.lastBarcode ?? "—"}</div>
            <div><span className="text-muted-foreground">Last match:</span> {cfg.lastMatchedProduct ?? "—"}</div>
            <div><span className="text-muted-foreground">Last status:</span> {cfg.lastError ? userFacingError(cfg.lastError, "Needs attention") : "—"}</div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setTestMode(true)}>Test Scanner</Button>
            <Button variant="outline" onClick={() => { update({ lastScanAt: null, lastBarcode: null, lastMatchedProduct: null, lastError: null }); }}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset log
            </Button>
          </div>
        </CardContent>
      </Card>

      {testMode && <TestScanner onClose={() => setTestMode(false)} />}
    </div>
  );
}

function openBluetoothSettings() {
  try {
    // Best-effort: on native, users can open Android Settings from the app.
    // The Capacitor App plugin doesn't expose a settings intent by default,
    // so we surface a toast with instructions.
    toast.info("Open Android Settings → Connected devices → Bluetooth, then pair your scanner.");
  } catch { /* noop */ }
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* --------------------------------- Test Scanner --------------------------- */

type TestState = {
  waiting: boolean;
  lastCode: string | null;
  lastAt: number | null;
  matched: string | null;
  status: "idle" | "matched" | "not_found" | "duplicate" | "error";
  errorMsg?: string;
};

function TestScanner({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<TestState>({ waiting: true, lastCode: null, lastAt: null, matched: null, status: "idle" });
  const seenRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    const unsub = attachWedgeListener(async (ev) => {
      // Duplicate protection is enforced inside attachWedgeListener; this
      // second check ignores repeated bursts that arrived under the debounce.
      const prev = seenRef.current;
      if (prev && prev.code === ev.barcode && ev.at - prev.at < loadScannerConfig().debounceMs) {
        setState((s) => ({ ...s, status: "duplicate", lastCode: ev.barcode, lastAt: ev.at }));
        return;
      }
      seenRef.current = { code: ev.barcode, at: ev.at };
      setState((s) => ({ ...s, waiting: false, lastCode: ev.barcode, lastAt: ev.at, matched: null, status: "idle" }));
      try {
        const { data } = await supabase
          .from("products")
          .select("id, name")
          .eq("barcode", ev.barcode)
          .maybeSingle();
        if (data) {
          saveScannerConfig({ lastScanAt: new Date(ev.at).toISOString(), lastBarcode: ev.barcode, lastMatchedProduct: data.name, lastError: null });
          setState((s) => ({ ...s, matched: data.name, status: "matched" }));
          try { navigator.vibrate?.(30); } catch { /* noop */ }
        } else {
          saveScannerConfig({ lastScanAt: new Date(ev.at).toISOString(), lastBarcode: ev.barcode, lastMatchedProduct: null, lastError: "not_found" });
          setState((s) => ({ ...s, status: "not_found" }));
        }
      } catch (e) {
        const msg = userFacingError(e, "Product lookup failed. Please try again.");
        saveScannerConfig({ lastError: msg });
        setState((s) => ({ ...s, status: "error", errorMsg: msg }));
      }
    });
    return unsub;
  }, []);

  const timeStr = useMemo(() => state.lastAt ? new Date(state.lastAt).toLocaleTimeString() : "—", [state.lastAt]);

  return (
    <Card className="border-2 border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Scan className="h-4 w-4" />Test Scanner</CardTitle>
        <CardDescription>Scan a barcode using your USB or Bluetooth scanner. This screen does not add items to the register.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/40 p-6 text-center">
          {state.lastCode ? (
            <>
              <div className="text-2xl font-mono">{state.lastCode}</div>
              <div className="mt-2 text-sm">
                {state.status === "matched" && <span className="text-emerald-600">Matched: {state.matched}</span>}
                {state.status === "not_found" && <span className="text-amber-600">Product not found</span>}
                {state.status === "duplicate" && <span className="text-muted-foreground">Duplicate scan ignored</span>}
                {state.status === "error" && <span className="text-destructive">Lookup failed: {state.errorMsg}</span>}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">at {timeStr}</div>
            </>
          ) : (
            <div className="text-muted-foreground">Waiting for barcode…</div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setState({ waiting: true, lastCode: null, lastAt: null, matched: null, status: "idle" })}>Clear</Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </CardContent>
    </Card>
  );
}
