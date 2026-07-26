import { cn } from "@/lib/utils";
import { useStoreBranding } from "@/hooks/useStoreBranding";
import { Logo } from "./Logo";

/**
 * Displays the merchant logo when available. If the merchant intentionally
 * has no logo, show their short POS display text/initials instead of a broken
 * image or the old placeholder mark.
 */
export function StoreLogo({ className, alt }: { className?: string; alt?: string }) {
  const { data, isLoading } = useStoreBranding();
  const label = alt ?? data?.name ?? "Store logo";

  if (isLoading && !data) return <Logo className={className} alt={label} />;

  if (!data?.hasCustomLogo) {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={cn(
          "grid place-items-center overflow-hidden bg-primary text-primary-foreground font-black tracking-tight leading-none select-none",
          className,
        )}
      >
        <span className="max-w-full truncate px-0.5 text-[0.45em] sm:text-[0.5em]">
          {data?.displayText || "S"}
        </span>
      </span>
    );
  }

  return (
    <img
      src={data.logoUrl}
      alt={label}
      className={cn("object-contain bg-white", className)}
      draggable={false}
    />
  );
}
