import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import {
  LayoutDashboard,
  ScanBarcode,
  Package,
  Users,
  BarChart3,
  Settings,
  Receipt,
  Boxes,
  LogOut,
  CircleUser,
  RotateCcw as _RotateCcw,
  Clock,
  UserPlus,
  ArrowLeftRight,
  Wallet as _Wallet,
  MoreVertical,
  Wifi,
  CreditCard,
  Printer,
  ScanLine,
  DollarSign,
  Monitor,
  Cloud,
  Mail,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const NAV: { to: string; label: string; icon: any; search?: Record<string, string> }[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/employees", label: "Employees", icon: UserPlus },
  { to: "/payroll", label: "Payroll", icon: BarChart3 },
  { to: "/shifts", label: "Shifts", icon: Receipt },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Billing", icon: CreditCard, search: { section: "billing" } },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Route locations that stringify to "path?key=value" for active-state matching.
function locKey(to: string, search?: Record<string, string>) {
  if (!search) return to;
  const qs = new URLSearchParams(search).toString();
  return qs ? `${to}?${qs}` : to;
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const currentSection = (location.search as { section?: string })?.section;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();

  // Force first-login employees through onboarding.
  useEffect(() => {
    if (!me?.profile) return;
    if (me.profile.must_change_password && pathname !== "/onboarding") {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [me, pathname, navigate]);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const handleSwitchEmployee = async () => {
    // Keep cache; go straight to keypad login.
    await supabase.auth.signOut();
    qc.clear();
    navigate({ to: "/auth", search: { mode: "keypad" }, replace: true });
  };

  const role = me?.roles?.[0];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <aside className="w-16 lg:w-60 border-r bg-surface/60 flex flex-col shrink-0">
        <div className="h-16 px-4 border-b flex items-center gap-3">
          <div className="size-8 bg-primary rounded-lg grid place-items-center text-primary-foreground font-bold">V</div>
          <div className="hidden lg:flex flex-col leading-tight">
            <span className="font-semibold tracking-tight text-sm">SEZA POS</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{me?.store?.name ?? "Store"}</span>
          </div>
        </div>
        <nav aria-label="Primary navigation" className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const wantSection = item.search?.section;
            let active: boolean;
            if (item.to === "/settings") {
              // Distinguish Billing (section=billing) from Settings (any other/none)
              active = pathname === "/settings" && (wantSection ? currentSection === wantSection : currentSection !== "billing");
            } else {
              active = pathname === item.to || (item.to !== "/pos" && pathname.startsWith(item.to + "/"));
            }
            return (
              <Link
                key={locKey(item.to, item.search)}
                to={item.to}
                search={item.search as any}
                aria-label={item.label}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden lg:block px-2 pt-2 pb-1 border-t">
          <LanguageSwitcher compact />
        </div>
        <div className="p-2 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent transition-colors text-left">
                <div className="size-8 rounded-full bg-muted grid place-items-center shrink-0">
                  <CircleUser className="size-5 text-muted-foreground" />
                </div>
                <div className="hidden lg:flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-semibold truncate">{me?.profile?.full_name ?? me?.user?.email}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{role ?? "user"}</span>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="text-xs font-normal text-muted-foreground">Signed in as</div>
                <div>{me?.user?.email}</div>
                {me?.profile?.employee_id && (
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    ID {me.profile.employee_id}
                  </div>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/timeclock" })}>
                <Clock className="size-4 mr-2" /> Time clock
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                <Settings className="size-4 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSwitchEmployee}>
                <ArrowLeftRight className="size-4 mr-2" /> Switch employee
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="size-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="h-16 border-b flex items-center justify-between px-6 shrink-0">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <Button asChild variant="outline" size="sm">
          <Link to="/pos"><ScanBarcode className="size-4 mr-2" />Open POS</Link>
        </Button>
        <DeviceStatusMenu />
      </div>
    </header>
  );
}

type StatusLevel = "connected" | "warning" | "disconnected";
type DeviceRow = { key: string; label: string; icon: React.ComponentType<{ className?: string }>; status: StatusLevel; hint?: string };

function readDeviceStatuses(online: boolean): DeviceRow[] {
  const read = (k: string, fallback: StatusLevel = "disconnected"): StatusLevel => {
    try {
      const raw = localStorage.getItem(`pos.hw.${k}.status`);
      if (raw === "connected" || raw === "warning" || raw === "disconnected") return raw;
    } catch { /* ignore */ }
    return fallback;
  };
  return [
    { key: "internet", label: "Internet Connection", icon: Wifi, status: online ? "connected" : "disconnected" },
    { key: "terminal", label: "Payment Terminal", icon: CreditCard, status: read("terminal") },
    { key: "printer", label: "Receipt Printer", icon: Printer, status: read("printer") },
    { key: "scanner", label: "Barcode Scanner", icon: ScanLine, status: read("scanner") },
    { key: "drawer", label: "Cash Drawer", icon: DollarSign, status: read("drawer") },
    { key: "display", label: "Customer Display", icon: Monitor, status: read("display") },
    { key: "cloud", label: "Cloud Sync", icon: Cloud, status: online ? "connected" : "warning" },
    { key: "email", label: "Email Service", icon: Mail, status: "connected" },
    { key: "sms", label: "SMS Service", icon: MessageSquare, status: read("sms", "disconnected") },
  ];
}

function StatusDot({ status }: { status: StatusLevel }) {
  const cls =
    status === "connected" ? "bg-success" :
    status === "warning" ? "bg-warning" : "bg-destructive";
  const label =
    status === "connected" ? "Connected" :
    status === "warning" ? "Warning" : "Disconnected";
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={cn("size-2.5 rounded-full", cls)} aria-hidden="true" />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function DeviceStatusMenu() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [rows, setRows] = useState<DeviceRow[]>(() => readDeviceStatuses(online));

  const refresh = () => {
    const nextOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    setOnline(nextOnline);
    setRows(readDeviceStatuses(nextOnline));
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    const on = () => refresh();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, [open]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Device status menu">
          <MoreVertical className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Device Status</span>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); refresh(); }}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <RefreshCw className="size-3" /> Refresh
          </button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto py-1">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between px-2 py-2 text-sm">
              <span className="flex items-center gap-2">
                <r.icon className="size-4 text-muted-foreground" />
                {r.label}
              </span>
              <StatusDot status={r.status} />
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex-1 grid place-items-center p-6">
        <div className="max-w-md text-center">
          <div className="size-12 rounded-2xl bg-muted grid place-items-center mx-auto mb-4">
            <Boxes className="size-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Coming next</h2>
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
          <Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button>
        </div>
      </div>
    </>
  );
}
