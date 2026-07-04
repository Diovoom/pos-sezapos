import { createFileRoute } from "@tanstack/react-router";
import { getAppFromHost } from "@/lib/host";

// Host-aware robots.txt:
// - sezapos.com                 → allow marketing crawling
// - dashboard.* / pos.*         → disallow everything (private app surfaces)
// - anything else (previews)    → disallow (don't index preview builds)
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const host = request.headers.get("host");
        const app = getAppFromHost(host);
        const isMarketing = app === "marketing";
        const body = isMarketing
          ? [
              "User-agent: *",
              "Allow: /",
              "Disallow: /auth",
              "Disallow: /reset-password",
              "Disallow: /api/",
              "Disallow: /lovable/",
              "",
              "Sitemap: https://sezapos.com/sitemap.xml",
              "",
            ].join("\n")
          : ["User-agent: *", "Disallow: /", ""].join("\n");
        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
