import { createFileRoute } from "@tanstack/react-router";
import { Monitor, MonitorCog } from "lucide-react";
import { NativeUsbPrinterPanel } from "@/components/settings/NativeUsbPrinterPanel";
import { NativeScannerPanel } from "@/components/settings/NativeScannerPanel";
import { NativeDrawerPanel } from "@/components/settings/NativeDrawerPanel";
import { ManagerSupportFooter } from "@/components/pos/ManagerSupportFooter";

export const Route = createFileRoute("/_pos/manager-tools")({
  ssr: false,
  component: PosManagerToolsPage,
});

export function PosManagerToolsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/25">
      <div className="shrink-0 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <MonitorCog className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-black">Peripheral hardware</h1>
            <p className="text-xs text-muted-foreground">
              Configure hardware physically connected to this Android register.
            </p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] p-4 pb-24">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <NativeUsbPrinterPanel />
            <NativeScannerPanel />
            <NativeDrawerPanel />
          </div>
          <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
            <Monitor className="mt-0.5 size-5 text-primary" />
            <div>
              <div className="font-semibold">Customer display connects automatically</div>
              <div className="text-sm text-muted-foreground">
                On supported dual-screen SEZA hardware there is no manual Detect & Connect step. Customize the idle message, image, and text size from App settings → Customer display.
              </div>
            </div>
          </div>
          <ManagerSupportFooter />
        </div>
      </div>
    </div>
  );
}
