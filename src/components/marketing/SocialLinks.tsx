import type { SVGProps } from "react";
import { SOCIAL_LINKS, type SocialPlatform } from "@/lib/social";
import { cn } from "@/lib/utils";

type SocialLinksProps = {
  className?: string;
  iconClassName?: string;
  tone?: "light" | "dark";
};

export function SocialLinks({
  className,
  iconClassName,
  tone = "light",
}: SocialLinksProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} aria-label="SEZA POS social media">
      {SOCIAL_LINKS.map((link) => (
        <a
          key={link.platform}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open SEZA POS on ${link.label}`}
          title={link.label}
          className={cn(
            "grid size-9 place-items-center rounded-full border transition-all hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
            tone === "dark"
              ? "border-white/10 bg-white/5 text-slate-300 hover:border-blue-300/50 hover:bg-blue-500/15 hover:text-white focus-visible:ring-offset-slate-950"
              : "border-slate-200 bg-white text-slate-600 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700",
            iconClassName,
          )}
        >
          <SocialIcon platform={link.platform} className="size-4" />
        </a>
      ))}
    </div>
  );
}

function SocialIcon({ platform, ...props }: SVGProps<SVGSVGElement> & { platform: SocialPlatform }) {
  switch (platform) {
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
          <path d="M13.7 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5H17V3.9c-.3 0-1.4-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.5v3h2.8v8h3.4Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
          <path d="M4.2 4h4.1l4.5 6 5-6H20l-6.2 7.4L20.3 20h-4.1l-4.8-6.4L6 20H3.7l6.7-8L4.2 4Zm3 1.8 9.9 12.4h1.7L8.9 5.8H7.2Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
          <path d="M6.5 8.2H3.3V20h3.2V8.2ZM4.9 3A1.9 1.9 0 1 0 5 6.8 1.9 1.9 0 0 0 4.9 3ZM20.7 13.2c0-3.6-1.9-5.3-4.5-5.3-2.1 0-3 1.1-3.5 1.9V8.2H9.5V20h3.2v-5.9c0-1.6.3-3.1 2.3-3.1 1.9 0 2 1.8 2 3.2V20h3.2l.5-6.8Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
          <path d="M14.2 3h3c.2 1.5 1.1 2.9 2.5 3.7v3.1a8 8 0 0 1-2.5-1v5.8A6.2 6.2 0 1 1 11 8.4v3.2a3.1 3.1 0 1 0 3.2 3V3Z" />
        </svg>
      );
  }
}
