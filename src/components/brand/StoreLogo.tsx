import { cn } from "@/lib/utils";
import { useStoreBranding } from "@/hooks/useStoreBranding";
import { Logo } from "./Logo";

/**
 * Displays the merchant's uploaded logo when available; falls back to SEZA.
 * Safe to use everywhere in the POS/dashboard header.
 */
export function StoreLogo({
  className,
  alt,
}: {
  className?: string;
  alt?: string;
}) {
  const { data } = useStoreBranding();
  const src = data?.logoUrl;
  const label = alt ?? data?.name ?? "Store logo";
  if (!src) return <Logo className={className} alt={label} />;
  return (
    <img
      src={src}
      alt={label}
      className={cn("object-contain bg-white", className)}
      draggable={false}
    />
  );
}
