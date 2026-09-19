import { useRef, type TouchEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ChevronRight,
  Clock,
  Cloud,
  CreditCard,
  LifeBuoy,
  MonitorCog,
  RotateCcw,
  Settings,
  Wallet,
  X,
} from "lucide-react";
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

const quickTools: Tool[] = [
  {
    label: "Clock & shift review",
    description: "Clock in or out, review time entries, and close the current shift.",
    icon: Clock,
    to: "/timeclock",
  },
];

const operationTools: Tool[] = [
  {
    label: "Refunds & receipts",
    description: "Find a sale, refund, return, exchange, or reprint a receipt.",
    icon: RotateCcw,
    to: "/refunds",
  },
  {
    label: "Register",
    description: "Cash drawer, payouts, deposits, safe drops, and drawer controls.",
    icon: Wallet,
    to: "/register",
  },
];

const setupTools: Tool[] = [
  {
    label: "Hardware",
    description: "Receipt printer, scanner, and cash drawer.",
    icon: MonitorCog,
    to: "/manager-tools",
  },
  {
    label: "Payment terminal",
    description: "Reader M2 status, connection, and payment-terminal setup.",
    icon: CreditCard,
    to: "/payment-terminal",
  },
  {
    label: "Settings",
    description: "Register, display, receipts, hardware, sync, Android, and support.",
    icon: Settings,
    to: "/settings",
    managerOnly: true,
  },
];

const systemTools: Tool[] = [
  {
    label: "Offline & sync queue",
    description: "Review work waiting to sync and retry pending records.",
    icon: Cloud,
    to: "/pending-sync",
  },
  {
    label: "SEZA Support",
    description: "Open support, follow cases, and request help with this register.",
    icon: LifeBuoy,
    to: "/support",
  },
];

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

  const visibleQuick = quickTools.filter((tool) => isManager || !tool.managerOnly);
  const visibleOperations = operationTools.filter((tool) => isManager || !tool.managerOnly);
  const visibleSetup = setupTools.filter((tool) => isManager || !tool.managerOnly);
  const visibleSystem = systemTools.filter((tool) => isManager || !tool.managerOnly);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/20" />

        <DialogPrimitive.Content
          className="fixed inset-0 z-[71] flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden border-0 bg-background p-0 shadow-none outline-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <DialogPrimitive.Title className="sr-only">Store menu</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Register tools and settings for {storeName}
          </DialogPrimitive.Description>

          <div className="relative shrink-0 border-b bg-background px-4 py-3 pr-12">
            <div className="truncate text-xs font-medium text-muted-foreground">{storeName}</div>

            <DialogPrimitive.Close
              className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close store menu"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain bg-muted/20 p-3 pb-[calc(2rem+env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] md:p-4"
          >
            <div className="mb-4">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quick actions
              </div>
              <div className="grid grid-cols-3 gap-2">
                {visibleQuick.map((tool) => (
                  <button
                    key={`quick-${tool.label}`}
                    type="button"
                    onClick={() => go(tool.to)}
                    className="flex min-h-[66px] flex-col items-center justify-center gap-1 rounded-lg border bg-background px-2 py-2 text-center transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <tool.icon className="size-4 text-primary" />
                    <span className="text-xs font-semibold leading-4">{tool.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <MenuSection title="Operations" tools={visibleOperations} onSelect={go} />
            <MenuSection title="Register setup" tools={visibleSetup} onSelect={go} />
            <MenuSection title="System" tools={visibleSystem} onSelect={go} />

            <div className="mt-4 border-t pt-2">
              <ManagerSupportFooter />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function MenuSection({
  title,
  tools,
  onSelect,
}: {
  title: string;
  tools: Tool[];
  onSelect: (to: string) => void;
}) {
  if (!tools.length) return null;

  return (
    <section className="mb-4">
      <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="overflow-hidden rounded-lg border bg-background">
        {tools.map((tool) => (
          <button
            key={`${title}-${tool.label}`}
            type="button"
            onClick={() => onSelect(tool.to)}
            className="flex min-h-[54px] w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <tool.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-5">{tool.label}</span>
              <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                {tool.description}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </section>
  );
}
