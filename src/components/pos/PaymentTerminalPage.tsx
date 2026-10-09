import { PaymentTerminalsPanel } from "@/components/settings/PaymentTerminalsPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { ManagerSupportFooter } from "@/components/pos/ManagerSupportFooter";

export function PaymentTerminalPage() {
  const permissions = usePermissions();
  const canConfigure = permissions.isSuper || permissions.isManager || permissions.has("hardware.configure");
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b px-4 py-3"><h1 className="text-sm font-semibold">Payment terminal</h1></div>
      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4 pb-20">
        <div className="mx-auto max-w-4xl space-y-6">
          <PaymentTerminalsPanel canEdit={canConfigure} canOperate />
          <ManagerSupportFooter />
        </div>
      </div>
    </div>
  );
}
