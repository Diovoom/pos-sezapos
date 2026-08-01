import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Monitor, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import {
  listNativeCustomerDisplays,
  nativeCustomerDisplayStatus,
  startNativeCustomerDisplay,
  stopNativeCustomerDisplay,
  type NativeDisplayInfo,
} from "@/lib/hardware/customer-display-native";
import { publishCustomerDisplay } from "@/lib/pos/customer-display-sync";

export function NativeCustomerDisplayPanel({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [displays, setDisplays] = useState<NativeDisplayInfo[]>([]);
  const [running, setRunning] = useState(false);
  const [activeId, setActiveId] = useState(-1);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const [list, status] = await Promise.all([listNativeCustomerDisplays(), nativeCustomerDisplayStatus()]);
      setDisplays(list.displays);
      setRunning(status.running);
      setActiveId(status.displayId);
    } catch (error) {
      toast.error(userFacingError(error, "Could not detect the customer display"));
    } finally { setBusy(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const sendPreview = async () => {
    await publishCustomerDisplay({
      type: "seza-pos-display",
      version: 2,
      storeId,
      storeName,
      currency: "USD",
      phase: "sale",
      lines: [
        { id: "preview-1", name: "SEZA customer display test", qty: 1, unitPrice: 2.99, lineTotal: 2.99 },
        { id: "preview-2", name: "Printer & display ready", qty: 1, unitPrice: 1.0, lineTotal: 1.0 },
      ],
      subtotal: 3.99,
      discount: 0,
      tax: 0.24,
      total: 4.23,
      updatedAt: new Date().toISOString(),
    });
    toast.success("Test order sent to the customer display");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Monitor className="size-5" /> Customer display</span>
          <Badge variant="outline" className={running ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"}>
            {running ? <CheckCircle2 className="mr-1 size-3" /> : <XCircle className="mr-1 size-3" />}
            {running ? "Running" : "Not started"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Opens the SEZA customer order screen on the second physical display. The cashier stays on the main touchscreen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />} Detect displays
        </Button>
        {displays.length === 0 && !busy ? <p className="text-sm text-muted-foreground">No Android presentation display detected. Make sure extended desktop mode is active.</p> : null}
        <div className="space-y-2">
          {displays.map((display) => (
            <div key={display.displayId} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{display.name || `Display ${display.displayId}`}</p>
                <p className="text-xs text-muted-foreground">Display ID {display.displayId}{activeId === display.displayId ? " · Active" : ""}</p>
              </div>
              <Button disabled={busy || (running && activeId === display.displayId)} onClick={async () => {
                setBusy(true);
                try {
                  await startNativeCustomerDisplay(display.displayId, storeId);
                  localStorage.setItem("pos.hw.display.status", "connected");
                  localStorage.setItem("pos.hw.display.lastSeen", String(Date.now()));
                  setRunning(true); setActiveId(display.displayId);
                  await sendPreview();
                  toast.success("Customer display started");
                } catch (error) {
                  toast.error(userFacingError(error, "Could not start the customer display"));
                } finally { setBusy(false); }
              }}>{running && activeId === display.displayId ? "Active" : "Use this display"}</Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button disabled={!running || busy} onClick={() => void sendPreview()}>Send test order</Button>
          <Button variant="outline" disabled={!running || busy} onClick={async () => {
            setBusy(true);
            try {
              await stopNativeCustomerDisplay();
              localStorage.setItem("pos.hw.display.status", "disconnected");
              setRunning(false); setActiveId(-1);
              toast.info("Customer display stopped");
            } finally { setBusy(false); }
          }}>Stop display</Button>
        </div>
      </CardContent>
    </Card>
  );
}
