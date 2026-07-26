export type SocialPlatform = "facebook" | "instagram" | "x" | "linkedin" | "tiktok";

export type SocialLink = {
  platform: SocialPlatform;
  label: string;
  href: string;
};

export const SOCIAL_LINKS: SocialLink[] = [
  {
    platform: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/sezapos",
  },
  {
    platform: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/sezapos",
  },
  {
    platform: "x",
    label: "X",
    href: "https://x.com/sezapos",
  },
  {
    platform: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/sezapos",
  },
  {
    platform: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@sezapos",
  },
];
