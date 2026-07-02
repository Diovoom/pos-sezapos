import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { useSession } from "@/hooks/useSession";
import { useMe } from "@/hooks/useMe";

export type PlanTier = "expired" | "starter" | "pro" | "trial_pro" | "business";
export type PlanStatus = "trialing" | "active" | "past_due" | "paused" | "canceled" | "expired";

export interface PlanState {
  tier: PlanTier;
  status: PlanStatus;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  isReadOnly: boolean;
  isTrialing: boolean;
  daysLeft: number | null;
  environment: "sandbox" | "live";
}

const rank: Record<PlanTier, number> = {
  expired: 0,
  starter: 1,
  pro: 2,
  trial_pro: 2,
  business: 3,
};

export function tierMeetsMin(tier: PlanTier, min: PlanTier): boolean {
  return rank[tier] >= rank[min];
}

export function useSubscription() {
  const { session } = useSession();
  const { data: me } = useMe();
  const storeId = (me?.profile?.store_id as string | undefined) ?? me?.store?.id ?? null;
  const env = getPaddleEnvironment();

  return useQuery<PlanState | null>({
    queryKey: ["subscription", storeId, env, session?.user.id],
    enabled: !!storeId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!storeId) return null;
      const { data: store, error } = await supabase
        .from("stores")
        .select("plan_tier, plan_status, plan_period_end, plan_cancel_at_period_end, trial_ends_at")
        .eq("id", storeId)
        .maybeSingle();
      if (error) throw error;
      if (!store) return null;
      const tier = (store.plan_tier ?? "expired") as PlanTier;
      const status = (store.plan_status ?? "expired") as PlanStatus;
      const periodEnd = store.plan_period_end ? new Date(store.plan_period_end) : null;
      const now = new Date();
      const active =
        (status === "active" || status === "trialing" || status === "past_due") &&
        (!periodEnd || periodEnd > now);
      const daysLeft = periodEnd
        ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000))
        : null;
      return {
        tier,
        status,
        periodEnd,
        cancelAtPeriodEnd: !!store.plan_cancel_at_period_end,
        isReadOnly: !active,
        isTrialing: status === "trialing",
        daysLeft,
        environment: env,
      };
    },
  });
}

export function usePlanGate() {
  const { data: plan } = useSubscription();
  const tier = plan?.tier ?? "expired";
  return {
    plan,
    tier,
    isReadOnly: plan?.isReadOnly ?? false,
    can: (minTier: PlanTier) => tierMeetsMin(tier, minTier) && !plan?.isReadOnly,
    meets: (minTier: PlanTier) => tierMeetsMin(tier, minTier),
  };
}
