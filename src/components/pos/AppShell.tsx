import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
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
  RotateCcw,
  Clock,
  UserPlus,
  ArrowLeftRight,
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

const NAV = [
  { to: "/pos", label: "Checkout", icon: ScanBarcode },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/refunds", label: "Refunds", icon: RotateCcw },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/employees", label: "Employees", icon: UserPlus },
  { to: "/timeclock", label: "Time Clock", icon: Clock },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
            <span className="font-semibold tracking-tight text-sm">Velocity POS</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{me?.store?.name ?? "Store"}</span>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || (item.to !== "/pos" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
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
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
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
          <Button asChild variant="outline"><Link to="/pos">Back to checkout</Link></Button>
        </div>
      </div>
    </>
  );
}
