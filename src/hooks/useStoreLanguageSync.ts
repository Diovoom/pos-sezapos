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
        .eq("id", storeId as string)
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
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`store-language:${storeId}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "stores", filter: `id=eq.${storeId}` },
          () => void qc.invalidateQueries({ queryKey: ["store-language", storeId] }),
        );
      channel.subscribe();
    } catch (error) {
      console.warn("[SEZA POS] realtime language sync unavailable; HTTPS sync remains active", error);
      if (channel) void supabase.removeChannel(channel).catch(() => undefined);
      channel = null;
    }
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [qc, storeId]);

  return language;
}
