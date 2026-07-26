import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import {
  type HardwareKind,
  type DeviceInfo,
  getDevice,
  subscribe,
  removeDevice,
  testDevice,
  connectUsb,
  connectBluetooth,
  connectSerial,
  connectHid,
  support,
} from "@/lib/pos/hardware";
import { logAudit } from "@/lib/audit-log";

type Transport = "usb" | "bluetooth" | "serial" | "hid";

export function HardwareCard({
  kind,
  title,
  description,
  transports,
}: {
  kind: HardwareKind;
  title: string;
  description: string;
  transports: Transport[];
}) {
  const [device, setDevice] = useState<DeviceInfo | undefined>(() => getDevice(kind));
  const [busy, setBusy] = useState<Transport | null>(null);

  useEffect(() => subscribe(() => setDevice(getDevice(kind))), [kind]);

  const supportedMap: Record<Transport, boolean> = {
    usb: support.usb,
    bluetooth: support.bluetooth,
    serial: support.serial,
    hid: support.hid,
  };

  const connect = async (t: Transport) => {
    setBusy(t);
    try {
      const fn = {
        usb: connectUsb,
        bluetooth: connectBluetooth,
        serial: connectSerial,
        hid: connectHid,
      }[t];
      const info = await fn(kind);
      toast.success(`${title} connected: ${info.name}`);
      void logAudit({
        action: "hardware.connect",
        entity: kind,
        details: { transport: t, name: info.name },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      if (!msg.toLowerCase().includes("cancel")) toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = () => {
    if (!device) return;
    removeDevice(device.id);
    toast.info(`${title} disconnected`);
    void logAudit({ action: "hardware.disconnect", entity: kind, details: { name: device.name } });
  };

  const test = async () => {
    if (!device) return;
    const r = await testDevice(device.id);
    void logAudit({ action: "hardware.test", entity: kind, details: r });
    r.ok ? toast.success(r.message) : toast.error(r.message);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          {device ? (
            <Badge className="gap-1 bg-success/15 text-success border-success/30" variant="outline">
              <CheckCircle2 className="size-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <XCircle className="size-3" /> Disconnected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {device && (
          <div className="rounded-md border bg-surface/40 p-3 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Name:</span> {device.name}
            </div>
            <div>
              <span className="text-muted-foreground">Transport:</span>{" "}
              {device.transport.toUpperCase()}
            </div>
            {device.detail?.serial ? (
              <div>
                <span className="text-muted-foreground">Serial:</span>{" "}
                {String(device.detail.serial)}
              </div>
            ) : null}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {transports.map((t) => (
            <Button
              key={t}
              variant="outline"
              size="sm"
              disabled={!supportedMap[t] || busy !== null}
              onClick={() => connect(t)}
            >
              {busy === t && <Loader2 className="size-3 animate-spin mr-1" />}
              Connect {t.toUpperCase()}
              {!supportedMap[t] && (
                <span className="ml-1 text-[10px] text-muted-foreground">(unsupported)</span>
              )}
            </Button>
          ))}
          {device && (
            <Button variant="outline" size="sm" onClick={test}>
              Test
            </Button>
          )}
          {device && (
            <Button variant="ghost" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          )}
        </div>
        {transports.every((t) => !supportedMap[t]) && (
          <p className="text-xs text-muted-foreground">
            This browser doesn't expose the required Web APIs. Use Chrome or Edge over HTTPS for
            hardware access.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
