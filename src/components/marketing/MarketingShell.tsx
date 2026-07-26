import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Cookie,
  Headphones,
  LockKeyhole,
  Phone,
  MessageCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/Logo";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { dashboardUrl } from "@/lib/host";
import { CookieConsent, OPEN_COOKIE_SETTINGS_EVENT } from "@/components/marketing/CookieConsent";
import { SocialLinks } from "@/components/marketing/SocialLinks";
import { WebsiteLiveChat, openWebsiteLiveChat } from "@/components/marketing/WebsiteLiveChat";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; description?: string; badge?: string };

const PRODUCT_ITEMS: NavItem[] = [
  { to: "/features", label: "All features", description: "Checkout, inventory, teams and reports" },
  { to: "/features", label: "Sell", description: "Fast register and receipt workflows" },
  { to: "/features", label: "Manage", description: "Inventory, shifts and cash control" },
  { to: "/integrations", label: "Integrations", description: "Payments, messaging and hardware" },
];

const RESOURCE_ITEMS: NavItem[] = [
  { to: "/hardware", label: "Hardware", description: "Build a setup that fits your counter" },
  { to: "/security", label: "Security", description: "How SEZA protects merchant data" },
  {
    to: "/guide",
    label: "User guide",
    description: "Learn the register, inventory, shifts and reports",
  },
  { to: "/support", label: "Support", description: "Get help with your account or register" },
  { to: "/faq", label: "FAQ", description: "Answers before you get started" },
];

const MOBILE_ITEMS: NavItem[] = [
  { to: "/guide", label: "User guide", description: "How to use SEZA POS and what is included" },
  { to: "/hardware", label: "Hardware", description: "Compatibility and setup planning" },
  { to: "/features", label: "All features", description: "Everything inside SEZA POS" },
  { to: "/industries", label: "Industries", description: "See how SEZA fits your business" },
  { to: "/pricing", label: "Pricing", description: "Simple monthly plans" },
  { to: "/support", label: "Support", description: "Get help from SEZA" },
  { to: "/faq", label: "FAQ", description: "Common questions and answers" },
];

const useBrowserLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
            <Link to={item.to} resetScroll className="group block cursor-pointer px-3 py-3">
              <span className="block text-sm font-semibold text-foreground group-hover:text-primary">
                {item.label}
              </span>
              {item.description && (
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </span>
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
      <span
        className={cn(
          "absolute left-0 top-[3px] h-0.5 w-5 rounded-full bg-current transition-all duration-300",
          open && "top-[9px] rotate-45",
        )}
      />
      <span
        className={cn(
          "absolute left-1 top-[9px] h-0.5 w-4 rounded-full bg-current transition-all duration-300",
          open && "translate-x-2 opacity-0",
        )}
      />
      <span
        className={cn(
          "absolute bottom-[3px] left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300",
          open && "bottom-[9px] -rotate-45",
        )}
      />
    </span>
  );
}

function MorphingBrand({ expanded }: { expanded: boolean }) {
  return (
    <Link
      to="/"
      resetScroll
      aria-label="SEZA POS home"
      className={cn(
        "group relative flex h-12 items-center justify-center overflow-hidden rounded-2xl transition-[width] duration-700 ease-[cubic-bezier(.22,1,.36,1)]",
        expanded ? "w-[136px]" : "w-12",
      )}
    >
      <span
        className={cn(
          "absolute left-0 grid size-12 place-items-center transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)]",
          expanded
            ? "-translate-x-10 -rotate-[360deg] scale-75 opacity-0"
            : "translate-x-0 rotate-0 scale-100 opacity-100",
        )}
      >
        <span className="relative grid size-11 place-items-center rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_28px_-14px_rgba(37,99,235,0.65)] dark:border-white/10 dark:bg-slate-900">
          <Logo className="size-8" alt="SEZA POS" />
          <span className="absolute -inset-1 -z-10 rounded-[20px] bg-primary/15 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
        </span>
      </span>

      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center whitespace-nowrap text-[16px] font-black tracking-[-0.035em] text-slate-950 transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)] dark:text-white",
          expanded ? "translate-x-0 opacity-100" : "translate-x-12 opacity-0",
        )}
      >
        SEZA POS
      </span>
    </Link>
  );
}

function HardwareCartButton() {
  return (
    <Link
      to="/guide"
      resetScroll
      aria-label="Open the SEZA POS user guide"
      title="SEZA POS user guide"
      className="group relative grid size-13 place-items-center rounded-full border-4 border-white bg-blue-600 text-white shadow-[0_15px_35px_-12px_rgba(37,99,235,0.85)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:border-slate-950"
    >
      <BookOpen className="size-6" />
      <span className="absolute -right-1 -top-2 rounded-full border-2 border-white bg-slate-950 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white shadow-sm dark:border-slate-950">
        Guide
      </span>
    </Link>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  const locationHref = useRouterState({ select: (state) => state.location.href });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [supportVisible, setSupportVisible] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useBrowserLayoutEffect(() => {
    setMobileOpen(false);
    setSupportVisible(true);
    setSupportOpen(false);

    const resetPosition = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        const target = document.getElementById(hash);
        if (target) {
          target.scrollIntoView({ block: "start", behavior: "auto" });
          return;
        }
      }

      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resetPosition();
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resetPosition);
    });
    const timers = [40, 160, 360].map((delay) => window.setTimeout(resetPosition, delay));

    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [locationHref]);

  const openCookieSettings = () => {
    window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
  };

  const hideSupport = () => {
    // Close it only for the current page view. It returns on the next website
    // entry or navigation instead of being permanently hidden in localStorage.
    setSupportOpen(false);
    setSupportVisible(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-[70] border-b border-slate-200/80 bg-white/88 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/88">
        <div className="mx-auto grid h-[76px] max-w-7xl grid-cols-[76px_minmax(0,1fr)_76px] items-center px-2 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-3 lg:px-8">
          <div className="flex min-w-0 items-center justify-start">
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
              <Link
                resetScroll
                to="/hardware"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/15"
              >
                Shop now
                <span className="hidden rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white xl:inline-flex">
                  Soon
                </span>
              </Link>
              <NavDropdown label="Product" items={PRODUCT_ITEMS} />
              <Link
                resetScroll
                to="/industries"
                className="inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                Industries
              </Link>
              <Link
                resetScroll
                to="/pricing"
                className="inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                Pricing
              </Link>
              <NavDropdown label="Resources" items={RESOURCE_ITEMS} />
            </nav>
          </div>

          <div className="flex min-w-0 items-center justify-center">
            <MorphingBrand expanded={scrolled} />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              asChild
              size="sm"
              className="hidden rounded-full px-5 shadow-[0_10px_25px_-12px_rgba(37,99,235,0.8)] lg:inline-flex"
            >
              <a href={dashboardUrl("/dashboard")}>Login</a>
            </Button>

            <button
              type="button"
              className="group grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:border-white/10 dark:bg-slate-900 dark:text-white lg:hidden"
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
        <SheetContent
          side="right"
          className="bottom-0 top-[76px] z-[60] h-[calc(100dvh-76px)] w-[min(92vw,390px)] overflow-y-auto border-l bg-background p-0 shadow-lg [&>button:first-of-type]:hidden"
        >
          <SheetHeader className="border-b px-6 py-5 text-left">
            <SheetTitle>
              <span className="block text-lg font-black tracking-tight">Explore SEZA POS</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Everything you need, without repeating the homepage.
              </span>
            </SheetTitle>
          </SheetHeader>

          <nav className="space-y-2 p-4" aria-label="Mobile navigation">
            {MOBILE_ITEMS.map((item, index) => (
              <Link
                key={item.label}
                to={item.to}
                resetScroll
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "group flex items-center justify-between rounded-2xl border px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.035] hover:shadow-sm",
                  index === 0
                    ? "border-blue-200 bg-blue-50 dark:border-blue-400/20 dark:bg-blue-500/10"
                    : "border-slate-200 bg-card dark:border-white/10",
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    {index === 0 && <BookOpen className="size-4 text-primary" />}
                    <span className="text-sm font-bold">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        {item.badge}
                      </span>
                    )}
                  </span>
                  {item.description && (
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                openWebsiteLiveChat();
              }}
              className="group flex w-full items-center justify-between rounded-2xl border border-blue-200 bg-blue-700 px-4 py-4 text-left text-white transition-all hover:bg-blue-800"
            >
              <span>
                <span className="flex items-center gap-2 text-sm font-bold">
                  <MessageCircle className="size-4" /> Contact us
                </span>
                <span className="mt-1 block text-xs leading-5 text-blue-100">
                  Start a live chat with SEZA Support
                </span>
              </span>
              <ArrowUpRight className="size-4" />
            </button>
          </nav>

          <div className="border-t p-4">
            <Button asChild className="h-11 w-full rounded-full font-bold">
              <a href={dashboardUrl("/dashboard")}>Login to owner dashboard</a>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <main id="seza-page-top" tabIndex={-1}>
        {children}
      </main>

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
                Modern point-of-sale software for independent stores that need fast checkout, clear
                inventory, accountable shifts and useful reports.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                <LockKeyhole className="size-3.5 text-blue-300" />
                Subscription payments securely processed by Stripe
              </div>
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Follow SEZA POS
                </div>
                <SocialLinks tone="dark" />
              </div>
            </div>

            <FooterColumn
              title="Product"
              links={[
                { to: "/guide", label: "User guide" },
                { to: "/hardware", label: "Hardware compatibility" },
                { to: "/features", label: "Features" },
                { to: "/industries", label: "Industries" },
                { to: "/pricing", label: "Pricing" },
                { to: "/integrations", label: "Integrations" },
              ]}
            />

            <FooterColumn
              title="Company"
              links={[
                { to: "/about", label: "About" },
                { to: "/contact", label: "Contact" },
                { to: "/status", label: "System status" },
              ]}
            />

            <FooterColumn
              title="Help & trust"
              links={[
                { to: "/support", label: "Support" },
                { to: "/faq", label: "FAQ" },
                { to: "/security", label: "Security" },
                { to: "/trust", label: "Trust center" },
              ]}
            />

            <FooterColumn
              title="Legal"
              links={[
                { to: "/legal", label: "Legal center" },
                { to: "/legal/terms", label: "Terms of Service" },
                { to: "/legal/privacy", label: "Privacy Policy" },
                { to: "/legal/cookies", label: "Cookie Policy" },
                { to: "/legal/refund", label: "Refund Policy" },
                { to: "/legal/accessibility", label: "Accessibility" },
              ]}
            />
          </div>

          <div className="mt-12 grid gap-4 border-t border-white/10 pt-6 text-xs text-slate-400 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span>© {new Date().getFullYear()} SEZA Technologies Inc. All rights reserved.</span>
              <a
                href={`mailto:${LEGAL_CONFIG.supportEmail}`}
                className="transition-colors hover:text-white"
              >
                {LEGAL_CONFIG.supportEmail}
              </a>
              <a href={`tel:${LEGAL_CONFIG.phone}`} className="transition-colors hover:text-white">
                {LEGAL_CONFIG.phoneDisplay}
              </a>
            </div>
            <button
              type="button"
              onClick={openCookieSettings}
              className="inline-flex items-center gap-2 justify-self-start rounded-full border border-white/10 px-3 py-2 transition-colors hover:border-white/25 hover:text-white md:justify-self-end"
            >
              <Cookie className="size-3.5" /> Cookie settings
            </button>
          </div>
        </div>
      </footer>

      <div
        className="fixed bottom-24 right-3 z-[65] sm:bottom-6 sm:right-5"
        aria-label="SEZA hardware cart"
      >
        <HardwareCartButton />
      </div>

      {supportVisible && (
        <div
          className="fixed bottom-24 left-3 z-[65] sm:bottom-6 sm:left-5"
          aria-label="SEZA customer service"
        >
          {supportOpen && (
            <div className="absolute bottom-0 left-14 w-[min(78vw,300px)] overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-[0_24px_70px_-24px_rgba(30,64,175,0.65)] dark:border-blue-400/20 dark:bg-slate-900">
              <div className="border-b border-blue-900 bg-blue-800 px-5 py-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">
                      Customer service
                    </div>
                    <div className="mt-1 text-lg font-black">Need help with SEZA?</div>
                  </div>
                  <button
                    type="button"
                    onClick={hideSupport}
                    aria-label="Hide customer service widget"
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <p className="mt-3 text-sm leading-6 text-blue-50">
                  Call customer service or start a live chat for help with sales, setup, hardware,
                  pricing, or your account.
                </p>
              </div>
              <div className="space-y-3 p-4">
                <a
                  href={`tel:${LEGAL_CONFIG.phone}`}
                  className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-blue-950 transition-colors hover:bg-blue-100 dark:border-blue-400/15 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:bg-blue-500/15"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
                    <Phone className="size-5" />
                  </span>
                  <span>
                    <span className="block text-xs font-semibold text-blue-600 dark:text-blue-300">
                      Tap to call
                    </span>
                    <span className="block text-sm font-black">{LEGAL_CONFIG.phoneDisplay}</span>
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setSupportOpen(false);
                    openWebsiteLiveChat();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-800"
                >
                  <MessageCircle className="size-4" /> Start live chat
                </button>
                <Link
                  to="/support"
                  resetScroll
                  className="block text-center text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
                >
                  Open Support Center
                </Link>
              </div>
            </div>
          )}

          <div className="relative inline-flex">
            <button
              type="button"
              onClick={() => setSupportOpen((value) => !value)}
              aria-expanded={supportOpen}
              aria-label={
                supportOpen ? "Close customer service details" : "Open customer service details"
              }
              className="grid size-13 place-items-center rounded-full border-4 border-white bg-blue-600 text-white shadow-[0_15px_35px_-12px_rgba(37,99,235,0.85)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:border-slate-950"
            >
              <Headphones className="size-6" />
            </button>
            {!supportOpen && (
              <button
                type="button"
                onClick={hideSupport}
                aria-label="Hide customer service widget"
                className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-white bg-slate-900 text-white shadow-sm transition-transform hover:scale-110 dark:border-slate-950"
              >
                <X className="size-2.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <WebsiteLiveChat />
      <CookieConsent />
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ to: string; label: string }>;
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
        {links.map((link) => (
          <li key={`${title}-${link.to}-${link.label}`}>
            <Link to={link.to} resetScroll className="transition-colors hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
