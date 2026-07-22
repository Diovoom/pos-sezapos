import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MeData = {
  user: { id: string; email?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any | null;
  roles: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any | null;
} | null;

export function useMe() {
  return useQuery<MeData>({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile }, { data: roles }, { data: store }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase.from("stores").select("*").limit(1).maybeSingle(),
      ]);
      return {
        user: { id: u.user.id, email: u.user.email },
        profile,
        roles: (roles ?? []).map((r) => r.role as string),
        store,
      };
    },
  });
}
