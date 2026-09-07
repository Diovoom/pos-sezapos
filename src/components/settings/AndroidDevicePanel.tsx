import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, MonitorUp, Power, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deviceControl,
  type DeviceControlState,
} from "@/lib/device-control";
import { isNativeMode } from "@/lib/native";

const initialState: DeviceControlState = {
  launchOnBoot: false,
  keepAwake: true,
  immersive: false,
  inLockTask: false,
  deviceOwner: false,
};

export function AndroidDevicePanel() {
  const native = isNativeMode();
  const [state, setState] = useState<DeviceControlState>(initialState);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!native) return;

    try {
      setState(await deviceControl.getState());
    } catch {
      // Older APK versions may not have the native device-control plugin.
    }
  }, [native]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = async (
    key: "launchOnBoot" | "keepAwake" | "immersive",
    enabled: boolean,
  ) => {
    setBusy(true);

    try {
      if (key === "launchOnBoot") {
        await deviceControl.setLaunchOnBoot(enabled);
      }

      if (key === "keepAwake") {
        await deviceControl.setKeepAwake(enabled);
      }

      if (key === "immersive") {
        await deviceControl.setImmersive(enabled);
      }

      setState((current) => ({ ...current, [key]: enabled }));
      toast.success("Setting updated");
    } catch (error) {
      toast.error("This setting could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const startKiosk = async () => {
    setBusy(true);

    try {
      await deviceControl.startKiosk();
      await refresh();
      toast.success("Kiosk mode started");
    } catch (error) {
      toast.error("Kiosk mode could not be started.");
    } finally {
      setBusy(false);
    }
  };

  const stopKiosk = async () => {
    setBusy(true);

    try {
      await deviceControl.stopKiosk();
      await refresh();
      toast.success("Kiosk mode stopped");
    } catch (error) {
      toast.error("Kiosk mode could not be stopped.");
    } finally {
      setBusy(false);
    }
  };

  const restartSeza = async () => {
    setBusy(true);

    try {
      await deviceControl.relaunch();
    } catch (error) {
      toast.error("SEZA could not restart. Please try again.");
      setBusy(false);
    }
  };

  if (!native) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorUp className="size-5" />
          Android terminal mode
        </CardTitle>
        <CardDescription>
          Control how SEZA behaves on this Android register.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <Setting
          label="Open SEZA after reboot"
          checked={state.launchOnBoot}
          disabled={busy}
          onChange={(enabled) => void toggle("launchOnBoot", enabled)}
        />

        <Setting
          label="Keep the POS screen awake"
          checked={state.keepAwake}
          disabled={busy}
          onChange={(enabled) => void toggle("keepAwake", enabled)}
        />

        <Setting
          label="Hide Android navigation while SEZA is open"
          checked={state.immersive}
          disabled={busy}
          onChange={(enabled) => void toggle("immersive", enabled)}
        />

        <div className="rounded-lg border p-3 text-sm">
          <div className="font-medium">Kiosk status</div>
          <div className="text-muted-foreground">
            {state.inLockTask
              ? "Kiosk mode is active."
              : "Kiosk mode is not active."}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void startKiosk()}>
            <LockKeyhole className="mr-2 size-4" />
            Start kiosk
          </Button>

          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void stopKiosk()}
          >
            Stop kiosk
          </Button>

          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void restartSeza()}
          >
            <RefreshCw className="mr-2 size-4" />
            Restart SEZA
          </Button>
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Power className="mt-0.5 size-3.5 shrink-0" />
          Some Android devices may wait until the screen is unlocked before opening SEZA after a restart.
        </p>
      </CardContent>
    </Card>
  );
}

type SettingProps = {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
};

function Setting({ label, checked, disabled, onChange }: SettingProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label>{label}</Label>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}
