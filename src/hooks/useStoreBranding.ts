import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/seza-logo.png.asset.json";
import { resolveLogoUrl } from "@/components/brand/Logo";

const SEZA_LOGO = () => resolveLogoUrl(logoAsset.url);

export type StoreBranding = {
  storeId: string | null;
  name: string | null;
  logoUrl: string; // resolved for display (falls back to SEZA)
  receiptLogoUrl: string; // for receipts (falls back to logoUrl / SEZA)
  hasCustomLogo: boolean;
};

export function useStoreBranding() {
  return useQuery<StoreBranding>({
    queryKey: ["store-branding"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        return {
          storeId: null,
          name: null,
          logoUrl: SEZA_LOGO(),
          receiptLogoUrl: SEZA_LOGO(),
          hasCustomLogo: false,
        };
      }
      const { data } = await supabase
        .from("stores")
        .select("id, name, logo_url, receipt_logo_url")
        .limit(1)
        .maybeSingle();
      const logo = data?.logo_url && data.logo_url.trim() ? data.logo_url : SEZA_LOGO();
      const receipt =
        (data?.receipt_logo_url && data.receipt_logo_url.trim()) ||
        (data?.logo_url && data.logo_url.trim()) ||
        SEZA_LOGO();
      return {
        storeId: data?.id ?? null,
        name: data?.name ?? null,
        logoUrl: logo,
        receiptLogoUrl: receipt,
        hasCustomLogo: !!(data?.logo_url && data.logo_url.trim()),
      };
    },
  });
}
