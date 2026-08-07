import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cacheMeta, readMeta } from "@/lib/offline/db";
import { isOnlineNow } from "@/lib/offline/useOnline";

export type MeData = {
  user: { id: string; email?: string };
  profile: any | null;
  roles: string[];
  store: any | null;
} | null;

const CURRENT_USER_KEY = "authenticated_me_current_user";
const cacheKey = (userId: string) => `authenticated_me:${userId}`;

async function fetchMeForUser(sessionUser: { id: string; email?: string }): Promise<MeData> {
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", sessionUser.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", sessionUser.id),
    ]);
  if (profileError) throw profileError;
  if (rolesError) throw rolesError;

  const storeId = (profile as { store_id?: string | null } | null)?.store_id ?? null;
  const storeResult = storeId
    ? await supabase.from("stores").select("*").eq("id", storeId).maybeSingle()
    : { data: null, error: null };
  if (storeResult.error) throw storeResult.error;

  return {
    user: { id: sessionUser.id, email: sessionUser.email },
    profile,
    roles: (roles ?? []).map((row) => row.role as string),
    store: storeResult.data ?? null,
  };
}

async function cacheMe(result: Exclude<MeData, null>) {
  await Promise.all([
    cacheMeta(cacheKey(result.user.id), result),
    cacheMeta(CURRENT_USER_KEY, result.user.id),
    cacheMeta(`profile:${result.user.id}`, result.profile ?? null),
    cacheMeta(`store:${result.user.id}`, result.store ?? null),
    // Compatibility for older code paths. These always represent only the
    // employee who is currently authenticated on this device.
    cacheMeta("profile", result.profile ?? null),
    cacheMeta("store", result.store ?? null),
  ]).catch(() => {});
}

export function useMe() {
  const qc = useQueryClient();
  return useQuery<MeData>({
    queryKey: ["me"],
    staleTime: 60_000,
    retry: (count) => isOnlineNow() && count < 2,
    queryFn: async () => {
      // getSession is normally a local storage read and gives us the exact
      // employee id needed to choose the correct local cache.
      let sessionUser: { id: string; email?: string } | undefined;
      try {
        const result = await Promise.race([
          supabase.auth.getSession().then(({ data }) => data.session?.user ?? null),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 700)),
        ]);
        sessionUser = result ? { id: result.id, email: result.email } : undefined;
      } catch {
        // If completely offline, fall through to the last authenticated user.
      }

      if (!sessionUser) {
        const lastUserId = await readMeta<string>(CURRENT_USER_KEY).catch(() => undefined);
        if (!lastUserId) return null;
        const cached = await readMeta<MeData>(cacheKey(lastUserId)).catch(() => undefined);
        return cached?.user.id === lastUserId ? cached : null;
      }

      const cached = await readMeta<MeData>(cacheKey(sessionUser.id)).catch(() => undefined);
      const validCached = cached?.user.id === sessionUser.id ? cached : null;
      if (!isOnlineNow()) return validCached;

      // Local-first: if this employee has already synced once, render them
      // immediately and refresh their profile/roles/store in the background.
      if (validCached) {
        void fetchMeForUser(sessionUser)
          .then(async (fresh) => {
            if (!fresh) return;
            await cacheMe(fresh);
            qc.setQueryData(["me"], fresh);
          })
          .catch(() => {});
        return validCached;
      }

      const fresh = await fetchMeForUser(sessionUser);
      if (fresh) await cacheMe(fresh);
      return fresh;
    },
  });
}
