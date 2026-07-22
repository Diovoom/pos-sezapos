import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Cookie,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Logo } from "@/components/brand/Logo";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { dashboardUrl } from "@/lib/host";
import { CookieConsent, OPEN_COOKIE_SETTINGS_EVENT } from "@/components/marketing/CookieConsent";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; description?: string };

const PRODUCT_ITEMS: NavItem[] = [
  { to: "/features", label: "All features", description: "Checkout, inventory, teams and reports" },
  { to: "/features", label: "Sell", description: "Fast register and receipt workflows" },
  { to: "/features", label: "Manage", description: "Inventory, shifts and cash control" },
  { to: "/integrations", label: "Integrations", description: "Payments, messaging and hardware" },
];

const RESOURCE_ITEMS: NavItem[] = [
  { to: "/hardware", label: "Hardware", description: "Build a setup that fits your counter" },
  { to: "/security", label: "Security", description: "How SEZA protects merchant data" },
  { to: "/support", label: "Support", description: "Get help with your account or register" },
  { to: "/faq", label: "FAQ", description: "Answers before you get started" },
];

function NavDropdown({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white">
        {label}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-2xl p-2 shadow-xl">
        {items.map((item) => (
          <DropdownMenuItem asChild key={`${item.label}-${item.to}`} className="rounded-xl p-0">
            <Link to={item.to} className="group block cursor-pointer px-3 py-3">
              <span className="block text-sm font-semibold text-foreground group-hover:text-primary">{item.label}</span>
              {item.description && (
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
              )}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <span className="relative block size-5" aria-hidden="true">
      <span className={cn("absolute left-0 top-[3px] h-0.5 w-5 rounded-full bg-current transition-all duration-300", open && "top-[9px] rotate-45")} />
      <span className={cn("absolute left-1 top-[9px] h-0.5 w-4 rounded-full bg-current transition-all duration-300", open && "translate-x-2 opacity-0")} />
      <span className={cn("absolute bottom-[3px] left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300", open && "bottom-[9px] -rotate-45")} />
    </span>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const openCookieSettings = () => {
    window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/88 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/88">
        <div className="mx-auto grid h-[76px] max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
            <NavDropdown label="Product" items={PRODUCT_ITEMS} />
            <Link to="/industries" className="inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white">
              Industries
            </Link>
            <Link to="/pricing" className="inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white">
              Pricing
            </Link>
            <NavDropdown label="Resources" items={RESOURCE_ITEMS} />
          </nav>

          <Link to="/" aria-label="SEZA POS home" className="group flex items-center justify-center">
            <span className="relative grid size-12 place-items-center rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_28px_-14px_rgba(37,99,235,0.65)] transition-transform duration-300 group-hover:-translate-y-0.5 dark:border-white/10 dark:bg-slate-900">
              <Logo className="size-9 rounded-xl" alt="SEZA POS" />
              <span className="absolute -inset-1 -z-10 rounded-[20px] bg-primary/15 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
            </span>
          </Link>

          <div className="flex items-center justify-end gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <Button asChild size="sm" variant="ghost" className="rounded-full px-4">
                <a href={dashboardUrl("/auth")} target="_blank" rel="noopener noreferrer">Sign in</a>
              </Button>
              <Button asChild size="sm" className="rounded-full px-5 shadow-[0_10px_25px_-12px_rgba(37,99,235,0.8)]">
                <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">Start free trial</a>
              </Button>
            </div>

            <button
              type="button"
              className="group grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:hidden dark:border-white/10 dark:bg-slate-900 dark:text-white"
              aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((value) => !value)}
            >
              <MenuGlyph open={mobileOpen} />
            </button>
          </div>
        </div>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-[min(92vw,390px)] overflow-y-auto border-l bg-background p-0">
          <SheetHeader className="border-b p-6 text-left">
            <SheetTitle className="flex items-center gap-3">
              <Logo className="size-10 rounded-xl" />
              <span>
                <span className="block text-base font-bold">SEZA POS</span>
                <span className="block text-xs font-normal text-muted-foreground">Smart POS. Better business.</span>
              </span>
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-7 p-6">
            <MobileGroup title="Product" items={PRODUCT_ITEMS} close={() => setMobileOpen(false)} />
            <div className="grid grid-cols-2 gap-2">
              <MobileSingleLink to="/industries" label="Industries" close={() => setMobileOpen(false)} />
              <MobileSingleLink to="/pricing" label="Pricing" close={() => setMobileOpen(false)} />
            </div>
            <MobileGroup title="Resources" items={RESOURCE_ITEMS} close={() => setMobileOpen(false)} />

            <div className="space-y-2 border-t pt-6">
              <Button asChild variant="outline" className="h-11 w-full rounded-xl">
                <a href={dashboardUrl("/auth")} target="_blank" rel="noopener noreferrer">Sign in</a>
              </Button>
              <Button asChild className="h-11 w-full rounded-xl">
                <a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">Start 14-day free trial</a>
              </Button>
              <p className="pt-1 text-center text-xs text-muted-foreground">No credit card required.</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <main>{children}</main>

      <footer className="relative overflow-hidden border-t border-slate-200 bg-slate-950 text-white">
        <div className="pointer-events-none absolute -right-48 -top-48 size-[420px] rounded-full bg-blue-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-52 -left-40 size-[380px] rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-18">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.35fr_repeat(4,1fr)]">
            <div>
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-white shadow-lg">
                  <Logo className="size-8 rounded-lg" alt="SEZA POS" />
                </span>
                <div>
                  <div className="font-bold tracking-tight">SEZA POS</div>
                  <div className="text-xs text-slate-400">Smart POS. Better business.</div>
                </div>
              </div>
              <p className="mt-5 max-w-sm text-sm leading-6 text-slate-400">
                Modern point-of-sale software for independent stores that need fast checkout, clear inventory, accountable shifts and useful reports.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                <LockKeyhole className="size-3.5 text-blue-300" />
                Subscription payments securely processed by Stripe
              </div>
            </div>

            <FooterColumn title="Product" links={[
              { to: "/features", label: "Features" },
              { to: "/industries", label: "Industries" },
              { to: "/pricing", label: "Pricing" },
              { to: "/hardware", label: "Hardware" },
              { to: "/integrations", label: "Integrations" },
            ]} />

            <FooterColumn title="Company" links={[
              { to: "/about", label: "About" },
              { to: "/contact", label: "Contact" },
              { to: "/status", label: "System status" },
            ]} />

            <FooterColumn title="Help & trust" links={[
              { to: "/support", label: "Support" },
              { to: "/faq", label: "FAQ" },
              { to: "/security", label: "Security" },
              { to: "/trust", label: "Trust center" },
            ]} />

            <FooterColumn title="Legal" links={[
              { to: "/legal", label: "Legal center" },
              { to: "/legal/terms", label: "Terms of Service" },
              { to: "/legal/privacy", label: "Privacy Policy" },
              { to: "/legal/cookies", label: "Cookie Policy" },
              { to: "/legal/refund", label: "Refund Policy" },
              { to: "/legal/accessibility", label: "Accessibility" },
            ]} />
          </div>

          <div className="mt-12 grid gap-4 border-t border-white/10 pt-6 text-xs text-slate-400 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span>© {new Date().getFullYear()} SEZA Technologies. All rights reserved.</span>
              <a href={`mailto:${LEGAL_CONFIG.supportEmail}`} className="transition-colors hover:text-white">{LEGAL_CONFIG.supportEmail}</a>
            </div>
            <button type="button" onClick={openCookieSettings} className="inline-flex items-center gap-2 justify-self-start rounded-full border border-white/10 px-3 py-2 transition-colors hover:border-white/25 hover:text-white md:justify-self-end">
              <Cookie className="size-3.5" /> Cookie settings
            </button>
          </div>
        </div>
      </footer>

      <CookieConsent />
    </div>
  );
}

function MobileGroup({ title, items, close }: { title: string; items: NavItem[]; close: () => void }) {
  return (
    <div>
      <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      <div className="space-y-1">
        {items.map((item) => (
          <Link key={`${item.label}-${item.to}`} to={item.to} onClick={close} className="group flex items-center justify-between rounded-2xl px-3 py-3 transition-colors hover:bg-muted">
            <span>
              <span className="block text-sm font-semibold">{item.label}</span>
              {item.description && <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>}
            </span>
            <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function MobileSingleLink({ to, label, close }: { to: string; label: string; close: () => void }) {
  return (
    <Link to={to} onClick={close} className="rounded-2xl border bg-card px-4 py-3 text-center text-sm font-semibold shadow-sm transition-colors hover:border-primary/40 hover:text-primary">
      {label}
    </Link>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<{ to: string; label: string }> }) {
  return (
    <div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
        {links.map((link) => (
          <li key={`${title}-${link.to}`}>
            <Link to={link.to} className="transition-colors hover:text-white">{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
