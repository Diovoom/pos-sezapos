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
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MonitorCog className="size-4 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">Peripheral hardware</h1>
            <p className="text-[11px] text-muted-foreground">
              Configure hardware connected to this register.
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-3 pb-20 [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto max-w-6xl space-y-3">
          <div className="grid gap-3 lg:grid-cols-3">
            <NativeUsbPrinterPanel />
            <NativeScannerPanel />
            <NativeDrawerPanel />
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2.5">
            <Monitor className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <div className="text-sm font-medium">Customer display</div>
              <div className="text-[11px] leading-4 text-muted-foreground">
                Supported dual-screen SEZA hardware connects automatically. Customize it from App settings → Customer display.
              </div>
            </div>
          </div>

          <ManagerSupportFooter />
        </div>
      </div>
    </div>
  );
}
