import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import {
  ScanBarcode,
  Wallet,
  RotateCcw,
  Clock,
  LogOut,
  ArrowLeftRight,
  LayoutDashboard,
  CircleUser,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dashboardUrl } from "@/lib/host";

const POS_NAV = [
  { to: "/pos", label: "Sell", icon: ScanBarcode },
  { to: "/register", label: "Register", icon: Wallet },
  { to: "/refunds", label: "Refunds", icon: RotateCcw },
  { to: "/timeclock", label: "Time clock", icon: Clock },
  { to: "/shifts", label: "Shift", icon: Receipt },
] as const;

const MANAGER_ROLES = new Set(["owner", "admin", "manager"]);

export function PosShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canDashboard = (me?.roles ?? []).some((r) => MANAGER_ROLES.has(r));

  // Kick first-login employees through onboarding (shared with dashboard shell).
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
    await supabase.auth.signOut();
    qc.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: "/auth", search: { mode: "pin" } as any, replace: true });
  };

  const role = me?.roles?.[0];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <aside className="w-16 lg:w-56 border-r bg-surface/60 flex flex-col shrink-0">
        <div className="h-16 px-4 border-b flex items-center gap-3">
          <div className="size-8 bg-primary rounded-lg grid place-items-center text-primary-foreground font-bold">V</div>
          <div className="hidden lg:flex flex-col leading-tight">
            <span className="font-semibold tracking-tight text-sm">POS Register</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{me?.store?.name ?? "Store"}</span>
          </div>
        </div>

        <nav aria-label="POS navigation" className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {POS_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
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

        {canDashboard && (
          <div className="p-2 border-t">
            <Button asChild variant="outline" size="sm" className="w-full">
              <a href={dashboardUrl("/dashboard")}>
                <LayoutDashboard className="size-4 lg:mr-2" />
                <span className="hidden lg:inline">Dashboard</span>
              </a>
            </Button>
          </div>
        )}

        <div className="p-2 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent transition-colors text-left">
                <div className="size-8 rounded-full bg-muted grid place-items-center shrink-0">
                  <CircleUser className="size-5 text-muted-foreground" />
                </div>
                <div className="hidden lg:flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-semibold truncate">{me?.profile?.full_name ?? me?.user?.email}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{role ?? "cashier"}</span>
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
