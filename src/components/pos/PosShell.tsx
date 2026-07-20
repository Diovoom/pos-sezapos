import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { SupportRequestListener } from "@/components/SupportRequestListener";

import {
  ScanBarcode,
  Wallet,
  RotateCcw,
  Clock,
  LogOut,
  ArrowLeftRight,
  LayoutDashboard,
  Receipt,
  Menu,
  ChevronRight,
  DoorOpen,
} from "lucide-react";
import { OpenDrawerDialog } from "@/components/pos/OpenDrawerDialog";
import { OfflineIndicator } from "@/components/pos/OfflineIndicator";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ManagerOverrideDialog } from "@/components/pos/ManagerOverrideDialog";
import { dashboardUrl } from "@/lib/host";
import { StoreLogo } from "@/components/brand/StoreLogo";
import { UserAvatar } from "@/components/brand/UserAvatar";
import { roleDotClass, roleTextClass } from "@/lib/role-visual";
import { Settings as SettingsIcon } from "lucide-react";

const POS_NAV = [
  { to: "/pos", label: "Sell", icon: ScanBarcode },
  { to: "/register", label: "Register", icon: Wallet },
  { to: "/refunds", label: "Refunds", icon: RotateCcw },
  { to: "/timeclock", label: "Time clock", icon: Clock },
  { to: "/shifts", label: "Shift", icon: Receipt },
] as const;

const MANAGER_ROLES = new Set(["owner", "admin", "manager"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function PosShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canDashboard = (me?.roles ?? []).some((r) => MANAGER_ROLES.has(r));
  const storeId = me?.store?.id as string | undefined;

  // Detect an open shift for this store so Sign Out can warn the cashier.
  const openShift = useQuery({
    queryKey: ["pos-shell", "open-shift", storeId],
    enabled: !!storeId,
    staleTime: 30_000,
    queryFn: async (): Promise<{ id: string; opened_at: string } | null> => {
      const { data } = await sb
        .from("register_sessions")
        .select("id, opened_at")
        .eq("store_id", storeId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  // Kick first-login employees through onboarding (shared with dashboard shell).
  useEffect(() => {
    if (!me?.profile) return;
    if (me.profile.must_change_password && pathname !== "/onboarding") {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [me, pathname, navigate]);

  const [mobileMenu, setMobileMenu] = useState(false);
  const [openShiftWarn, setOpenShiftWarn] = useState(false);
  const [managerGate, setManagerGate] = useState(false);
  const [drawerDialog, setDrawerDialog] = useState(false);

  const doSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    // Use replace so the protected route stays off history — no back-button leak.
    navigate({ to: "/auth", replace: true });
  };

  const requestSignOut = () => {
    setMobileMenu(false);
    if (openShift.data) {
      setOpenShiftWarn(true);
    } else {
      void doSignOut();
    }
  };

  const handleSwitchEmployee = async () => {
    setMobileMenu(false);
    await supabase.auth.signOut();
    qc.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: "/auth", search: { mode: "pin" } as any, replace: true });
  };

  const role = me?.roles?.[0];
  const shiftStatus = openShift.data
    ? `On shift · opened ${new Date(openShift.data.opened_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "No open shift";

  return (
    <div className="flex h-[100dvh] w-full bg-background text-foreground overflow-hidden">
      <aside className="hidden md:flex w-16 lg:w-56 border-r bg-surface/60 flex-col shrink-0">
        <div className="h-16 px-4 border-b flex items-center gap-3">
          <StoreLogo className="size-8 rounded-lg" />


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

        {/* Cash drawer control — always visible above the cashier row per POS spec. */}
        {openShift.data && (
          <div className="p-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center"
              onClick={() => setDrawerDialog(true)}
              aria-label="Open cash drawer"
            >
              <DoorOpen className="size-4 lg:mr-2" />
              <span className="hidden lg:inline">Open Cash Drawer</span>
            </Button>
          </div>
        )}

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
                <div className="relative shrink-0">
                  <UserAvatar
                    name={me?.profile?.full_name ?? me?.user?.email ?? "?"}
                    photoUrl={me?.profile?.avatar_url ?? me?.profile?.photo_url}
                    role={role}
                    className="size-9 text-sm"
                  />
                  <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-background", roleDotClass(role))} aria-hidden="true" />
                </div>
                <div className="hidden lg:flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-semibold truncate">{me?.profile?.full_name ?? me?.user?.email}</span>
                  <span className={cn("text-[10px] font-medium uppercase tracking-wider", roleTextClass(role))}>
                    {role ?? "cashier"} · {openShift.data ? "On shift" : "Off shift"}
                  </span>
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
              <DropdownMenuItem onClick={() => navigate({ to: "/register" })}>
                <Wallet className="size-4 mr-2" /> Close shift
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/timeclock" })}>
                <Clock className="size-4 mr-2" /> Time clock
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                <SettingsIcon className="size-4 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSwitchEmployee}>
                <ArrowLeftRight className="size-4 mr-2" /> Switch employee
              </DropdownMenuItem>
              <DropdownMenuItem onClick={requestSignOut} className="text-destructive">
                <LogOut className="size-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile top bar — hosts logo + cashier menu trigger. Desktop uses the sidebar. */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-40 h-12 border-b bg-background/95 backdrop-blur flex items-center justify-between px-3"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <StoreLogo className="size-7 rounded-md" />
          <span className="text-sm font-semibold truncate">{me?.store?.name ?? "Store"}</span>
        </div>
        <div className="flex items-center gap-2">
          <OfflineIndicator />
        <Sheet open={mobileMenu} onOpenChange={setMobileMenu}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 px-2"
              aria-label="Open cashier menu"
            >
              <div className={cn("size-7 rounded-full grid place-items-center text-white font-semibold text-[11px]", roleAvatarClass(role))}>
                {roleInitials(me?.profile?.full_name ?? me?.user?.email ?? "?")}
              </div>
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[86%] max-w-sm p-0 flex flex-col">
            <SheetHeader className="p-4 border-b text-left">
              <SheetTitle className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className={cn("size-10 rounded-full grid place-items-center text-white font-semibold", roleAvatarClass(role))}>
                    {roleInitials(me?.profile?.full_name ?? me?.user?.email ?? "?")}
                  </div>
                  <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-background", roleDotClass(role))} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{me?.profile?.full_name ?? me?.user?.email}</div>
                  <div className={cn("text-[10px] font-medium uppercase tracking-wider", roleTextClass(role))}>
                    {role ?? "cashier"}
                  </div>
                </div>
              </SheetTitle>
              <SheetDescription className="sr-only">Cashier menu with shift and sign-out actions</SheetDescription>
            </SheetHeader>

            <div className="p-4 space-y-3 text-sm">
              <div className="rounded-lg border bg-surface/40 p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Register</div>
                <div className="font-medium">{me?.store?.name ?? "Store"}</div>
              </div>
              <div className={cn(
                "rounded-lg border p-3 space-y-1",
                openShift.data ? "bg-success/10 border-success/30" : "bg-surface/40",
              )}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Shift status</div>
                <div className="font-medium">{shiftStatus}</div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 pb-2">
              {openShift.data && (
                <MobileMenuRow
                  icon={DoorOpen}
                  label="Open cash drawer"
                  onClick={() => { setMobileMenu(false); setDrawerDialog(true); }}
                />
              )}
              <MobileMenuRow
                icon={Wallet}
                label="Close shift"
                onClick={() => { setMobileMenu(false); navigate({ to: "/register" }); }}
              />
              <MobileMenuRow
                icon={Clock}
                label="Time clock"
                onClick={() => { setMobileMenu(false); navigate({ to: "/timeclock" }); }}
              />
              {canDashboard && (
                <MobileMenuRow
                  icon={LayoutDashboard}
                  label="Dashboard"
                  onClick={() => { setMobileMenu(false); window.location.href = dashboardUrl("/dashboard"); }}
                />
              )}
              <div className="h-px bg-border my-2" />
              <MobileMenuRow
                icon={ArrowLeftRight}
                label="Switch employee"
                onClick={handleSwitchEmployee}
              />
              <MobileMenuRow
                icon={LogOut}
                label="Sign out"
                destructive
                onClick={requestSignOut}
              />
            </nav>
          </SheetContent>
        </Sheet>
        </div>
      </header>

      <SupportRequestListener />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden pt-12 md:pt-0 pb-14 md:pb-0">{children}</main>


      {/* Mobile POS bottom nav */}
      <nav
        aria-label="POS navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 border-t bg-background/95 backdrop-blur grid grid-cols-5"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {POS_NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                active ? "text-primary" : "text-muted-foreground hover:text-primary",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Open-shift Sign Out warning: never auto-close on browser close/loss. */}
      <AlertDialog open={openShiftWarn} onOpenChange={setOpenShiftWarn}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You still have an open shift.</AlertDialogTitle>
            <AlertDialogDescription>
              Closing the shift records your drawer count and safe drop. Signing out without
              closing keeps the shift open for you or a manager to close later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0">Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => { setOpenShiftWarn(false); setManagerGate(true); }}
            >
              Sign out without closing
            </Button>
            <AlertDialogAction
              onClick={() => { setOpenShiftWarn(false); navigate({ to: "/register" }); }}
            >
              Review &amp; close shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ManagerOverrideDialog
        open={managerGate}
        onOpenChange={setManagerGate}
        action="cashier.sign_out_with_open_shift"
        description="A manager PIN is required to sign out while a shift is still open."
        details={{
          shift_id: openShift.data?.id,
          cashier_id: me?.profile?.id,
          store_id: storeId,
        }}
        onApprove={() => { setManagerGate(false); void doSignOut(); }}
      />

      <OpenDrawerDialog
        open={drawerDialog}
        onOpenChange={setDrawerDialog}
        session={openShift.data ? { id: openShift.data.id, store_id: storeId ?? "" } : null}
        storeId={storeId}
        cashierId={me?.user?.id}
        onCountShift={() => navigate({ to: "/register" })}
        onSafeDropRecorded={() => { qc.invalidateQueries({ queryKey: ["register"] }); }}
      />
    </div>
  );
}

function MobileMenuRow({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Menu;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors",
        "hover:bg-accent",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-left">{label}</span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
