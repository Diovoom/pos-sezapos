import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Printer, RefreshCw, Usb, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isNativeMode } from "@/lib/native";
import {
  clearUsbDevice,
  listUsbPrinters,
  nativeUsbTestPrint,
  pairUsbPrinter,
  selectedUsbDeviceId,
  usbPrinterReady,
  type UsbPrinterDevice,
} from "@/lib/hardware/escpos-usb";
import { setActivePrinter } from "@/lib/hardware";

export function NativeUsbPrinterPanel() {
  const [devices, setDevices] = useState<UsbPrinterDevice[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const selected = selectedUsbDeviceId();

  const refresh = async () => {
    if (!isNativeMode()) return;
    setBusy(true);
    try {
      setDevices(await listUsbPrinters());
      setReady(await usbPrinterReady());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not scan USB devices");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  if (!isNativeMode()) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Printer className="size-5" /> Built-in / USB receipt printer</span>
          <Badge variant="outline" className={ready ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"}>
            {ready ? <CheckCircle2 className="mr-1 size-3" /> : <XCircle className="mr-1 size-3" />}
            {ready ? "Configured" : "Not configured"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Detects ESC/POS printers connected directly to this Android register. This is separate from the Rongta test app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Detect USB printers
        </Button>
        <div className="space-y-2">
          {devices.length === 0 && !busy && <p className="text-sm text-muted-foreground">No compatible USB bulk printer detected.</p>}
          {devices.map((device) => (
            <div key={device.deviceId} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium"><Usb className="size-4" />{device.name || "USB printer"}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">VID {device.vendorId} · PID {device.productId} · Device {device.deviceId}</div>
              </div>
              <Button
                size="sm"
                variant={selected === device.deviceId && ready ? "default" : "outline"}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await pairUsbPrinter(device.deviceId);
                    setActivePrinter("escpos-usb");
                    setReady(await usbPrinterReady());
                    toast.success("USB printer configured in SEZA POS");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not configure printer");
                  } finally { setBusy(false); }
                }}
              >
                {selected === device.deviceId && ready ? "Selected" : "Use this printer"}
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button disabled={!ready || busy} onClick={async () => {
            setBusy(true);
            try { await nativeUsbTestPrint(); toast.success("SEZA test receipt printed"); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Test print failed"); }
            finally { setBusy(false); }
          }}>Test print</Button>
          <Button variant="outline" disabled={selected == null || busy} onClick={() => {
            clearUsbDevice(); setActivePrinter("none"); setReady(false); toast.info("USB printer removed from SEZA POS");
          }}>Disconnect</Button>
        </div>
      </CardContent>
    </Card>
  );
}
