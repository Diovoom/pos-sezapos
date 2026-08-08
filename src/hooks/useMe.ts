import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cacheMeta, readMeta } from "@/lib/offline/db";
import { isOnlineNow } from "@/lib/offline/useOnline";

export type MeData = {
  user: { id: string; email?: string };
  profile: any | null;
  roles: string[];
  store: any | null;
} | null;

const legacyCacheKey = "authenticated_me";
const cacheKeyForUser = (userId: string) => `authenticated_me:${userId}`;
const profileKeyForUser = (userId: string) => `profile:${userId}`;
const storeKey = (storeId: string) => `store:${storeId}`;

export function useMe() {
  return useQuery<MeData>({
    queryKey: ["me"],
    staleTime: 15_000,
    retry: (count) => isOnlineNow() && count < 1,
    queryFn: async () => {
      // Supabase getSession is local-storage backed. Resolve the CURRENT user
      // before touching any identity cache so one employee can never inherit
      // another employee's profile/roles after Switch user.
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user;
      if (!sessionUser) return null;

      const scopedKey = cacheKeyForUser(sessionUser.id);
      const cached = await readMeta<MeData>(scopedKey).catch(() => undefined);

      if (!isOnlineNow()) return cached ?? null;

      try {
        const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] =
          await Promise.all([
            supabase.from("profiles").select("*").eq("id", sessionUser.id).maybeSingle(),
            supabase.from("user_roles").select("role").eq("user_id", sessionUser.id),
          ]);
        if (profileError) throw profileError;
        if (rolesError) throw rolesError;

        const profileStoreId = (profile as { store_id?: string | null } | null)?.store_id ?? null;
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

        await Promise.all([
          cacheMeta("authenticated_me_current_user", sessionUser.id).catch(() => {}),
          cacheMeta(scopedKey, result).catch(() => {}),
          cacheMeta(profileKeyForUser(sessionUser.id), profile ?? null).catch(() => {}),
          profileStoreId
            ? cacheMeta(storeKey(profileStoreId), storeResult.data ?? null).catch(() => {})
            : Promise.resolve(),
        ]);

        // Keep the old keys only as a migration aid for non-identity data.
        // Never read legacy authenticated_me as an identity fallback.
        await cacheMeta(legacyCacheKey, null).catch(() => {});
        return result;
      } catch (error) {
        // Only the cache for THIS authenticated user is allowed as fallback.
        if (cached) return cached;
        throw error;
      }
    },
  });
}
