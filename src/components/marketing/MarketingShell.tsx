import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Cookie,
  LockKeyhole,
  Phone,
  MessageCircle,
  X,
  ShoppingCart,
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
  { to: "/hardware", label: "Hardware", description: "In production now", badge: "Coming soon" },
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

function MorphingBrand({ progress }: { progress: number }) {
  return (
    <Link
      to="/"
      resetScroll
      aria-label="SEZA POS home"
      className="group relative block h-12 w-[156px] self-center"
    >
      <span
        className="absolute top-0 grid size-12 place-items-center rounded-2xl border border-blue-200 bg-blue-50 shadow-[0_10px_28px_-14px_rgba(37,99,235,0.75)] transition-transform duration-150 group-hover:scale-[1.03] dark:border-blue-400/20 dark:bg-blue-500/10"
        style={{ transform: `translateX(${54 * (1 - progress)}px)` }}
      >
        <Logo className="size-9" alt="SEZA POS" />
      </span>
      <span
        className="absolute left-[58px] top-1/2 whitespace-nowrap text-[16px] font-black tracking-[-0.035em] text-slate-950 dark:text-white"
        style={{
          opacity: progress,
          transform: `translateY(-50%) translateX(${10 * (1 - progress)}px)`,
        }}
      >
        SEZA POS
      </span>
    </Link>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  const locationHref = useRouterState({ select: (state) => state.location.href });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [homeScrollProgress, setHomeScrollProgress] = useState(0);
  const [salesOpen, setSalesOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/") {
      setHomeScrollProgress(1);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const top = Math.max(
        window.scrollY || 0,
        document.documentElement.scrollTop || 0,
        document.body.scrollTop || 0,
      );
      setHomeScrollProgress(Math.min(1, Math.max(0, top / 120)));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.visualViewport?.addEventListener("scroll", schedule, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      document.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [pathname]);

  useBrowserLayoutEffect(() => {
    setMobileOpen(false);
    setSalesOpen(false);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-[70] border-b border-slate-200/80 bg-white/88 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/88">
        <div className="mx-auto grid h-[76px] max-w-7xl grid-cols-[76px_minmax(0,1fr)_76px] items-center px-2 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-3 lg:px-8">
          <div className="flex min-w-0 items-center justify-start">
            <button
              type="button"
              className="group grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:border-white/10 dark:bg-slate-900 dark:text-white lg:hidden"
              aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((value) => !value)}
            >
              <MenuGlyph open={mobileOpen} />
            </button>
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
            <MorphingBrand progress={homeScrollProgress} />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              asChild
              size="sm"
              className="hidden rounded-full px-5 shadow-[0_10px_25px_-12px_rgba(37,99,235,0.8)] lg:inline-flex"
            >
              <a href={dashboardUrl("/dashboard")}>Login</a>
            </Button>

            <Link
              to="/hardware"
              resetScroll
              className="relative grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary dark:border-white/10 dark:bg-slate-900 dark:text-white lg:hidden"
              aria-label="SEZA hardware coming soon"
            >
              <ShoppingCart className="size-5" />
              <span className="absolute -right-2 -top-2 rounded-full bg-blue-700 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white">
                Soon
              </span>
            </Link>
          </div>
        </div>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="inset-0 z-[90] h-dvh w-screen max-w-none overflow-y-auto border-0 bg-white p-0 shadow-none dark:bg-slate-950 [&>button:first-of-type]:hidden"
        >
          <SheetHeader className="sticky top-0 z-10 border-b bg-white/95 px-5 py-4 text-left backdrop-blur dark:bg-slate-950/95">
            <div className="flex items-center justify-between gap-4">
              <SheetTitle className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-blue-50 dark:bg-blue-500/10">
                  <Logo className="size-9" alt="SEZA POS" />
                </span>
                <span>
                  <span className="block text-lg font-black tracking-tight">SEZA POS</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Everything for your store
                  </span>
                </span>
              </SheetTitle>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="grid size-12 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-white"
              >
                <MenuGlyph open />
              </button>
            </div>
          </SheetHeader>

          <nav
            className="mx-auto grid w-full max-w-xl grid-cols-2 gap-2 px-4 py-4"
            aria-label="Mobile navigation"
          >
            {MOBILE_ITEMS.map((item, index) => (
              <Link
                key={item.label}
                to={item.to}
                resetScroll
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "group min-h-24 flex items-start justify-between rounded-2xl border px-3 py-3 transition-all hover:border-primary/35 hover:bg-primary/[0.035] hover:shadow-sm",
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
              className="group col-span-2 flex w-full items-center justify-between rounded-2xl border border-blue-200 bg-blue-700 px-4 py-3 text-left text-white transition-all hover:bg-blue-800"
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

          <div className="sticky bottom-0 border-t bg-white/95 p-5 backdrop-blur dark:bg-slate-950/95">
            <Button asChild className="h-14 w-full rounded-2xl text-base font-bold">
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

      {pathname === "/" && (
        <>
          <button
            type="button"
            onClick={() => setSalesOpen(true)}
            className="fixed inset-x-3 bottom-4 z-[65] mx-auto flex h-14 max-w-xl items-center justify-between rounded-2xl border border-blue-800 bg-blue-800 px-5 text-left text-white shadow-[0_20px_50px_-18px_rgba(30,64,175,0.85)] transition-transform hover:-translate-y-0.5 sm:bottom-6"
            aria-label="Contact SEZA sales"
          >
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.14em] text-blue-100">
                Questions before you start?
              </span>
              <span className="block text-sm font-black">Talk with a SEZA specialist</span>
            </span>
            <ArrowUpRight className="size-5 shrink-0" />
          </button>

          {salesOpen && (
            <div
              className="fixed inset-0 z-[95] flex items-end bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center sm:justify-center"
              onClick={() => setSalesOpen(false)}
            >
              <section
                className="w-full max-w-lg overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-2xl dark:border-blue-400/15 dark:bg-slate-950"
                role="dialog"
                aria-modal="true"
                aria-label="Contact SEZA sales"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="bg-blue-800 px-6 py-6 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">
                        SEZA Sales
                      </div>
                      <h2 className="mt-2 text-2xl font-black">Let us plan the right setup.</h2>
                      <p className="mt-2 text-sm leading-6 text-blue-50">
                        Get clear answers about pricing, hardware, setup, and your free trial.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSalesOpen(false)}
                      aria-label="Close contact sales"
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 hover:bg-white/25"
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 p-5">
                  <a
                    href={`tel:${LEGAL_CONFIG.phone}`}
                    className="flex min-h-16 items-center gap-4 rounded-2xl border border-slate-200 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-white/10 dark:hover:bg-blue-500/10"
                  >
                    <span className="grid size-11 place-items-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                      <Phone className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-black">Call sales</span>
                      <span className="block text-xs text-muted-foreground">
                        {LEGAL_CONFIG.phoneDisplay}
                      </span>
                    </span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setSalesOpen(false);
                      openWebsiteLiveChat();
                    }}
                    className="flex min-h-16 items-center gap-4 rounded-2xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-white/10 dark:hover:bg-blue-500/10"
                  >
                    <span className="grid size-11 place-items-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                      <MessageCircle className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-black">Chat with SEZA</span>
                      <span className="block text-xs text-muted-foreground">
                        Ask a question without leaving the page
                      </span>
                    </span>
                  </button>
                  <a
                    href="/contact#message-us"
                    onClick={() => setSalesOpen(false)}
                    className="flex min-h-16 items-center gap-4 rounded-2xl border border-slate-200 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-white/10 dark:hover:bg-blue-500/10"
                  >
                    <span className="grid size-11 place-items-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                      <ArrowUpRight className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-black">Request a consultation</span>
                      <span className="block text-xs text-muted-foreground">
                        Tell us what kind of store you run
                      </span>
                    </span>
                  </a>
                </div>
              </section>
            </div>
          )}
        </>
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
