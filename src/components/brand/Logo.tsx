import { cn } from "@/lib/utils";
import logoAsset from "@/assets/seza-logo.png.asset.json";

// In the bundled Capacitor Android app, the WebView origin is
// `capacitor://localhost` (or `http://localhost`), so a relative Lovable
// CDN URL like `/__l5e/assets-v1/...` resolves to a local path that does
// not exist and the image breaks. Force an absolute HTTPS URL when we're
// not being served from a real https origin.
export function resolveLogoUrl(url: string = logoAsset.url): string {
  if (typeof window === "undefined") return url;
  if (/^https?:\/\//i.test(url)) return url;
  const origin = window.location.origin;
  if (origin.startsWith("https://")) return url;
  return `https://sezapos.com${url.startsWith("/") ? "" : "/"}${url}`;
}

export const LOGO_URL_FN = () => resolveLogoUrl(logoAsset.url);

export function Logo({ className, alt = "SEZA POS" }: { className?: string; alt?: string }) {
  return (
    <img
      src={resolveLogoUrl(logoAsset.url)}
      alt={alt}
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}
