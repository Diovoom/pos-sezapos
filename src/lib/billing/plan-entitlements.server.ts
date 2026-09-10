import {
  planLimit,
  SEZA_FEATURE_MIN_TIER,
  SEZA_PLAN_BY_ID,
  tierIncludesFeature,
  type SezaEffectiveTier,
  type SezaFeatureKey,
  type SezaPlanLimits,
} from "@/lib/plans";

type SupabaseLike = {
  from: (table: string) => any;
};

type StorePlanRow = {
  plan_tier?: string | null;
  plan_status?: string | null;
  plan_period_end?: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function effectiveTier(row: StorePlanRow | null): SezaEffectiveTier {
  if (!row) return "expired";
  const status = String(row.plan_status ?? "expired");
  const periodEnd = row.plan_period_end ? new Date(row.plan_period_end).getTime() : null;
  const withinPeriod = periodEnd == null || periodEnd > Date.now();
  if (!ACTIVE_STATUSES.has(status) || !withinPeriod) return "expired";
  const tier = String(row.plan_tier ?? "expired");
  if (tier === "starter" || tier === "pro" || tier === "business" || tier === "trial_pro") {
    return tier;
  }
  return "expired";
}

export async function getStoreEffectiveTier(
  supabase: SupabaseLike,
  storeId: string,
): Promise<SezaEffectiveTier> {
  const { data, error } = await supabase
    .from("stores")
    .select("plan_tier,plan_status,plan_period_end")
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return effectiveTier(data as StorePlanRow | null);
}


export async function getStorePlanUsage(supabase: SupabaseLike, storeId: string) {
  const [profilesResult, ownersResult, registersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id")
      .eq("store_id", storeId)
      .eq("status", "active"),
    supabase
      .from("user_roles")
      .select("user_id")
      .eq("store_id", storeId)
      .eq("role", "owner"),
    supabase
      .from("device_registrations")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "active"),
  ]);
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (ownersResult.error) throw new Error(ownersResult.error.message);
  if (registersResult.error) throw new Error(registersResult.error.message);

  const ownerIds = new Set(
    (ownersResult.data ?? []).map((row: { user_id: string }) => row.user_id).filter(Boolean),
  );
  const employees = (profilesResult.data ?? []).filter(
    (row: { id: string }) => !ownerIds.has(row.id),
  ).length;

  return { employees, registers: registersResult.count ?? 0 };
}

export async function assertStoreResourceLimit(options: {
  supabase: SupabaseLike;
  storeId: string;
  resource: keyof SezaPlanLimits;
  currentCount: number;
}) {
  const tier = await getStoreEffectiveTier(options.supabase, options.storeId);
  if (tier === "expired") {
    throw new Error("Your SEZA subscription is not active. Choose a plan to continue.");
  }
  const limit = planLimit(tier, options.resource);
  if (limit != null && options.currentCount >= limit) {
    const normalized = tier === "trial_pro" ? "pro" : tier;
    const planName = normalized in SEZA_PLAN_BY_ID ? SEZA_PLAN_BY_ID[normalized as keyof typeof SEZA_PLAN_BY_ID].name : "current";
    const resourceLabel = options.resource === "employees" ? "employees" : "POS registers";
    throw new Error(
      `${planName} includes up to ${limit} ${resourceLabel}. Upgrade your plan to add another.`,
    );
  }
  return { tier, limit };
}

export async function assertStoreFeature(options: {
  supabase: SupabaseLike;
  storeId: string;
  feature: SezaFeatureKey;
}) {
  const tier = await getStoreEffectiveTier(options.supabase, options.storeId);
  if (tier === "expired") {
    throw new Error("Your SEZA subscription is not active. Choose a plan to continue.");
  }
  if (!tierIncludesFeature(tier, options.feature)) {
    const required = SEZA_PLAN_BY_ID[SEZA_FEATURE_MIN_TIER[options.feature]];
    throw new Error(`${required.name} or higher is required for this feature.`);
  }
  return { tier };
}
