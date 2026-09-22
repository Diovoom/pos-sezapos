import { createFileRoute } from "@tanstack/react-router";

const REPOSITORY = "Diovoom/pos-sezapos";
const RELEASE_TAG = "seza-pos-latest";
const ASSET_NAME = "SEZA-POS-latest.apk";

function unavailable(message: string, status = 503) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export const Route = createFileRoute("/api/public/pos/apk")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.public.pos.apk",
          limit: 12,
          windowSeconds: 60,
          blockSeconds: 300,
          maxBodyBytes: 1024,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;

        const configuredUrl = process.env.SEZA_POS_APK_URL?.trim();
        if (configuredUrl) {
          try {
            const target = new URL(configuredUrl);
            if (target.protocol !== "https:") {
              return unavailable("SEZA POS download is not configured correctly.", 500);
            }
            return Response.redirect(target.toString(), 302);
          } catch {
            return unavailable("SEZA POS download is not configured correctly.", 500);
          }
        }

        const token = (process.env.SEZA_GITHUB_TOKEN || process.env.GITHUB_TOKEN)?.trim();
        if (!token) {
          return unavailable("SEZA POS download is temporarily unavailable.");
        }

        const githubHeaders = {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "SEZA-POS-Website",
        };

        const releaseResponse = await fetch(
          `https://api.github.com/repos/${REPOSITORY}/releases/tags/${RELEASE_TAG}`,
          { headers: githubHeaders, cache: "no-store" },
        );

        if (!releaseResponse.ok) {
          console.error("[SEZA APK] release lookup failed", releaseResponse.status);
          return unavailable("SEZA POS download is temporarily unavailable.", 502);
        }

        const release = (await releaseResponse.json()) as {
          assets?: Array<{ name?: string; url?: string }>;
        };
        const asset = release.assets?.find((item) => item.name === ASSET_NAME);
        if (!asset?.url) {
          console.error("[SEZA APK] release asset missing", ASSET_NAME);
          return unavailable("SEZA POS download is temporarily unavailable.", 502);
        }

        const assetResponse = await fetch(asset.url, {
          headers: {
            ...githubHeaders,
            Accept: "application/octet-stream",
          },
          redirect: "follow",
          cache: "no-store",
        });

        if (!assetResponse.ok || !assetResponse.body) {
          console.error("[SEZA APK] asset download failed", assetResponse.status);
          return unavailable("SEZA POS download is temporarily unavailable.", 502);
        }

        const headers = new Headers({
          "content-type": "application/vnd.android.package-archive",
          "content-disposition": 'attachment; filename="SEZA-POS-latest.apk"',
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        const contentLength = assetResponse.headers.get("content-length");
        if (contentLength) headers.set("content-length", contentLength);
        const etag = assetResponse.headers.get("etag");
        if (etag) headers.set("etag", etag);
        const lastModified = assetResponse.headers.get("last-modified");
        if (lastModified) headers.set("last-modified", lastModified);

        return new Response(assetResponse.body, { status: 200, headers });
      },
    },
  },
});
