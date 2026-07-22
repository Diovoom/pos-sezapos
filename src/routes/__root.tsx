import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

import "@/i18n";
import { applyLanguage } from "@/i18n";
import { installSessionBridge } from "@/integrations/supabase/session-bridge";
import { detectAndPersistNative, isPathAllowedInNative } from "@/lib/native";
import { NativeLoadingOverlay } from "@/components/NativeLoadingOverlay";
import { currentApp, dashboardUrl, marketingUrl } from "@/lib/host";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back
          home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const SITE_TITLE =
  "SEZA POS | Smart Point of Sale System for Retail Businesses";
const SITE_DESCRIPTION =
  "SEZA POS is a modern point-of-sale system for retail stores, convenience stores, liquor stores, grocery stores, and small businesses. Manage sales, inventory, employees, receipts, reports, and payments in one platform.";
const OG_IMAGE =
  "https://sezapos.com/seza-og.jpg";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
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
        {
          rel: "icon",
          type: "image/png",
          sizes: "32x32",
          href: "/favicon.png",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "192x192",
          href: "/icon-192.png",
        },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/apple-touch-icon.png",
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
            legalName: "SEZA Technologies",
            logo: "https://sezapos.com/icon-512.png",
            image: "https://sezapos.com/seza-og.jpg",
            url: "https://sezapos.com",
            description:
              "Modern cloud point-of-sale platform for convenience stores, mini marts, liquor, and retail.",
            sameAs: ["https://sezapos.com"],
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
  },
);

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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem("i18nextLng")
        : null;
    if (saved) applyLanguage(saved);
    installSessionBridge();
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED"
      )
        return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  // Keep each public hostname on one clear product surface. This is host-aware
  // routing inside one Lovable project: marketing on sezapos.com, merchant
  // owner access on dashboard.sezapos.com, and platform staff on admin.sezapos.com.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const app = currentApp();
    if (app === "unknown") return; // localhost / Lovable preview

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
      "/setup",
      "/onboarding",
    ];

    const isDashboardPath = dashboardPrefixes.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );

    if (app === "admin") {
      if (
        path === "/" ||
        (!path.startsWith("/admin") && !path.startsWith("/reset-password"))
      ) {
        window.location.replace("/admin");
      }
      return;
    }

    // The old browser POS hostname is retired. Employees use the Android app.
    if (app === "pos") {
      window.location.replace(dashboardUrl("/auth"));
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
      <PaymentTestModeBanner />
      <Outlet />
      <Toaster richColors position="top-right" />
      <NativeLoadingOverlay />
    </QueryClientProvider>
  );
}
