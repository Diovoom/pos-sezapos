import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, Power, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deviceControl,
  type DeviceControlState,
} from "@/lib/device-control";
import { isNativeMode } from "@/lib/native";
import { userFacingError } from "@/lib/errors/user-facing";

const initialState: DeviceControlState = {
  launchOnBoot: false,
  keepAwake: true,
  immersive: false,
  inLockTask: false,
  deviceOwner: false,
  brightness: 0.85,
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
      if (key === "launchOnBoot") await deviceControl.setLaunchOnBoot(enabled);
      if (key === "keepAwake") await deviceControl.setKeepAwake(enabled);
      if (key === "immersive") await deviceControl.setImmersive(enabled);
      setState((current) => ({ ...current, [key]: enabled }));
      toast.success("Android terminal setting updated");
    } catch (error) {
      toast.error(userFacingError(error, "Unable to update terminal setting."));
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
      toast.error(userFacingError(error, "Unable to start kiosk mode."));
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
      toast.error(userFacingError(error, "Unable to stop kiosk mode."));
    } finally {
      setBusy(false);
    }
  };

  const restartSeza = async () => {
    setBusy(true);
    try {
      await deviceControl.relaunch();
    } catch (error) {
      toast.error(userFacingError(error, "Unable to restart SEZA."));
      setBusy(false);
    }
  };

  if (!native) return null;

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Startup & display
        </div>
        <div className="overflow-hidden rounded-lg border bg-background">
          <ToggleRow
            label="Open SEZA after reboot"
            description="Launch the register automatically after Android starts."
            checked={state.launchOnBoot}
            disabled={busy}
            onChange={(enabled) => void toggle("launchOnBoot", enabled)}
          />
          <ToggleRow
            label="Keep screen awake"
            description="Prevent the cashier screen from sleeping during a shift."
            checked={state.keepAwake}
            disabled={busy}
            onChange={(enabled) => void toggle("keepAwake", enabled)}
          />
          <ToggleRow
            label="Hide Android navigation"
            description="Use immersive mode while SEZA is open."
            checked={state.immersive}
            disabled={busy}
            onChange={(enabled) => void toggle("immersive", enabled)}
          />
        </div>
      </section>

      <section>
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Kiosk mode
        </div>
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="flex min-h-[54px] items-center justify-between gap-4 border-b px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium">Kiosk status</div>
              <div className="text-[11px] leading-4 text-muted-foreground">
                {state.inLockTask ? "Active" : "Not active"}
                {state.deviceOwner ? " · Device owner enabled" : " · Android confirmation may be required"}
              </div>
            </div>
            <LockKeyhole className="size-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="flex flex-wrap gap-2 px-3 py-3">
            <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => void startKiosk()}>
              <LockKeyhole className="mr-1.5 size-3.5" />
              Start kiosk
            </Button>
            <Button size="sm" className="h-8 text-xs" variant="outline" disabled={busy} onClick={() => void stopKiosk()}>
              Stop kiosk
            </Button>
            <Button size="sm" className="h-8 text-xs" variant="outline" disabled={busy} onClick={() => void restartSeza()}>
              <RefreshCw className="mr-1.5 size-3.5" />
              Restart SEZA
            </Button>
          </div>
        </div>
      </section>

      <p className="flex items-start gap-2 px-1 text-[11px] leading-4 text-muted-foreground">
        <Power className="mt-0.5 size-3.5 shrink-0" />
        Android can delay boot launching until the device is unlocked. Test kiosk behavior on the exact SEZA hardware model.
      </p>
    </div>
  );
}

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
};

function ToggleRow({ label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex min-h-[54px] items-center justify-between gap-4 border-b px-3 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
