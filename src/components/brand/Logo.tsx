import { cn } from "@/lib/utils";
import logoAsset from "@/assets/seza-logo.png.asset.json";

export function Logo({ className, alt = "SEZA POS" }: { className?: string; alt?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt={alt}
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}
