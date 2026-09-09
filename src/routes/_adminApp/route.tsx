import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabaseAdminAuth as supabase } from "@/integrations/supabase/admin-client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { logAudit } from "@/lib/audit-log";
import {
  adminGlobalSearch,
  adminMyActiveSupportSession,
  adminEndSupportSession,
  adminCancelSupportRequest,
} from "@/lib/admin/admin.functions";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { AdminScreenViewer } from "@/components/support/AdminScreenViewer";
import { AdminDiagnosticsPanel } from "@/components/support/AdminDiagnosticsPanel";
import { AdminPersistentChat } from "@/components/admin/AdminPersistentChat";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Monitor,
  LifeBuoy,
  ScrollText,
  Settings as SettingsIcon,
  LogOut,
  ShieldCheck,
  Menu,
  Search,
  X,
  Eye,
  Users,
  MessageSquare,
  Activity,
  BriefcaseBusiness,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PLATFORM_ROLES } from "@/lib/platform-roles";

export const Route = createFileRoute("/_adminApp")({
  ssr: false,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "SEZA Admin" }],
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/auth" });
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isPlatform =
      !rolesErr &&
      (roles ?? []).some((r) => (PLATFORM_ROLES as readonly string[]).includes(r.role as string));
    if (!isPlatform) {
      await logAudit({
        action: "override.denied",
        entity: "admin",
        details: { path: "/admin", reason: "not_platform_staff" },
      }).catch(() => {});
      await supabase.auth.signOut();
      throw redirect({ to: "/admin/auth" });
    }
    return { user: data.user };
  },
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  permission?: string;
  founderOnly?: boolean;
};

type ActiveSupportSession = {
  id: string;
  store_id: string;
  status: string;
  started_at: string | null;
  expires_at: string;
  client_capability: string | null;
  client_metadata_json: string | null;
  channel_token: string;
  store?: { id: string; name: string; store_code: string | null } | null;
  accepted_by?: {
    full_name: string | null;
    email: string | null;
    employee_id: string | null;
  } | null;
};
const NAV: NavItem[] = [
  { to: "/admin", label: "Operations Center", icon: LayoutDashboard, exact: true },
  { to: "/admin/businesses", label: "Businesses", icon: Building2, permission: "businesses.view" },
  { to: "/admin/employees", label: "SEZA Employees", icon: Users, permission: "employees.view" },
  { to: "/admin/registers", label: "POS Registers", icon: Monitor, permission: "devices.view" },
  { to: "/admin/devices", label: "Card Readers", icon: CreditCard, permission: "devices.view" },
  { to: "/admin/support", label: "Support Cases", icon: LifeBuoy, permission: "support.view" },
  {
    to: "/admin/communications",
    label: "Live Communications",
    icon: MessageSquare,
    permission: "support.manage",
  },
  {
    to: "/admin/sales",
    label: "New Merchant Sales",
    icon: BriefcaseBusiness,
    permission: "billing.view",
  },
  {
    to: "/admin/payments",
    label: "Merchant Payments",
    icon: CreditCard,
    permission: "billing.view",
  },
  {
    to: "/admin/subscriptions",
    label: "Subscriptions",
    icon: CreditCard,
    permission: "billing.view",
  },
  { to: "/admin/offline-sync", label: "Offline Sync", icon: Monitor, permission: "sync.manage" },
  { to: "/admin/incidents", label: "Incidents", icon: AlertTriangle, permission: "incidents.view" },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText, permission: "audit.view" },
  {
    to: "/admin/team",
    label: "Admin Team",
    icon: ShieldCheck,
    permission: "admin_users.view",
    founderOnly: true,
  },
  {
    to: "/admin/platform-health",
    label: "Platform Health",
    icon: Activity,
    permission: "platform_settings.view",
  },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

function AdminLayout() {
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: perms } = useAdminPermissions();

  const search = useServerFn(adminGlobalSearch);
  const getSession = useServerFn(adminMyActiveSupportSession);
  const endSession = useServerFn(adminEndSupportSession);
  const cancelReq = useServerFn(adminCancelSupportRequest);

  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const searchQuery = useQuery({
    queryKey: ["admin_search", debounced],
    queryFn: () => search({ data: { query: debounced } }),
    enabled: debounced.length >= 1,
  });

  const supportSessionQuery = useQuery({
    queryKey: ["admin_support_session_active"],
    queryFn: () => getSession(),
    // Support view state is operationally live; do not leave the admin waiting
    // 15 seconds after a merchant accepts or a session changes state.
    refetchInterval: 2_000,
  });

  const rawActiveSession = supportSessionQuery.data?.session as
    | ActiveSupportSession
    | null
    | undefined;

  // The support row is polled every two seconds. A transient/incomplete server
  // snapshot must never tear down a working viewer: unmounting the viewer loses
  // its last good JPEG frame and creates the exact "picture appears, then black"
  // behavior seen on the physical terminal. Keep the confirmed transport fields
  // sticky for the same active session while still accepting real status changes.
  const stableSupportSessionRef = useRef<ActiveSupportSession | null>(null);
  const activeSession = useMemo<ActiveSupportSession | null | undefined>(() => {
    const raw = rawActiveSession;
    if (!raw) {
      if (raw === null) stableSupportSessionRef.current = null;
      return raw;
    }

    if (raw.status !== "active") {
      stableSupportSessionRef.current = raw;
      return raw;
    }

    const previous = stableSupportSessionRef.current;
    if (previous?.id !== raw.id) {
      stableSupportSessionRef.current = raw;
      return raw;
    }

    const merged: ActiveSupportSession = {
      ...previous,
      ...raw,
      client_capability: raw.client_capability ?? previous.client_capability,
      channel_token: raw.channel_token || previous.channel_token,
      expires_at: raw.expires_at || previous.expires_at,
      started_at: raw.started_at || previous.started_at,
      store: raw.store ?? previous.store,
      accepted_by: raw.accepted_by ?? previous.accepted_by,
    };
    stableSupportSessionRef.current = merged;
    return merged;
  }, [rawActiveSession]);

  const activeSessionMetadata = useMemo<Record<string, unknown> | null>(() => {
    if (!activeSession?.client_metadata_json) return null;
    try {
      return JSON.parse(activeSession.client_metadata_json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [activeSession?.client_metadata_json]);

  // Live-updating duration timer for the accepted support session.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (activeSession?.status !== "active") return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [activeSession?.status, activeSession?.id]);

  const duration = useMemo(() => {
    if (!activeSession?.started_at) return null;
    const s = Math.max(
      0,
      Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000),
    );
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [activeSession?.started_at, tick]);

  async function handleSignOut() {
    await logAudit({ action: "logout", entity: "admin" }).catch(() => {});
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin/auth", replace: true });
  }

  async function handleEndSupport() {
    if (!activeSession) return;
    try {
      if (activeSession.status === "pending") {
        await cancelReq({ data: { sessionId: activeSession.id } });
        toast.success("Support request canceled");
      } else {
        await endSession({ data: { sessionId: activeSession.id } });
        toast.success("Support view ended");
      }
      qc.invalidateQueries({ queryKey: ["admin_support_session_active"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-surface text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-background border-r flex flex-col transition-transform lg:translate-x-0 lg:static",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="p-4 border-b flex items-center gap-2">
          <Logo className="h-8" alt="SEZA POS" />
          <div className="flex items-center gap-1 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            ADMIN
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV.filter((item) => {
            if (item.founderOnly && !perms?.isFounder) return false;
            return !item.permission || !perms || perms.has(item.permission);
          }).map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as any}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <div className="mb-2 px-1">
            <LanguageSwitcher compact />
          </div>
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="border-b bg-background px-4 py-2 flex items-center gap-2 sticky top-0 z-20">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1 max-w-2xl relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search businesses, owners, devices or IDs"
              className="pl-8"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
            />
            {open && debounced.length >= 1 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-background border rounded-md shadow-lg max-h-96 overflow-y-auto z-30">
                {searchQuery.isFetching && (
                  <div className="p-3 text-sm text-muted-foreground">Searching…</div>
                )}
                {!searchQuery.isFetching && (searchQuery.data?.results?.length ?? 0) === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">No results.</div>
                )}
                {(searchQuery.data?.results ?? []).map((r: any) => (
                  <button
                    key={`${r.kind}-${r.id}`}
                    className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0 block"
                    onClick={() => {
                      if (r.kind === "support") {
                        window.location.assign(`/admin/support/${encodeURIComponent(r.id)}`);
                      } else {
                        const storeId = r.store_id ?? (r.kind === "business" ? r.id : null);
                        if (!storeId) return;
                        navigate({ to: "/admin/businesses/$storeId", params: { storeId } });
                      }
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.label}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.sublabel}</div>
                      </div>
                      <span className="text-xs uppercase tracking-wide text-primary shrink-0">
                        {r.kind}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">
                      store {r.store_id ?? " - "}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="hidden sm:block">
            <LanguageSwitcher compact />
          </div>
          {open && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setOpen(false);
                setQ("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </header>

        {activeSession && (
          <div
            className={cn(
              "border-b px-4 py-2 flex flex-wrap items-center justify-between gap-3",
              activeSession.status === "pending"
                ? "bg-blue-500/15 border-blue-500/40"
                : "bg-amber-500/15 border-amber-500/40",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Eye
                  className={cn(
                    "h-4 w-4",
                    activeSession.status === "pending"
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-amber-700 dark:text-amber-300",
                  )}
                />
                <span className="font-medium">
                  {activeSession.status === "pending"
                    ? "Waiting for merchant to accept…"
                    : "SEZA Admin Support View"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>
                  <span className="uppercase tracking-wide mr-1">Business</span>
                  <span className="text-foreground font-medium">
                    {activeSession.store?.name ?? " - "}
                  </span>
                </span>
                <span>
                  <span className="uppercase tracking-wide mr-1">Store</span>
                  <span className="font-mono text-foreground">
                    {activeSession.store?.store_code ?? activeSession.store_id.slice(0, 8)}
                  </span>
                </span>
                {activeSession.status === "active" && (
                  <>
                    <span>
                      <span className="uppercase tracking-wide mr-1">Employee</span>
                      <span className="text-foreground">
                        {activeSession.accepted_by?.full_name ??
                          activeSession.accepted_by?.email ??
                          " - "}
                        {activeSession.accepted_by?.employee_id
                          ? ` · #${activeSession.accepted_by.employee_id}`
                          : ""}
                      </span>
                    </span>
                    <span>
                      <span className="uppercase tracking-wide mr-1">Duration</span>
                      <span className="font-mono text-foreground">{duration ?? "00:00"}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"
                        aria-hidden
                      />
                      <span>Connected · read-only</span>
                    </span>
                  </>
                )}
                <span>
                  <span className="uppercase tracking-wide mr-1">Expires</span>
                  <span className="text-foreground">
                    {new Date(activeSession.expires_at).toLocaleTimeString()}
                  </span>
                </span>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleEndSupport}>
              {activeSession.status === "pending" ? "Cancel request" : "Exit Support View"}
            </Button>
          </div>
        )}
        {activeSession &&
          activeSession.status === "active" &&
          (activeSession.client_capability === "web_screen_share" ||
          activeSession.client_capability === "android_screen_share" ? (
            <AdminScreenViewer
              key={activeSession.id}
              sessionId={activeSession.id}
              channelToken={activeSession.channel_token}
              startedAt={activeSession.started_at}
              businessName={activeSession.store?.name}
              storeCode={activeSession.store?.store_code}
              employeeName={
                activeSession.accepted_by?.full_name ?? activeSession.accepted_by?.email ?? null
              }
              capability={activeSession.client_capability}
              onClosed={() => qc.invalidateQueries({ queryKey: ["admin_support_session_active"] })}
            />
          ) : (
            <AdminDiagnosticsPanel
              key={activeSession.id}
              sessionId={activeSession.id}
              startedAt={activeSession.started_at}
              expiresAt={activeSession.expires_at}
              businessName={activeSession.store?.name}
              storeCode={activeSession.store?.store_code}
              employeeName={
                activeSession.accepted_by?.full_name ?? activeSession.accepted_by?.email ?? null
              }
              metadata={activeSessionMetadata}
              onClosed={() => qc.invalidateQueries({ queryKey: ["admin_support_session_active"] })}
            />
          ))}

        <main className="min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] sm:p-6 sm:pb-6">
          <Outlet />
        </main>
        <AdminPersistentChat />
      </div>
    </div>
  );
}
