import { CreditCard } from "lucide-react";
import { PaymentTerminalsPanel } from "@/components/settings/PaymentTerminalsPanel";
import { usePermissions } from "@/hooks/usePermissions";

export function PaymentTerminalPage() {
  const permissions = usePermissions();
  const canEdit = permissions.isSuper || permissions.isManager || permissions.has("hardware.configure");

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/25">
      <div className="shrink-0 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <CreditCard className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-black">Payment terminal</h1>
            <p className="text-xs text-muted-foreground">
              Connect and select the card terminal used by this register.
            </p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24">
        <div className="mx-auto max-w-4xl">
          <PaymentTerminalsPanel canEdit={canEdit} />
          <p className="mt-3 text-xs text-muted-foreground">
            Automatic card approvals require a supported processor account and compatible terminal.
          </p>
        </div>
      </div>
    </div>
  );
}
