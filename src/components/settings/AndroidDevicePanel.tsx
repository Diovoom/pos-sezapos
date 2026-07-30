import { useEffect, useState } from "react";
import { LockKeyhole, MonitorUp, Power, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { deviceControl, type DeviceControlState } from "@/lib/device-control";
import { isNativeMode } from "@/lib/native";

const initial: DeviceControlState = { launchOnBoot: false, keepAwake: true, immersive: true, inLockTask: false, deviceOwner: false };

export function AndroidDevicePanel() {
  const native = isNativeMode();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!native) return;
    try { setState(await deviceControl.getState()); } catch { /* older APK */ }
  };
  useEffect(() => { void refresh(); }, [native]);

  const toggle = async (key: "launchOnBoot" | "keepAwake" | "immersive", enabled: boolean) => {
    setBusy(true);
    try {
      if (key === "launchOnBoot") await deviceControl.setLaunchOnBoot(enabled);
      if (key === "keepAwake") await deviceControl.setKeepAwake(enabled);
      if (key === "immersive") await deviceControl.setImmersive(enabled);
      setState((old) => ({ ...old, [key]: enabled }));
      toast.success("Android terminal setting updated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update terminal"); }
    finally { setBusy(false); }
  };

  if (!native) return null;
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><MonitorUp className="size-5"/>Android terminal mode</CardTitle><CardDescription>Controls for a dedicated SEZA POS machine. Full kiosk lockdown requires the hardware to provision SEZA as a device-owner app.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <Setting label="Open SEZA after reboot" checked={state.launchOnBoot} disabled={busy} onChange={(v)=>void toggle("launchOnBoot",v)} />
      <Setting label="Keep the POS screen awake" checked={state.keepAwake} disabled={busy} onChange={(v)=>void toggle("keepAwake",v)} />
      <Setting label="Hide Android navigation while SEZA is open" checked={state.immersive} disabled={busy} onChange={(v)=>void toggle("immersive",v)} />
      <div className="rounded-lg border p-3 text-sm"><div className="font-medium">Kiosk status</div><div className="text-muted-foreground">{state.inLockTask ? "Kiosk mode is active." : "Kiosk mode is not active."} {state.deviceOwner ? "This terminal is provisioned as device owner." : "Screen pinning may ask for Android confirmation until device-owner provisioning is completed."}</div></div>
      <div className="flex flex-wrap gap-2"><Button onClick={async()=>{setBusy(true);try{await deviceControl.startKiosk();await refresh();toast.success("Kiosk mode started");}catch(e){toast.error(e instanceof Error?e.message:"Unable to start kiosk mode");}finally{setBusy(false);}} disabled={busy}><LockKeyhole className="mr-2 size-4"/>Start kiosk</Button><Button variant="outline" onClick={async()=>{setBusy(true);try{await deviceControl.stopKiosk();await refresh();toast.success("Kiosk mode stopped");}catch(e){toast.error(e instanceof Error?e.message:"Unable to stop kiosk mode");}finally{setBusy(false);}} disabled={busy}>Stop kiosk</Button><Button variant="outline" onClick={()=>void deviceControl.relaunch()} disabled={busy}><RefreshCw className="mr-2 size-4"/>Restart SEZA</Button></div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><Power className="mt-0.5 size-3.5 shrink-0"/>Android can delay boot launching until the user unlocks the device. Test this on the exact terminal model.</p>
    </CardContent>
  </Card>;
}

function Setting({label,checked,disabled,onChange}:{label:string;checked:boolean;disabled:boolean;onChange:(v:boolean)=>void}) { return <div className="flex items-center justify-between gap-4"><Label>{label}</Label><Switch checked={checked} disabled={disabled} onCheckedChange={onChange}/></div>; }
