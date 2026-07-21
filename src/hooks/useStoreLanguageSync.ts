import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyLanguage } from "@/i18n";
import { useMe } from "@/hooks/useMe";

/**
 * Keeps the owner dashboard and every online Android register on the store's
 * selected language. This is intentionally store-wide rather than tied to one
 * browser profile.
 */
export function useStoreLanguageSync() {
  const qc = useQueryClient();
  const me = useMe();
  const storeId = (me.data?.profile?.store_id ?? me.data?.store?.id) as string | undefined;

  const language = useQuery({
    queryKey: ["store-language", storeId],
    enabled: !!storeId,
    staleTime: 0,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("language, locale")
        .eq("id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data?.language || data?.locale || "en-US";
    },
  });

  useEffect(() => {
    if (language.data) applyLanguage(language.data);
  }, [language.data]);

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`store-language:${storeId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stores", filter: `id=eq.${storeId}` },
        () => void qc.invalidateQueries({ queryKey: ["store-language", storeId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, storeId]);

  return language;
}
