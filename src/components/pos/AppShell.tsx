import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Boxes,
  Clock,
  CreditCard,
  DollarSign,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Monitor,
  MoreVertical,
  Package,
  Receipt,
  Settings,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { cn } from "@/lib/utils";
import { initializeUiPreferences } from "@/lib/ui-preferences";
import { roleDotClass, roleTextClass } from "@/lib/role-visual";
import { Logo } from "@/components/brand/Logo";
import { OwnerStoreSwitcher } from "@/components/OwnerStoreSwitcher";
import { UserAvatar } from "@/components/brand/UserAvatar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CatalogPublishButton } from "@/components/CatalogPublishButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MORE_NAV = [
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/shifts", label: "Shifts & time clock", icon: Clock },
  { to: "/payroll", label: "Payroll", icon: DollarSign },
  { to: "/devices", label: "Stores & registers", icon: Monitor },
  { to: "/settings", label: "Business settings", icon: Settings },
  { to: "/help", label: "Help Center", icon: LifeBuoy },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const role = me?.roles?.[0];
  const storeId = me?.store?.id as string | undefined;
  const unreadSupport = useQuery({
    queryKey: ["owner-support-unread", storeId],
    enabled: Boolean(storeId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: tickets, error: ticketError } = await (supabase.from as any)("support_tickets")
        .select("id,last_merchant_read_at,status")
        .eq("store_id", storeId)
        .not("status", "eq", "closed");
      if (ticketError) throw ticketError;
      const ids = (tickets ?? []).map((ticket: any) => ticket.id);
      if (!ids.length) return 0;
      const { data: adminMessages, error: noteError } = await (supabase.from as any)("support_ticket_notes")
        .select("ticket_id,created_at,sender_kind")
        .in("ticket_id", ids)
        .eq("internal", false)
        .eq("sender_kind", "admin")
        .order("created_at", { ascending: false });
      if (noteError) throw noteError;
      const latestByTicket = new Map<string, string>();
      for (const note of adminMessages ?? []) {
        if (!latestByTicket.has(note.ticket_id)) latestByTicket.set(note.ticket_id, note.created_at);
      }
      return (tickets ?? []).filter((ticket: any) => {
        const latestAdmin = latestByTicket.get(ticket.id);
        if (!latestAdmin) return false;
        if (!ticket.last_merchant_read_at) return true;
        return new Date(latestAdmin).getTime() > new Date(ticket.last_merchant_read_at).getTime();
      }).length;
    },
  });
  const unreadSupportCount = unreadSupport.data ?? 0;

  useEffect(() => {
    document.documentElement.classList.add("owner-dashboard-web");
    let cleanup: (() => void) | undefined;
    try {
      cleanup = initializeUiPreferences();
    } catch (error) {
      console.error("SEZA appearance startup failed; using fallback.", error);
    }
    return () => {
      cleanup?.();
      document.documentElement.classList.remove("owner-dashboard-web");
    };
  }, []);

  useEffect(() => {
    if (me?.profile?.must_change_password && pathname !== "/onboarding") {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [me?.profile?.must_change_password, pathname, navigate]);

  useEffect(() => {
    const scrollContainer = document.getElementById("owner-dashboard-scroll");
    scrollContainer?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const moreActive = !["/dashboard", "/employees"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  const accountMenu = (
    <DropdownMenuContent align="end" className="w-60">
      <DropdownMenuLabel>
        <div className="text-xs font-normal text-muted-foreground">Signed in as</div>
        <div className="truncate">{me?.user?.email}</div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => navigate({ to: "/profile" })}
      >
        <UserRound className="mr-2 size-4" /> My profile
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() =>
          navigate({ to: "/settings", search: { section: "notifications" } as any })
        }
      >
        <Bell className="mr-2 size-4" /> Notifications
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => navigate({ to: "/settings", search: { section: "billing" } as any })}
      >
        <CreditCard className="mr-2 size-4" /> Subscription & billing
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => navigate({ to: "/help" })}>
        <LifeBuoy className="mr-2 size-4" /> Help Center
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={signOut} className="text-destructive">
        <LogOut className="mr-2 size-4" /> Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-16 shrink-0 flex-col border-r bg-surface/60 md:flex lg:w-60">
        <div className="flex h-16 items-center justify-center border-b px-3">
          <Link to="/dashboard" aria-label="SEZA dashboard" title="SEZA POS">
            <Logo className="size-10 rounded-xl" />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Owner navigation">
          <DesktopNavLink
            to="/dashboard"
            label="Home"
            icon={LayoutDashboard}
            active={pathname === "/dashboard"}
          />
          <DesktopNavLink
            to="/employees"
            label="Staff"
            icon={UserPlus}
            active={pathname.startsWith("/employees")}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  moreActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <MoreVertical className="size-4 shrink-0" />
                <span className="hidden lg:inline">More</span>
              </button>
            </DropdownMenuTrigger>
            <MoreMenu navigate={navigate} side="right" />
          </DropdownMenu>
        </nav>

        <div className="hidden border-t px-2 pb-1 pt-2 lg:block">
          <LanguageSwitcher compact />
        </div>
        <div className="border-t p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent">
                <div className="relative shrink-0">
                  <UserAvatar
                    name={me?.profile?.full_name ?? me?.user?.email ?? "?"}
                    photoUrl={me?.profile?.avatar_url ?? me?.profile?.photo_url}
                    role={role}
                    className="size-9 text-sm"
                  />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-background",
                      roleDotClass(role),
                    )}
                  />
                </div>
                <div className="hidden min-w-0 flex-1 flex-col lg:flex">
                  <span className="truncate text-xs font-semibold">
                    {me?.profile?.full_name ?? me?.user?.email}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wider",
                      roleTextClass(role),
                    )}
                  >
                    {role ?? "owner"}
                  </span>
                </div>
              </button>
            </DropdownMenuTrigger>
            {accountMenu}
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative flex h-14 shrink-0 items-center justify-between border-b bg-surface/80 px-3 backdrop-blur md:h-16 md:px-5">
          <Link to="/dashboard" className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-accent md:hidden" aria-label="SEZA dashboard">
            <Logo className="size-8 rounded-lg" />
          </Link>
          <div className="absolute left-1/2 max-w-[62vw] -translate-x-1/2">
            <OwnerStoreSwitcher />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Link
              to="/products"
              aria-label="Products"
              title="Products"
              className={cn(
                "grid size-10 place-items-center rounded-full hover:bg-accent",
                pathname.startsWith("/products") && "bg-primary/10 text-primary",
              )}
            >
              <Package className="size-5" />
            </Link>
            <CatalogPublishButton compact />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="grid size-10 place-items-center rounded-full hover:bg-accent">
                  <UserAvatar
                    name={me?.profile?.full_name ?? me?.user?.email ?? "?"}
                    photoUrl={me?.profile?.avatar_url ?? me?.profile?.photo_url}
                    role={role}
                    className="size-8 text-xs"
                  />
                </button>
              </DropdownMenuTrigger>
              {accountMenu}
            </DropdownMenu>
          </div>
        </div>

        <div
          id="owner-dashboard-scroll"
          className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] md:pb-6"
        >
          {children}
        </div>

        <nav className="seza-mobile-glass-nav fixed bottom-[calc(.65rem_+_env(safe-area-inset-bottom))] left-1/2 z-40 grid min-h-[4.15rem] w-[min(92vw,28rem)] -translate-x-1/2 grid-cols-3 px-2 md:hidden">
          <MobileNavLink to="/dashboard" label="Home" icon={LayoutDashboard} active={pathname === "/dashboard"} />
          <MobileNavLink to="/employees" label="Staff" icon={UserPlus} active={pathname.startsWith("/employees")} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn("seza-mobile-tab flex flex-col items-center justify-center gap-0.5 rounded-[1.35rem] text-[10px] font-semibold", moreActive ? "is-active text-primary" : "text-muted-foreground")}>
                <MoreVertical className="size-5" /> More
              </button>
            </DropdownMenuTrigger>
            <MoreMenu navigate={navigate} side="top" />
          </DropdownMenu>
        </nav>

        <Link
          to="/help"
          aria-label={unreadSupportCount ? `${unreadSupportCount} unread support message${unreadSupportCount === 1 ? "" : "s"}` : "Contact Support"}
          className="fixed bottom-[calc(5.55rem_+_env(safe-area-inset-bottom))] right-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90 md:bottom-5"
        >
          <span className="relative">
            <LifeBuoy className="size-4" />
            {unreadSupportCount > 0 && <span className="absolute -right-2 -top-2 size-3 rounded-full border-2 border-primary bg-red-500" />}
          </span>
          <span className="hidden sm:inline">Contact Support</span>
          {unreadSupportCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] text-white">{Math.min(unreadSupportCount, 99)}</span>}
        </Link>
      </main>
    </div>
  );
}

function MoreMenu({ navigate, side }: { navigate: any; side: "right" | "top" }) {
  return (
    <DropdownMenuContent side={side} align="start" className="w-60">
      <DropdownMenuLabel>Owner tools</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {MORE_NAV.map((item) => (
        <DropdownMenuItem key={item.to} onClick={() => navigate({ to: item.to as any })}>
          <item.icon className="mr-2 size-4" /> {item.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}

function DesktopNavLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: any; active: boolean }) {
  return (
    <Link to={to} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
      <Icon className="size-4 shrink-0" /><span className="hidden lg:inline">{label}</span>
    </Link>
  );
}

function MobileNavLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: any; active: boolean }) {
  return (
    <Link to={to} className={cn("seza-mobile-tab flex flex-col items-center justify-center gap-0.5 rounded-[1.35rem] text-[10px] font-semibold", active ? "is-active text-primary" : "text-muted-foreground")}>
      <Icon className="size-5" /> {label}
    </Link>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
    </header>
  );
}

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="grid flex-1 place-items-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-muted"><Boxes className="size-6 text-muted-foreground" /></div>
          <h2 className="mb-2 text-lg font-semibold">Coming next</h2>
          <p className="mb-4 text-sm text-muted-foreground">{description}</p>
          <Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button>
        </div>
      </div>
    </>
  );
}
