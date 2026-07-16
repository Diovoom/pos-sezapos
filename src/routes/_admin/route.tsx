import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logAudit } from "@/lib/audit-log";
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
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_admin")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "SEZA Admin" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/admin/auth" });
    }
    // Authoritative check via server-enforced RLS + SECURITY DEFINER helper.
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isSuper = !rolesErr && (roles ?? []).some((r) => (r.role as string) === "super_admin");
    if (!isSuper) {
      await logAudit({ action: "override.denied", entity: "admin", details: { path: "/admin", reason: "not_super_admin" } }).catch(() => {});
      throw redirect({ to: "/admin/auth" });
    }
    return { user: data.user };
  },
  component: AdminLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/businesses", label: "Businesses", icon: Building2 },
  { to: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/admin/devices", label: "Devices", icon: Monitor },
  { to: "/admin/support", label: "Support", icon: LifeBuoy },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

function AdminLayout() {
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await logAudit({ action: "logout", entity: "admin" }).catch(() => {});
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-surface text-foreground">
      {/* Sidebar */}
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
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
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
        <div className="p-2 border-t">
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <header className="lg:hidden border-b bg-background px-4 py-2 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <Logo className="h-6" alt="SEZA POS" />
          <span className="text-xs font-semibold text-primary">ADMIN</span>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
