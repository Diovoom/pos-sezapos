import { useRef, type TouchEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Clock,
  CreditCard,
  MonitorCog,
  RotateCcw,
  Settings,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useMe } from "@/hooks/useMe";
import { usePermissions } from "@/hooks/usePermissions";
import { ManagerSupportFooter } from "@/components/pos/ManagerSupportFooter";

type Tool = {
  label: string;
  description: string;
  icon: typeof Clock;
  to: string;
  managerOnly?: boolean;
};

export function PosManagerDashboardDialog({
  open,
  onOpenChange,
  storeName,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  storeId: string;
  storeName: string;
}) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const permissions = usePermissions();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const role = String(me?.roles?.[0] ?? "cashier").toLowerCase();
  const isManager =
    permissions.isSuper ||
    permissions.isManager ||
    me?.roles?.includes("super_admin") === true;

  const go = (to: string) => {
    try {
      sessionStorage.removeItem("seza.openManagerDashboard");
      sessionStorage.setItem("seza.posToolOrigin", "manager-dashboard");
    } catch {
      // sessionStorage can be unavailable in restricted/private browser contexts.
    }
    onOpenChange(false);
    navigate({ to: to as any });
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if ((scrollRef.current?.scrollTop ?? 0) > 0) {
      swipeStart.current = null;
      return;
    }
    const touch = event.touches[0];
    swipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchMove = () => {
    if ((scrollRef.current?.scrollTop ?? 0) > 0) swipeStart.current = null;
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || (scrollRef.current?.scrollTop ?? 0) > 0) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dy = touch.clientY - start.y;
    const dx = Math.abs(touch.clientX - start.x);
    if (dy >= 90 && dy > dx * 1.25) onOpenChange(false);
  };

  const tools: Tool[] = [
    {
      label: "Refunds & receipts",
      description: "Find sales, refunds, returns, and reprints.",
      icon: RotateCcw,
      to: "/refunds",
    },
    {
      label: "Peripheral hardware",
      description: "Printer, scanner, drawer, and customer display.",
      icon: MonitorCog,
      to: "/manager-tools",
    },
    {
      label: "Clock & shift review",
      description: "Time clock, shift review, and closeout.",
      icon: Clock,
      to: "/timeclock",
    },
    {
      label: "Register",
      description: "Drawer, payouts, deposits, and cash controls.",
      icon: Wallet,
      to: "/register",
    },
    {
      label: "Payment terminal",
      description: "Check or reconnect the card reader.",
      icon: CreditCard,
      to: "/payment-terminal",
    },
    {
      label: "App settings",
      description: "Register, receipt, display, and sync settings.",
      icon: Settings,
      to: "/settings",
      managerOnly: true,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[82dvh] w-[min(94vw,920px)] max-w-[920px] flex-col gap-0 overflow-hidden rounded-lg p-0 shadow-xl"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-11 text-left">
          <DialogTitle className="text-base font-semibold">
            {isManager ? "Manager dashboard" : "Dashboard"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {storeName} · {role}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-5"
        >
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {tools
              .filter((tool) => isManager || !tool.managerOnly)
              .map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  onClick={() => go(tool.to)}
                  className="group min-h-[92px] rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-muted/40 text-primary">
                      <tool.icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-5">{tool.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                        {tool.description}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
          </div>
          <div className="mt-3 border-t pt-2">
            <ManagerSupportFooter />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
