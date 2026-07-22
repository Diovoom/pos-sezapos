import { cn } from "@/lib/utils";
import logoUrl from "@/assets/seza-mark.jpg";

/**
 * The primary SEZA mark is bundled with the application instead of relying on
 * an external asset host. That keeps the website, authentication pages and
 * generated builds consistently branded even before a network request is made.
 */
export function resolveLogoUrl(url: string = logoUrl): string {
  return url;
}

export const LOGO_URL_FN = () => resolveLogoUrl();

export function Logo({ className, alt = "SEZA POS" }: { className?: string; alt?: string }) {
  return (
    <img
      src={resolveLogoUrl()}
      alt={alt}
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}
