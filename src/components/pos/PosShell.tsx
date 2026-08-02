import { Link, useRouter, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { SupportRequestListener } from "@/components/SupportRequestListener";

import {
  ScanBarcode,
  ArrowLeft,
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
  LifeBuoy,
  MoreVertical,
  Printer,
  Monitor,
  Usb,
} from "lucide-react";
import { OpenDrawerDialog } from "@/components/pos/OpenDrawerDialog";
import { OfflineIndicator } from "@/components/pos/OfflineIndicator";
import { cn } from "@/lib/utils";
import { roleDotClass, roleTextClass } from "@/lib/role-visual";
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
import { StoreLogo } from "@/components/brand/StoreLogo";
import { UserAvatar } from "@/components/brand/UserAvatar";
import { Settings as SettingsIcon } from "lucide-react";
import { useStoreLanguageSync } from "@/hooks/useStoreLanguageSync";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/usePermissions";
import { sendPosHeartbeat } from "@/lib/pos/heartbeat";
import { pendingCounts } from "@/lib/offline/sync";
import { PosManagerDashboardDialog } from "@/components/pos/PosManagerDashboardDialog";
import { usbPrinterReady } from "@/lib/hardware/escpos-usb";
import { nativeCustomerDisplayStatus } from "@/lib/hardware/customer-display-native";

const POS_NAV: ReadonlyArray<{ to: string; labelKey: string; icon: typeof ScanBarcode }> = [];

const sb = supabase as any;

function compactEmployeeName(value?: string | null) {
  const cleaned = (value ?? "").trim();
  if (!cleaned) return "Cashier";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase() ?? ""}.`;
}

export function PosShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { t } = useTranslation();
  const permissions = usePermissions();
  useStoreLanguageSync();
  const storeId = me?.store?.id as string | undefined;
  // Every signed-in register employee needs the core cashier navigation.
  // Actual sensitive actions remain protected inside their workflows with a
  // manager approval PIN; hiding the route made cashiers unable to request a
  // legitimate refund or reach the time clock.
  const visibleNav = POS_NAV.filter((item) => {
    if (item.to === "/register") {
      return (
        permissions.isSuper || permissions.has("register.open") || permissions.has("register.close")
      );
    }
    return true;
  });

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
  const [dashboardGate, setDashboardGate] = useState(false);
  const [drawerDialog, setDrawerDialog] = useState(false);
  const [managerDashboard, setManagerDashboard] = useState(false);
  const [printerReady, setPrinterReady] = useState(false);
  const [displayRunning, setDisplayRunning] = useState(false);

  // Native APK exposes Support + Settings in the mobile menu. Web POS is
  // unchanged  -  those live in the merchant dashboard on the web.

  const isNativeShell =
    typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();

  const doSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    // Use replace so the protected route stays off history  -  no back-button leak.
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

    navigate({ to: "/auth", search: { mode: "pin" } as any, replace: true });
  };

  const role = me?.roles?.[0];
  const shiftStatus = openShift.data
    ? `On shift · opened ${new Date(openShift.data.opened_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "No open shift";

  useEffect(() => {
    if (!isNativeShell || !storeId) return;
    let cancelled = false;
    const beat = async () => {
      const counts = await pendingCounts().catch(() => ({ pendingSales: 0, pendingCash: 0 } as any));
      if (cancelled) return;
      await sendPosHeartbeat({
        storeId,
        employeeId: me?.user?.id ?? null,
        employeeName: compactEmployeeName(me?.profile?.full_name ?? me?.user?.email),
        shiftId: openShift.data?.id ?? null,
        pendingSync: Number(counts.pendingSales ?? 0) + Number(counts.pendingCash ?? 0),
      }).catch(() => {});
    };
    void beat();
    const timer = window.setInterval(beat, 20_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [isNativeShell, storeId, me?.user?.id, me?.profile?.full_name, openShift.data?.id]);

  useEffect(() => {
    if (!isNativeShell) return;
    const refreshHardware = async () => {
      setPrinterReady(await usbPrinterReady().catch(() => false));
      setDisplayRunning((await nativeCustomerDisplayStatus().catch(() => ({ running:false, displayId:-1 }))).running);
    };
    void refreshHardware();
    window.addEventListener("pos-hardware-change", refreshHardware);
    window.addEventListener("seza-hardware-status", refreshHardware);
    return () => { window.removeEventListener("pos-hardware-change", refreshHardware); window.removeEventListener("seza-hardware-status", refreshHardware); };
  }, [isNativeShell]);

  return (
    <div className="flex h-[100dvh] w-full bg-background text-foreground overflow-hidden">
      <aside className="hidden md:flex w-[76px] border-r bg-surface/60 flex-col shrink-0 items-center">
        <div className="h-20 w-full border-b flex flex-col items-center justify-center gap-1 px-2">
          <StoreLogo className="size-9 rounded-xl" />
          <span className="max-w-full truncate text-[10px] font-semibold text-center">
            {me?.store?.name ?? "Store"}
          </span>
        </div>

        <div className="flex-1" />

        {openShift.data && (
          <Button
            variant="outline"
            size="icon"
            className="size-12 rounded-2xl mb-2"
            onClick={() => setDrawerDialog(true)}
            aria-label={t("posNav.open_drawer")}
            title="Open Drawer"
          >
            <DoorOpen className="size-5" />
          </Button>
        )}

        <Button
          variant="outline"
          size="icon"
          className="size-12 rounded-2xl mb-3"
          onClick={() => setDashboardGate(true)}
          aria-label="Open manager dashboard"
          title="Dashboard"
        >
          <LayoutDashboard className="size-5" />
        </Button>


      </aside>

      {/* Mobile top bar  -  hosts logo + cashier menu trigger. Desktop uses the sidebar. */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-40 h-12 border-b bg-background/95 backdrop-blur flex items-center justify-between px-3"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isNativeShell && pathname !== "/pos" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              aria-label="Go back"
              onClick={() => {
                try {
                  router.history.back();
                } catch {
                  navigate({ to: "/pos" });
                }
              }}
            >
              <ArrowLeft className="size-5" />
            </Button>
          )}
          <StoreLogo className="size-7 rounded-md" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">{me?.store?.name ?? "Store"}</div>
            <div className="truncate text-[10px] text-muted-foreground">{compactEmployeeName(me?.profile?.full_name ?? me?.user?.email)}</div>
          </div>
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
                <UserAvatar
                  name={me?.profile?.full_name ?? me?.user?.email ?? "?"}
                  photoUrl={me?.profile?.avatar_url ?? me?.profile?.photo_url}
                  role={role}
                  className="size-7 text-[11px]"
                />
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[86%] max-w-sm p-0 flex flex-col">
              <SheetHeader className="p-4 border-b text-left">
                <SheetTitle className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <UserAvatar
                      name={me?.profile?.full_name ?? me?.user?.email ?? "?"}
                      photoUrl={me?.profile?.avatar_url ?? me?.profile?.photo_url}
                      role={role}
                      className="size-10"
                    />
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-background",
                        roleDotClass(role),
                      )}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {me?.profile?.full_name ?? me?.user?.email}
                    </div>
                    <div
                      className={cn(
                        "text-[10px] font-medium uppercase tracking-wider",
                        roleTextClass(role),
                      )}
                    >
                      {role ?? "cashier"}
                    </div>
                  </div>
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Cashier menu with shift and sign-out actions
                </SheetDescription>
              </SheetHeader>

              <div className="p-4 space-y-3 text-sm">
                <div className="rounded-lg border bg-surface/40 p-3 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Register
                  </div>
                  <div className="font-medium">{me?.store?.name ?? "Store"}</div>
                </div>
                <div
                  className={cn(
                    "rounded-lg border p-3 space-y-1",
                    openShift.data ? "bg-success/10 border-success/30" : "bg-surface/40",
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Shift status
                  </div>
                  <div className="font-medium">{shiftStatus}</div>
                </div>
              </div>

              <nav className="flex-1 overflow-y-auto px-2 pb-2">
                {openShift.data && (
                  <MobileMenuRow
                    icon={DoorOpen}
                    label={t("posNav.open_drawer")}
                    onClick={() => {
                      setMobileMenu(false);
                      setDrawerDialog(true);
                    }}
                  />
                )}
                <MobileMenuRow
                  icon={Wallet}
                  label={t("posNav.close_shift")}
                  onClick={() => {
                    setMobileMenu(false);
                    navigate({ to: "/register" });
                  }}
                />
                <MobileMenuRow
                  icon={Clock}
                  label={t("posNav.timeclock")}
                  onClick={() => {
                    setMobileMenu(false);
                    navigate({ to: "/timeclock" });
                  }}
                />
                <MobileMenuRow
                  icon={LayoutDashboard}
                  label="Dashboard"
                  onClick={() => {
                    setMobileMenu(false);
                    setDashboardGate(true);
                  }}
                />
                {isNativeShell && (
                  <>
                    <MobileMenuRow
                      icon={ArrowLeftRight}
                      label={t("posNav.pending_sync")}
                      onClick={() => {
                        setMobileMenu(false);
                        navigate({ to: "/pending-sync" });
                      }}
                    />
                    <MobileMenuRow
                      icon={LifeBuoy}
                      label={t("posNav.support")}
                      onClick={() => {
                        setMobileMenu(false);
                        navigate({ to: "/support" });
                      }}
                    />
                    <MobileMenuRow
                      icon={ChevronRight}
                      label={t("posNav.settings")}
                      onClick={() => {
                        setMobileMenu(false);
                        navigate({ to: "/settings" });
                      }}
                    />
                  </>
                )}
                <div className="h-px bg-border my-2" />
                <MobileMenuRow
                  icon={ArrowLeftRight}
                  label={t("posNav.switch_employee")}
                  onClick={handleSwitchEmployee}
                />
                <MobileMenuRow
                  icon={LogOut}
                  label={t("posNav.sign_out")}
                  destructive
                  onClick={requestSignOut}
                />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <SupportRequestListener />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden pt-12 md:pt-0 pb-14 md:pb-0">
        <div className="hidden md:flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
          <div className="flex min-w-0 items-center gap-2">
            {pathname !== "/pos" && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Go back to previous POS screen"
                onClick={() => {
                  try { router.history.back(); } catch { navigate({ to: "/pos" }); }
                }}
              >
                <ArrowLeft className="size-5" />
              </Button>
            )}
            <div className="min-w-0"><div className="truncate font-bold">{me?.store?.name ?? "Store"}</div><div className="text-xs text-muted-foreground">{compactEmployeeName(me?.profile?.full_name ?? me?.user?.email)} · {role ?? "cashier"}</div></div>
          </div>
          <div className="flex items-center gap-2">
            <OfflineIndicator />
            <Button variant="outline" size="sm" onClick={() => setDrawerDialog(true)} disabled={!openShift.data}><DoorOpen className="mr-2 size-4"/>Open drawer</Button>
            <Button variant="outline" size="sm" onClick={handleSwitchEmployee}><ArrowLeftRight className="mr-2 size-4"/>Switch user</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Device status"><MoreVertical className="size-4"/></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Device status</DropdownMenuLabel><DropdownMenuSeparator/>
                <DropdownMenuItem onSelect={(e)=>e.preventDefault()}><Printer className="mr-2 size-4"/>Printer <span className="ml-auto text-xs">{printerReady?"Connected":"Not configured"}</span></DropdownMenuItem>
                <DropdownMenuItem onSelect={(e)=>e.preventDefault()}><Usb className="mr-2 size-4"/>Scanner <span className="ml-auto text-xs">USB / keyboard</span></DropdownMenuItem>
                <DropdownMenuItem onSelect={(e)=>e.preventDefault()}><DoorOpen className="mr-2 size-4"/>Drawer <span className="ml-auto text-xs">{printerReady?"Available":"Needs printer"}</span></DropdownMenuItem>
                <DropdownMenuItem onSelect={(e)=>e.preventDefault()}><Monitor className="mr-2 size-4"/>Customer display <span className="ml-auto text-xs">{displayRunning?"Running":"Not started"}</span></DropdownMenuItem>
                <DropdownMenuSeparator/><DropdownMenuItem onClick={()=>setDashboardGate(true)}><SettingsIcon className="mr-2 size-4"/>Configure hardware</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </main>

      {/* Mobile POS bottom nav */}
      <nav
        aria-label="POS navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 border-t bg-background/95 backdrop-blur flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                active ? "text-primary" : "text-muted-foreground hover:text-primary",
              )}
            >
              <Icon className="size-5" />
              {t(item.labelKey)}
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
              Closing the shift records your drawer count and safe drop. Signing out without closing
              keeps the shift open for you or a manager to close later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0">Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setOpenShiftWarn(false);
                setManagerGate(true);
              }}
            >
              Sign out without closing
            </Button>
            <AlertDialogAction
              onClick={() => {
                setOpenShiftWarn(false);
                navigate({ to: "/register" });
              }}
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
        onApprove={() => {
          setManagerGate(false);
          void doSignOut();
        }}
      />

      <ManagerOverrideDialog
        open={dashboardGate}
        onOpenChange={setDashboardGate}
        action="dashboard.open"
        description="Enter a manager or owner PIN to open management tools without switching the cashier."
        details={{
          cashier_id: me?.profile?.id,
          store_id: storeId,
          shift_id: openShift.data?.id,
        }}
        onApprove={() => {
          setDashboardGate(false);
          setManagerDashboard(true);
        }}
      />

      <PosManagerDashboardDialog
        open={managerDashboard}
        onOpenChange={setManagerDashboard}
        storeId={storeId ?? ""}
        storeName={me?.store?.name ?? "SEZA POS"}
      />

      <OpenDrawerDialog
        open={drawerDialog}
        onOpenChange={setDrawerDialog}
        session={openShift.data ? { id: openShift.data.id, store_id: storeId ?? "" } : null}
        storeId={storeId}
        cashierId={me?.user?.id}
        onCountShift={() => navigate({ to: "/register" })}
        onSafeDropRecorded={() => {
          qc.invalidateQueries({ queryKey: ["register"] });
        }}
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
