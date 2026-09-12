import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authenticatedWriteRateLimit } from "@/lib/security/rate-limit";
import Stripe from "stripe";
import { getStripeSecretKey, getStripeErrorMessage, getStripeMode, type StripeEnv } from "@/lib/stripe.server";

const DASHBOARD_URL = (process.env.SEZA_DASHBOARD_URL || "https://dashboard.sezapos.com").replace(/\/$/, "");

function connectStripeClient(env: StripeEnv): any {
  return new Stripe(getStripeSecretKey(env), { apiVersion: "2026-08-26.preview" as any }) as any;
}

async function assertOwner(context: any) {
  const { data, error } = await context.supabase.rpc("has_any_role", {
    _user_id: context.userId,
    _roles: ["owner"],
  });
  if (error || !data) throw new Error("Only the store owner can configure payment processing.");
}

async function loadStore(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin: any = supabaseAdmin;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,store_id,email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.store_id) throw new Error("Your store could not be found.");

  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("*")
    .eq("id", profile.store_id)
    .maybeSingle();
  if (storeError) throw storeError;
  if (!store) throw new Error("Your store could not be found.");
  return { admin, profile, store };
}

function cardStatus(account: any): string | null {
  return (
    account?.configuration?.merchant?.capabilities?.card_payments?.status ||
    account?.configuration?.merchant?.capabilities?.card_payments ||
    null
  );
}

async function retrieveConnectedAccount(stripe: any, accountId: string) {
  return stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant", "identity", "requirements", "defaults"],
  });
}

function isPlatformManaged(account: any) {
  return String(account?.dashboard || "").toLowerCase() === "none";
}

async function createPlatformManagedAccount(stripe: any, store: any, profile: any, migratedFrom?: string) {
  return stripe.v2.core.accounts.create({
    contact_email: store.email || profile.email || undefined,
    display_name: String(store.name || "SEZA POS Store").slice(0, 100),
    dashboard: "none",
    identity: {
      country: String(store.country || "US").toLowerCase(),
      ...(store.name
        ? { business_details: { registered_name: String(store.name).slice(0, 200) } }
        : {}),
    },
    configuration: {
      merchant: {
        capabilities: { card_payments: { requested: true } },
      },
    },
    defaults: {
      currency: String(store.currency || "USD").toLowerCase(),
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
      locales: ["en-US"],
    },
    metadata: {
      seza_store_id: String(store.id),
      ...(migratedFrom ? { migrated_from_account_id: migratedFrom } : {}),
    },
    include: ["configuration.merchant", "identity", "requirements"],
  });
}

function hasTerminalAddress(store: any) {
  return Boolean(store.address && store.city && store.state && store.zip && store.country);
}

async function ensureTerminalLocation(stripe: any, accountId: string, store: any) {
  const existingLocationId = String(store.stripe_terminal_location_id || "").trim();
  if (existingLocationId) {
    try {
      const existing = await stripe.terminal.locations.retrieve(existingLocationId, {
        stripeAccount: accountId,
      });
      if (existing?.id) return existing.id as string;
    } catch (error: any) {
      const status = Number(error?.statusCode || error?.status || 0);
      const code = String(error?.code || error?.raw?.code || "");
      if (status !== 404 && code !== "resource_missing") throw error;
    }
  }

  if (!hasTerminalAddress(store)) return null;

  const location = await stripe.terminal.locations.create(
    {
      display_name: String(store.name || "SEZA POS Store").slice(0, 100),
      address: {
        line1: String(store.address),
        city: String(store.city),
        state: String(store.state),
        postal_code: String(store.zip),
        country: String(store.country || "US").toUpperCase(),
      },
      metadata: { seza_store_id: String(store.id) },
    },
    { stripeAccount: accountId },
  );
  return location.id as string;
}

async function refreshConnectedAccount(userId: string) {
  const { admin, store } = await loadStore(userId);
  const accountId = String(store.stripe_connected_account_id || "").trim();
  const env = getStripeMode();
  if (!accountId) {
    return {
      environment: env,
      status: "not_started",
      cardPaymentsStatus: null,
      terminalLocationReady: false,
      needsStoreAddress: !hasTerminalAddress(store),
      accountConnected: false,
      migrationRequired: false,
    };
  }

  const stripe: any = connectStripeClient(env);
  const account = await retrieveConnectedAccount(stripe, accountId);

  if (!isPlatformManaged(account)) {
    const migrationRequired = true;
    const connectStatus = env === "sandbox" ? "migration_required" : "support_required";
    const { error: updateError } = await admin
      .from("stores")
      .update({ stripe_connect_status: connectStatus })
      .eq("id", store.id);
    if (updateError) throw updateError;

    return {
      environment: env,
      status: connectStatus,
      cardPaymentsStatus: cardStatus(account),
      terminalLocationReady: false,
      needsStoreAddress: !hasTerminalAddress(store),
      accountConnected: true,
      migrationRequired,
    };
  }

  const status = cardStatus(account);
  const cardReady = ["active", "enabled"].includes(String(status).toLowerCase());
  let locationId: string | null = null;
  if (cardReady) {
    locationId = await ensureTerminalLocation(stripe, accountId, store);
  }

  const connectStatus = cardReady ? (locationId ? "ready" : "payments_ready") : "onboarding";
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("stores")
    .update({
      stripe_connect_status: connectStatus,
      stripe_card_payments_status: status ? String(status) : null,
      stripe_terminal_location_id: locationId,
      stripe_onboarding_completed_at: cardReady ? store.stripe_onboarding_completed_at || now : null,
    })
    .eq("id", store.id);
  if (updateError) throw updateError;

  if (cardReady && locationId) {
    const { error: terminalSyncError } = await admin
      .from("payment_terminals")
      .update({
        stripe_connected_account_id: accountId,
        stripe_terminal_location_id: locationId,
      })
      .eq("store_id", store.id)
      .eq("provider", "stripe");
    if (terminalSyncError) throw terminalSyncError;
  }

  return {
    environment: env,
    status: connectStatus,
    cardPaymentsStatus: status ? String(status) : null,
    terminalLocationReady: Boolean(locationId),
    needsStoreAddress: cardReady && !locationId && !hasTerminalAddress(store),
    accountConnected: true,
    migrationRequired: false,
  };
}

export const getStripeConnectStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    try {
      return await refreshConnectedAccount(context.userId);
    } catch (error) {
      throw new Error(getStripeErrorMessage(error));
    }
  });

export const startStripeConnectOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, authenticatedWriteRateLimit])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { admin, profile, store } = await loadStore(context.userId);
    const env = getStripeMode();
    const stripe: any = connectStripeClient(env);
    let accountId = String(store.stripe_connected_account_id || "").trim();

    try {
      if (accountId) {
        const existing = await retrieveConnectedAccount(stripe, accountId);
        if (!isPlatformManaged(existing)) {
          if (env !== "sandbox") {
            throw new Error("This payment account needs a SEZA Support migration before setup can continue.");
          }

          const previousAccountId = accountId;
          const replacement = await createPlatformManagedAccount(stripe, store, profile, previousAccountId);
          accountId = replacement.id;
          const { error: replaceError } = await admin
            .from("stores")
            .update({
              stripe_connected_account_id: accountId,
              stripe_connect_status: "onboarding",
              stripe_card_payments_status: cardStatus(replacement),
              stripe_terminal_location_id: null,
              stripe_onboarding_completed_at: null,
            })
            .eq("id", store.id);
          if (replaceError) throw replaceError;
        }
      }

      if (!accountId) {
        const account = await createPlatformManagedAccount(stripe, store, profile);
        accountId = account.id;
        const { error: saveError } = await admin
          .from("stores")
          .update({
            stripe_connected_account_id: accountId,
            stripe_connect_status: "onboarding",
            stripe_card_payments_status: cardStatus(account),
            stripe_terminal_location_id: null,
            stripe_onboarding_completed_at: null,
          })
          .eq("id", store.id);
        if (saveError) throw saveError;
      }

      const accountLink = await stripe.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant"],
            return_url: `${DASHBOARD_URL}/settings?section=terminal&stripe=return`,
            refresh_url: `${DASHBOARD_URL}/settings?section=terminal&stripe=refresh`,
          },
        },
      });
      return { url: accountLink.url as string };
    } catch (error) {
      throw new Error(getStripeErrorMessage(error));
    }
  });
