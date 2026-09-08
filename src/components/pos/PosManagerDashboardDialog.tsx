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
  const isManager = permissions.isSuper || permissions.isManager || me?.roles?.includes("super_admin") === true;

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
      description: "Find a sale, prepare a refund or return, and reprint receipts.",
      icon: RotateCcw,
      to: "/refunds",
    },
    {
      label: "Peripheral hardware",
      description: "Configure and test the printer, scanner, cash drawer, and customer display.",
      icon: MonitorCog,
      to: "/manager-tools",
    },
    {
      label: "Clock & Shift review",
      description: "Clock in or out, review time entries, and review or close the current shift.",
      icon: Clock,
      to: "/timeclock",
    },
    {
      label: "Register",
      description: "Open the cash drawer and record payouts or deposits.",
      icon: Wallet,
      to: "/register",
    },
    {
      label: "Payment terminal",
      description: "Check or reconnect the card terminal used by this register.",
      icon: CreditCard,
      to: "/payment-terminal",
    },
    {
      label: "App settings",
      description: "Register preferences, receipts, sync, Android behavior, and app settings.",
      icon: Settings,
      to: "/settings",
      managerOnly: true,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[94dvh] max-w-6xl flex-col overflow-hidden p-0 overscroll-contain"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex shrink-0 justify-center pt-2" aria-hidden="true">
          <span className="h-1 w-12 rounded-full bg-muted-foreground/30" />
        </div>
        <DialogHeader className="border-b px-4 pb-4 pt-2 pr-12 text-left">
          <DialogTitle>{isManager ? "Manager dashboard" : "Dashboard"}</DialogTitle>
          <DialogDescription>
            Tools available to {role} at {storeName}. The current employee stays signed in.
          </DialogDescription>
        </DialogHeader>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] touch-pan-y p-4 pb-24">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools
              .filter((tool) => isManager || !tool.managerOnly)
              .map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  onClick={() => go(tool.to)}
                  className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/50 hover:bg-muted/30"
                >
                  <tool.icon className="size-5 text-primary" />
                  <div className="mt-3 font-bold">{tool.label}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{tool.description}</div>
                </button>
              ))}
          </div>
          <ManagerSupportFooter />
        </div>
      </DialogContent>
    </Dialog>
  );
}
