import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Printer, RefreshCw, Usb, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { isNativeMode } from "@/lib/native";
import {
  clearUsbDevice,
  listUsbPrinters,
  pairUsbPrinter,
  selectedUsbDeviceId,
  usbPrinterReady,
  type UsbPrinterDevice,
} from "@/lib/hardware/escpos-usb";
import { setActivePrinter } from "@/lib/hardware";
import { testPrint } from "@/lib/hardware/native-receipt";

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
      toast.error(userFacingError(error, "Could not scan USB devices"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (!isNativeMode()) return null;

  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="space-y-1 p-3 pb-2">
        <CardTitle className="flex items-start justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Printer className="size-4" /> Receipt printer
          </span>
          <Badge
            variant="outline"
            className={`h-5 px-1.5 text-[10px] font-medium ${
              ready ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"
            }`}
          >
            {ready ? <CheckCircle2 className="mr-1 size-3" /> : <XCircle className="mr-1 size-3" />}
            {ready ? "Ready" : "Not set"}
          </Badge>
        </CardTitle>
        <CardDescription className="text-[11px] leading-4">
          Built-in or USB ESC/POS printer used by this register.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2 p-3 pt-0">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void refresh()} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 size-3.5" />}
          Detect printers
        </Button>

        <div className="space-y-2">
          {devices.length === 0 && !busy && (
            <p className="text-[11px] text-muted-foreground">No compatible USB printer detected.</p>
          )}
          {devices.map((device) => (
            <div key={device.deviceId} className="rounded-md border p-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Usb className="size-3.5" /> {device.name || "USB printer"}
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                VID {device.vendorId} · PID {device.productId} · Device {device.deviceId}
              </div>
              <Button
                size="sm"
                className="mt-2 h-7 text-[11px]"
                variant={selected === device.deviceId && ready ? "default" : "outline"}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await pairUsbPrinter(device.deviceId);
                    setActivePrinter("escpos-usb");
                    setReady(await usbPrinterReady());
                    toast.success("USB printer configured in SEZA POS");
                  } catch (error) {
                    toast.error(userFacingError(error, "Could not configure printer"));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {selected === device.deviceId && ready ? "Selected" : "Use printer"}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-2">
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await testPrint();
                if (!result.ok) throw new Error(result.error || result.reason);
                toast.success("SEZA test receipt printed");
              } catch (error) {
                toast.error(userFacingError(error, "Test print failed"));
              } finally {
                setBusy(false);
              }
            }}
          >
            Test print
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            variant="outline"
            disabled={selected == null || busy}
            onClick={() => {
              clearUsbDevice();
              setActivePrinter("none");
              setReady(false);
              toast.info("USB printer removed from SEZA POS");
            }}
          >
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
