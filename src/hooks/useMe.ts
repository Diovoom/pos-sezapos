import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cacheMeta, readMeta } from "@/lib/offline/db";
import { isOnlineNow } from "@/lib/offline/useOnline";

export type MeData = {
  user: { id: string; email?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any | null;
  roles: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any | null;
} | null;

const CACHE_KEY = "authenticated_me";

export function useMe() {
  return useQuery<MeData>({
    queryKey: ["me"],
    staleTime: 60_000,
    retry: (count) => isOnlineNow() && count < 2,
    queryFn: async () => {
      const cached = await readMeta<MeData>(CACHE_KEY).catch(() => undefined);
      // Offline means cache-only. Do not call Supabase Auth here because
      // getSession() can refresh an expired token and block until connectivity
      // returns. The register is prepared for offline use during an online
      // session, so the cached identity is the source of truth while offline.
      if (!isOnlineNow()) return cached ?? null;

      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user;
      if (!sessionUser) return cached ?? null;

      try {
        const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", sessionUser.id).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", sessionUser.id),
        ]);
        if (profileError) throw profileError;
        if (rolesError) throw rolesError;
        const profileStoreId = (profile as { store_id?: string | null } | null)?.store_id ?? null;
        // Never use .limit(1) across all tenants. Resolve the employee's own
        // store so offline caches cannot accidentally bind to another merchant.
        const storeResult = profileStoreId
          ? await supabase.from("stores").select("*").eq("id", profileStoreId).maybeSingle()
          : { data: null, error: null };
        if (storeResult.error) throw storeResult.error;
        const result: MeData = {
          user: { id: sessionUser.id, email: sessionUser.email },
          profile,
          roles: (roles ?? []).map((row) => row.role as string),
          store: storeResult.data ?? null,
        };
        await cacheMeta(CACHE_KEY, result).catch(() => {});
        await cacheMeta("profile", profile ?? null).catch(() => {});
        await cacheMeta("store", storeResult.data ?? null).catch(() => {});
        return result;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    },
  });
}
