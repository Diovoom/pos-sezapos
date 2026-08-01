import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock, Cloud, Monitor, Receipt, RotateCcw, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeUsbPrinterPanel } from "@/components/settings/NativeUsbPrinterPanel";
import { NativeScannerPanel } from "@/components/settings/NativeScannerPanel";
import { NativeDrawerPanel } from "@/components/settings/NativeDrawerPanel";
import { NativeCustomerDisplayPanel } from "@/components/settings/NativeCustomerDisplayPanel";
import { useMe } from "@/hooks/useMe";

export const Route = createFileRoute("/_pos/manager-tools")({
  ssr: false,
  component: PosManagerToolsPage,
});

function PosManagerToolsPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const storeId = String(me?.store?.id ?? "");
  const storeName = String(me?.store?.name ?? "SEZA POS");

  const tools = [
    { label: "Refunds & returns", description: "Find a transaction and approve a return without switching the cashier.", icon: RotateCcw, to: "/refunds" },
    { label: "Receipt lookup", description: "Review transactions and reprint completed receipts.", icon: Receipt, to: "/refunds" },
    { label: "Shift & drawer", description: "Review the open register session, safe drops, and close the shift.", icon: Clock, to: "/register" },
    { label: "Time clock", description: "Clock employees in or out and review the current employee status.", icon: Users, to: "/timeclock" },
    { label: "Pending synchronization", description: "See sales waiting for SEZA Cloud and retry synchronization.", icon: Cloud, to: "/pending-sync" },
    { label: "POS settings", description: "Register behavior, kiosk mode, updates, and device preferences.", icon: Settings, to: "/settings" },
  ] as const;

  return (
    <div className="h-full overflow-y-auto bg-muted/25">
      <div className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6 md:pb-10">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => navigate({ to: "/pos" })} aria-label="Back to checkout">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">Manager dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Protected POS tools for {storeName}. The cashier remains signed in.</p>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <button key={tool.label} type="button" onClick={() => navigate({ to: tool.to as any })} className="rounded-xl border bg-background p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md">
              <tool.icon className="size-5 text-primary" />
              <h2 className="mt-3 font-bold">{tool.label}</h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{tool.description}</p>
            </button>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Monitor className="size-5" /> Hardware setup & testing</CardTitle>
            <CardDescription>Configure the hardware attached to this Android register. These settings stay on this POS device.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <NativeUsbPrinterPanel />
            <NativeDrawerPanel />
            <NativeScannerPanel />
            {storeId ? <NativeCustomerDisplayPanel storeId={storeId} storeName={storeName} /> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
