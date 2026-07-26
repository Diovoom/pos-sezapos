import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useLayoutEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";
import { Logo } from "@/components/brand/Logo";
import { initializeAppUpdateWorkflow } from "@/lib/app-update";

import "@/i18n";
import { applyLanguage } from "@/i18n";
import { GlobalLanguageRuntime } from "@/components/i18n/GlobalLanguageRuntime";
import { installSessionBridge } from "@/integrations/supabase/session-bridge";
import { detectAndPersistNative, isPathAllowedInNative } from "@/lib/native";
import { NativeLoadingOverlay } from "@/components/NativeLoadingOverlay";
import { NativeRuntime } from "@/components/NativeRuntime";
import { currentApp, dashboardUrl, marketingUrl } from "@/lib/host";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { SOCIAL_LINKS } from "@/lib/social";

function FriendlyState({
  eyebrow,
  title,
  message,
  primaryLabel,
  onPrimary,
  secondaryHref = "/",
  secondaryLabel = "Go home",
}: {
  eyebrow: string;
  title: string;
  message: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-5 py-12 dark:bg-slate-950">
      <div className="pointer-events-none absolute left-1/2 top-[-180px] size-[440px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-3xl" />
      <section className="relative w-full max-w-lg rounded-[32px] border border-slate-200 bg-white p-7 text-center shadow-[0_30px_90px_-45px_rgba(15,23,42,0.55)] sm:p-10 dark:border-white/10 dark:bg-slate-900">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-blue-50 dark:bg-blue-500/10">
          <Logo className="size-12" alt="SEZA POS" />
        </span>
        <div className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-blue-700 dark:text-blue-200">
          {eyebrow}
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">
          {message}
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {primaryLabel && onPrimary && (
            <button
              type="button"
              onClick={onPrimary}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-blue-700 px-6 text-sm font-bold text-white transition-colors hover:bg-blue-800"
            >
              {primaryLabel}
            </button>
          )}
          <a
            href={secondaryHref}
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-white dark:hover:bg-white/5"
          >
            {secondaryLabel}
          </a>
        </div>
      </section>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <FriendlyState
      eyebrow="Page not found"
      title="That page is not available."
      message="The link may be old or the page may have moved. Your account and store data are safe."
      secondaryLabel="Return to SEZA POS"
    />
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <FriendlyState
      eyebrow="Temporary problem"
      title="SEZA could not load this page."
      message="Nothing was deleted. Check your connection and try again. If the problem continues, return home and contact SEZA Support."
      primaryLabel="Try again"
      onPrimary={() => {
        router.invalidate();
        reset();
      }}
      secondaryLabel="Go to homepage"
    />
  );
}

const SITE_TITLE = "SEZA POS | Smart Point of Sale System for Retail Businesses";
const SITE_DESCRIPTION =
  "SEZA POS is a modern point-of-sale system for retail stores, convenience stores, liquor stores, grocery stores, and small businesses. Manage sales, inventory, employees, receipts, reports, and payments in one platform.";
const OG_IMAGE = "https://sezapos.com/seza-og.jpg";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "author", content: "SEZA POS" },
      { name: "theme-color", content: "#1e40af" },
      { property: "og:site_name", content: "SEZA POS" },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/" },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "shortcut icon", href: "/favicon.ico" },
      {
        rel: "icon",
        type: "image/png",
        sizes: "48x48",
        href: "/seza-logo-48.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        href: "/seza-logo-192.png",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/seza-logo-180.png",
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "SEZA POS",
          legalName: "SEZA Technologies Inc.",
          logo: "https://sezapos.com/seza-logo-512.png",
          image: "https://sezapos.com/seza-og.jpg",
          url: "https://sezapos.com",
          telephone: LEGAL_CONFIG.phone,
          contactPoint: {
            "@type": "ContactPoint",
            telephone: LEGAL_CONFIG.phone,
            contactType: "customer service",
            availableLanguage: ["English", "French", "Haitian Creole"],
          },
          description:
            "Modern cloud point-of-sale platform for convenience stores, mini marts, liquor, and retail.",
          sameAs: SOCIAL_LINKS.map((link) => link.href),
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "SEZA POS",
          url: "https://sezapos.com",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RouteScrollManager() {
  const href = useRouterState({ select: (state) => state.location.href });

  useLayoutEffect(() => {
    const moveToDestination = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        const target = document.getElementById(decodeURIComponent(hash));
        if (target) {
          target.scrollIntoView({ behavior: "auto", block: "start" });
          return;
        }
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.getElementById("seza-page-top")?.focus({ preventScroll: true });
    };

    moveToDestination();
    const frame = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(moveToDestination),
    );
    const timer = window.setTimeout(moveToDestination, 180);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [href]);

  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("i18nextLng") : null;
    if (saved) applyLanguage(saved);
    installSessionBridge();
    void initializeAppUpdateWorkflow();
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  // Keep each public hostname on one clear product surface. This is host-aware
  // routing inside one deployed SEZA project: marketing on sezapos.com, merchant
  // owner access on dashboard.sezapos.com, and platform staff on admin.sezapos.com.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const app = currentApp();
    if (app === "unknown") return; // localhost / hosted preview

    const path = window.location.pathname;
    const suffix = `${path}${window.location.search}${window.location.hash}`;

    const dashboardPrefixes = [
      "/auth",
      "/signup",
      "/select-plan",
      "/reset-password",
      "/dashboard",
      "/sales",
      "/products",
      "/inventory",
      "/customers",
      "/employees",
      "/payroll",
      "/shifts",
      "/reports",
      "/devices",
      "/settings",
      "/support",
      "/setup",
      "/onboarding",
      "/customer-display",
    ];

    const isDashboardPath = dashboardPrefixes.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );

    if (app === "admin") {
      if (path === "/" || (!path.startsWith("/admin") && !path.startsWith("/reset-password"))) {
        window.location.replace("/admin");
      }
      return;
    }

    // Temporary browser POS remains enabled for hardware/customer-display
    // testing. Keep this isolated to the POS hostname and remove this branch
    // when the Android rollout is accepted.
    if (app === "pos") {
      const posPrefixes = [
        "/auth",
        "/pos",
        "/register",
        "/refunds",
        "/timeclock",
        "/inventory",
        "/customers",
        "/products",
        "/shifts",
        "/settings",
        "/support",
        "/pending-sync",
        "/customer-display",
      ];
      if (path === "/") {
        window.location.replace("/auth");
        return;
      }
      const allowed = posPrefixes.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      );
      if (!allowed) window.location.replace("/auth");
      return;
    }

    if (app === "marketing") {
      if (isDashboardPath) window.location.replace(dashboardUrl(suffix));
      return;
    }

    if (app === "dashboard") {
      if (path === "/") {
        void supabase.auth.getSession().then(({ data }) => {
          window.location.replace(data.session ? "/dashboard" : "/auth");
        });
        return;
      }

      // Marketing, public support, legal, and SEO pages remain on sezapos.com.
      if (!isDashboardPath) window.location.replace(marketingUrl(suffix));
    }
  }, []);

  // Native Android shell: keep employees inside the POS surface. Marketing
  // pages, owner dashboards, and the platform admin are all off-limits from
  // the mobile app.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const native = detectAndPersistNative();
    if (!native) return;
    document.documentElement.classList.add("native-app");
    const enforce = () => {
      const path = window.location.pathname;
      if (!isPathAllowedInNative(path)) {
        router.navigate({ to: "/auth", replace: true });
      }
    };
    enforce();
    const unsub = router.subscribe("onResolved", enforce);
    return () => {
      unsub();
    };
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouteScrollManager />
      <GlobalLanguageRuntime />
      <NativeRuntime queryClient={queryClient} />
      <PaymentTestModeBanner />
      <AppUpdateNotice />
      <Outlet />
      <Toaster richColors position="top-right" />
      <NativeLoadingOverlay />
    </QueryClientProvider>
  );
}
