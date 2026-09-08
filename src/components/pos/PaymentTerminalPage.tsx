import { CreditCard, ExternalLink, Usb } from "lucide-react";
import { PaymentTerminalsPanel } from "@/components/settings/PaymentTerminalsPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ManagerSupportFooter } from "@/components/pos/ManagerSupportFooter";

export function PaymentTerminalPage() {
  const permissions = usePermissions();
  const canConfigure =
    permissions.isSuper || permissions.isManager || permissions.has("hardware.configure");
  // Reconnecting an already-prepared reader is a register operation, not merchant-account setup.
  // Any signed-in register employee can recover the reader if it disconnects mid-shift.
  const canOperate = true;

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/25">
      <div className="shrink-0 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <CreditCard className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-black">Payment terminal</h1>
            <p className="text-xs text-muted-foreground">
              Check or reconnect the certified card reader used by this register.
            </p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] touch-pan-y p-4 pb-24">
        <div className="mx-auto max-w-4xl space-y-4">
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2">
              <div className="flex gap-3">
                <Usb className="mt-0.5 size-5 text-primary" />
                <div><p className="font-bold">On this Android register</p><p className="text-sm text-muted-foreground">Detect, pair, test, assign, or disconnect the physical reader. Plugging in USB only detects the device; the processor connector must still approve and pair it.</p></div>
              </div>
              <div className="flex gap-3">
                <ExternalLink className="mt-0.5 size-5 text-primary" />
                <div className="space-y-2"><p className="font-bold">On the Owner Dashboard</p><p className="text-sm text-muted-foreground">Connect the processor account, complete merchant verification, and securely add the settlement bank account.</p><Button asChild size="sm"><a href="https://dashboard.sezapos.com/settings?section=terminal" target="_blank" rel="noreferrer">Open owner payment setup</a></Button></div>
              </div>
            </CardContent>
          </Card>
          <PaymentTerminalsPanel canEdit={canConfigure} canOperate={canOperate} />
          <p className="mt-3 text-xs text-muted-foreground">
            A saved terminal is not considered connected until its provider SDK confirms the physical reader.
          </p>
          <ManagerSupportFooter />
        </div>
      </div>
    </div>
  );
}
