import { createFileRoute } from "@tanstack/react-router";
import { MonitorCog } from "lucide-react";
import { NativeUsbPrinterPanel } from "@/components/settings/NativeUsbPrinterPanel";
import { NativeScannerPanel } from "@/components/settings/NativeScannerPanel";
import { NativeDrawerPanel } from "@/components/settings/NativeDrawerPanel";
import { NativeCustomerDisplayPanel } from "@/components/settings/NativeCustomerDisplayPanel";
import { useMe } from "@/hooks/useMe";
import { ManagerSupportFooter } from "@/components/pos/ManagerSupportFooter";

export const Route = createFileRoute("/_pos/manager-tools")({
  ssr: false,
  component: PosManagerToolsPage,
});

export function PosManagerToolsPage() {
  const { data: me } = useMe();
  const storeId = String(me?.store?.id ?? "");
  const storeName = String(me?.store?.name ?? "SEZA POS");

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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-4 lg:grid-cols-2">
            <NativeUsbPrinterPanel />
            <NativeScannerPanel />
            <NativeDrawerPanel />
            {storeId ? (
              <NativeCustomerDisplayPanel storeId={storeId} storeName={storeName} />
            ) : null}
          </div>
          <ManagerSupportFooter />
        </div>
      </div>
    </div>
  );
}
