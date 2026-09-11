import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { useMe } from "@/hooks/useMe";
import { isNativeMode } from "@/lib/native";
import {
  planForTier,
  planLimit,
  tierIncludesFeature,
  type SezaFeatureKey,
  type SezaPlanLimits,
} from "@/lib/plans";

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

type StorePlanSnapshot = {
  plan_tier?: string | null;
  plan_status?: string | null;
  plan_period_end?: string | null;
  plan_cancel_at_period_end?: boolean | null;
};

function planStateFromStore(store: StorePlanSnapshot | null | undefined): PlanState | null {
  if (!store) return null;
  const storedTier = (store.plan_tier ?? "expired") as PlanTier;
  const status = (store.plan_status ?? "expired") as PlanStatus;
  const periodEnd = store.plan_period_end ? new Date(store.plan_period_end) : null;
  const now = new Date();
  const active =
    (status === "active" || status === "trialing" || status === "past_due") &&
    (!periodEnd || periodEnd > now);
  const tier: PlanTier = active ? storedTier : "expired";
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
  };
}

export function useSubscription() {
  const { session } = useSession();
  const { data: me } = useMe();
  const storeId = (me?.profile?.store_id as string | undefined) ?? me?.store?.id ?? null;
  const native = isNativeMode();
  const nativeStore = me?.store as StorePlanSnapshot | null | undefined;

  return useQuery<PlanState | null>({
    queryKey: [
      "subscription",
      storeId,
      session?.user.id,
      native ? nativeStore?.plan_tier ?? "expired" : "server",
      native ? nativeStore?.plan_status ?? "expired" : "server",
      native ? nativeStore?.plan_period_end ?? null : "server",
    ],
    enabled: !!storeId,
    refetchOnWindowFocus: !native,
    queryFn: async () => {
      if (!storeId) return null;

      // The Android register already receives a trusted, store-scoped plan
      // snapshot in the paired-device login bootstrap. Never import the
      // server-only Stripe billing module into the native WebView: that module
      // depends on Node/Stripe server APIs and can crash the lazy-loaded POS
      // route before checkout renders.
      if (native) return planStateFromStore(nativeStore);

      // Owner/dashboard web sessions reconcile billing on the server so stale
      // store entitlement fields cannot disagree with Stripe. Keep this import
      // dynamic so the server-only module is never evaluated by the APK.
      const { getCurrentStoreSubscriptionState } = await import(
        "@/lib/billing/checkout.functions"
      );
      const store = await getCurrentStoreSubscriptionState();
      return planStateFromStore(store as StorePlanSnapshot | null);
    },
  });
}

export function usePlanGate() {
  const query = useSubscription();
  const plan = query.data;
  const tier = plan?.tier ?? "expired";
  return {
    ...query,
    plan,
    tier,
    definition: planForTier(tier),
    isReadOnly: plan?.isReadOnly ?? false,
    can: (minTier: PlanTier) => tierMeetsMin(tier, minTier) && !plan?.isReadOnly,
    meets: (minTier: PlanTier) => tierMeetsMin(tier, minTier),
    canFeature: (feature: SezaFeatureKey) =>
      tierIncludesFeature(tier, feature) && !plan?.isReadOnly,
    includesFeature: (feature: SezaFeatureKey) => tierIncludesFeature(tier, feature),
    limit: (key: keyof SezaPlanLimits) => planLimit(tier, key),
  };
}
