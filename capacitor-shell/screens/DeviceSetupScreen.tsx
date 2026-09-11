import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Monitor, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeUsbPrinterPanel } from "@/components/settings/NativeUsbPrinterPanel";
import { NativeScannerPanel } from "@/components/settings/NativeScannerPanel";
import { NativeDrawerPanel } from "@/components/settings/NativeDrawerPanel";
import { PaymentTerminalsPanel } from "@/components/settings/PaymentTerminalsPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { useMe } from "@/hooks/useMe";
import {
  CUSTOMER_DISPLAY_LOCAL_KEYS,
  normalizeCustomerDisplaySettings,
} from "@/lib/customer-display-preferences";

export const DEVICE_SETUP_KEY = "seza.device_setup_completed_v1";

export function needsDeviceSetup(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEVICE_SETUP_KEY) !== "1";
}

export function DeviceSetupScreen() {
  const navigate = useNavigate();
  const permissions = usePermissions();
  const me = useMe();
  const canConfigure = permissions.isSuper || permissions.isManager || permissions.has("hardware.configure");
  const ownerDisplay = normalizeCustomerDisplaySettings((me.data?.store as any)?.customer_display_settings);
  const [message, setMessage] = useState(() => ownerDisplay.welcomeMessage || "Welcome");
  const [textScale, setTextScale] = useState(() => String(Math.round((ownerDisplay.textScale || 1) * 100)));

  const finish = () => {
    localStorage.setItem("pos.customerDisplay.autoStart", "1");
    localStorage.setItem(CUSTOMER_DISPLAY_LOCAL_KEYS.idleMode, "message");
    localStorage.setItem(
      CUSTOMER_DISPLAY_LOCAL_KEYS.welcomeMessage,
      message.trim().slice(0, 48) || "Welcome",
    );
    const scale = Math.min(180, Math.max(80, Number(textScale) || 100)) / 100;
    localStorage.setItem(CUSTOMER_DISPLAY_LOCAL_KEYS.textScale, String(scale));
    localStorage.setItem(DEVICE_SETUP_KEY, "1");
    window.dispatchEvent(new Event("seza:device-config-changed"));
    toast.success("Register setup saved");
    navigate({ to: "/pos", replace: true });
  };

  return (
    <div className="min-h-dvh overflow-y-auto bg-muted/25 p-4 pb-10 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-5 text-primary" /> Finish this register setup
            </CardTitle>
            <CardDescription>
              Physical hardware is configured here on the Android POS after pairing. The Owner Dashboard no longer tries to connect devices from a phone or computer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border bg-primary/5 p-3">
              <Monitor className="mt-0.5 size-5 text-primary" />
              <div>
                <div className="font-semibold">Customer display is automatic</div>
                <div className="text-sm text-muted-foreground">
                  On supported dual-screen hardware, SEZA starts the customer display automatically. There is no Detect & Connect step.
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <Label htmlFor="first-display-message">Customer welcome message</Label>
                <Input
                  id="first-display-message"
                  value={message}
                  maxLength={48}
                  onChange={(event) => setMessage(event.target.value.slice(0, 48))}
                  placeholder="Welcome to our store"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="first-display-scale">Text size (%)</Label>
                <Input
                  id="first-display-scale"
                  type="number"
                  inputMode="numeric"
                  min={80}
                  max={180}
                  step={10}
                  value={textScale}
                  onChange={(event) => setTextScale(event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {canConfigure ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <NativeUsbPrinterPanel />
              <NativeScannerPanel />
              <NativeDrawerPanel />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Payment terminal</CardTitle>
                <CardDescription>
                  Discover, pair, reconnect, and test the physical card reader from this register.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PaymentTerminalsPanel canEdit={canConfigure} canOperate />
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              A manager or owner PIN is required to change this register's hardware. You can continue to the POS and complete hardware setup later from App settings.
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={finish}>Skip for now</Button>
          <Button onClick={finish}>
            <CheckCircle2 className="mr-2 size-4" /> Finish & open POS
          </Button>
        </div>
      </div>
    </div>
  );
}
