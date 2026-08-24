import { createFileRoute } from "@tanstack/react-router";

const MARKETING_HOSTS = new Set(["sezapos.com", "www.sezapos.com"]);

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const hostname = new URL(request.url).hostname.toLowerCase();
        const isMarketing = MARKETING_HOSTS.has(hostname);

        const lines = isMarketing
          ? [
              "User-agent: *",
              "Allow: /",
              "Disallow: /auth",
              "Disallow: /signup",
              "Disallow: /reset-password",
              "Disallow: /select-plan",
              "Disallow: /dashboard",
              "Disallow: /sales",
              "Disallow: /products",
              "Disallow: /inventory",
              "Disallow: /customers",
              "Disallow: /employees",
              "Disallow: /payroll",
              "Disallow: /shifts",
              "Disallow: /reports",
              "Disallow: /devices",
              "Disallow: /settings",
              "Disallow: /setup",
              "Disallow: /onboarding",
              "Disallow: /admin",
              "Disallow: /api/",
              "Disallow: /unsubscribe",
              "Disallow: /r/",
              "",
              "Sitemap: https://sezapos.com/sitemap.xml",
              "",
            ]
          : [
              "User-agent: *",
              "Allow: /",
              "",
              "# This host is excluded from search by X-Robots-Tag and page-level noindex.",
              "",
            ];

        return new Response(lines.join("\n"), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
