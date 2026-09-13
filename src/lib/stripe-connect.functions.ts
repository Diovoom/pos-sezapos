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

function isStripeResourceMissing(error: any) {
  const status = Number(error?.statusCode || error?.status || error?.raw?.statusCode || 0);
  const code = String(error?.code || error?.raw?.code || "").toLowerCase();
  return status === 404 || code === "resource_missing";
}

function accountMatchesEnvironment(account: any, env: StripeEnv) {
  if (typeof account?.livemode !== "boolean") return true;
  return env === "live" ? account.livemode === true : account.livemode === false;
}

async function markLiveSetupRequired(admin: any, store: any) {
  const { error: storeError } = await admin
    .from("stores")
    .update({
      stripe_connect_status: "live_setup_required",
      stripe_card_payments_status: null,
      stripe_terminal_location_id: null,
      stripe_onboarding_completed_at: null,
    })
    .eq("id", store.id);
  if (storeError) throw storeError;

  const { error: terminalError } = await admin
    .from("payment_terminals")
    .update({ stripe_terminal_location_id: null })
    .eq("store_id", store.id)
    .eq("provider", "stripe");
  if (terminalError) throw terminalError;
}

async function saveReplacementAccount(admin: any, store: any, account: any) {
  const accountId = String(account.id || "").trim();
  if (!accountId) throw new Error("Stripe did not return a connected account ID.");

  const { error: storeError } = await admin
    .from("stores")
    .update({
      stripe_connected_account_id: accountId,
      stripe_connect_status: "onboarding",
      stripe_card_payments_status: cardStatus(account),
      stripe_terminal_location_id: null,
      stripe_onboarding_completed_at: null,
    })
    .eq("id", store.id);
  if (storeError) throw storeError;

  const { error: terminalError } = await admin
    .from("payment_terminals")
    .update({
      stripe_connected_account_id: accountId,
      stripe_terminal_location_id: null,
    })
    .eq("store_id", store.id)
    .eq("provider", "stripe");
  if (terminalError) throw terminalError;

  return accountId;
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
  let account: any;
  try {
    account = await retrieveConnectedAccount(stripe, accountId);
  } catch (error) {
    if (env === "live" && isStripeResourceMissing(error)) {
      await markLiveSetupRequired(admin, store);
      return {
        environment: env,
        status: "live_setup_required",
        cardPaymentsStatus: null,
        terminalLocationReady: false,
        needsStoreAddress: !hasTerminalAddress(store),
        accountConnected: false,
        migrationRequired: true,
      };
    }
    throw error;
  }

  if (!accountMatchesEnvironment(account, env)) {
    if (env === "live") {
      await markLiveSetupRequired(admin, store);
      return {
        environment: env,
        status: "live_setup_required",
        cardPaymentsStatus: null,
        terminalLocationReady: false,
        needsStoreAddress: !hasTerminalAddress(store),
        accountConnected: false,
        migrationRequired: true,
      };
    }
    throw new Error("Stripe connected account environment does not match SEZA payment mode.");
  }

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
      // If live onboarding already completed and SEZA has a synced Terminal
      // Location, a transient Stripe read failure should not replace a valid
      // ready state with a scary generic error. Keep the last verified state
      // visible and let a later refresh revalidate it against Stripe.
      try {
        const { store } = await loadStore(context.userId);
        if (
          store.stripe_connect_status === "ready" &&
          store.stripe_connected_account_id &&
          store.stripe_terminal_location_id
        ) {
          return {
            environment: getStripeMode(),
            status: "ready",
            cardPaymentsStatus: store.stripe_card_payments_status || "active",
            terminalLocationReady: true,
            needsStoreAddress: false,
            accountConnected: true,
            migrationRequired: false,
            cached: true,
          };
        }
      } catch {
        // Fall through to the real payment-service error below.
      }
      throw new Error(getStripeErrorMessage(error));
    }
  });

export const createStripePayoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, authenticatedWriteRateLimit])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { store } = await loadStore(context.userId);
    const accountId = String(store.stripe_connected_account_id || "").trim();
    if (!accountId) throw new Error("Connect Stripe before managing payouts.");

    const env = getStripeMode();
    const publishableKey = String(
      (env === "live"
        ? process.env.STRIPE_LIVE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_LIVE_PUBLISHABLE_KEY
        : process.env.STRIPE_SANDBOX_PUBLISHABLE_KEY || process.env.VITE_STRIPE_SANDBOX_PUBLISHABLE_KEY) ||
        process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
        "",
    ).trim();

    if (!publishableKey) {
      throw new Error(
        env === "live"
          ? "STRIPE_LIVE_PUBLISHABLE_KEY is not configured."
          : "STRIPE_SANDBOX_PUBLISHABLE_KEY is not configured.",
      );
    }

    try {
      // Accounts created with Accounts v2 can be used by v1 Account Sessions.
      // The embedded Payouts component is the supported way for a connected
      // account with no Stripe Dashboard access and Stripe-owned loss liability
      // to view payouts and securely manage its payout bank account.
      const stripe = new Stripe(getStripeSecretKey(env), {
        apiVersion: "2026-03-25.dahlia" as any,
      });

      const account: any = await stripe.accounts.retrieve(accountId);
      if (typeof account?.charges_enabled === "boolean" && !account.charges_enabled) {
        throw new Error("Finish Stripe verification before managing payouts.");
      }

      const session: any = await stripe.accountSessions.create({
        account: accountId,
        components: {
          payouts: {
            enabled: true,
            features: {
              external_account_collection: true,
            },
          },
        },
      } as any);

      if (!session?.client_secret) throw new Error("Stripe did not return a payout session.");
      return {
        clientSecret: String(session.client_secret),
        publishableKey,
        environment: env,
      };
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
        let existing: any = null;
        try {
          existing = await retrieveConnectedAccount(stripe, accountId);
        } catch (error) {
          if (!(env === "live" && isStripeResourceMissing(error))) throw error;
        }

        const needsEnvironmentReplacement = !existing || !accountMatchesEnvironment(existing, env);
        if (needsEnvironmentReplacement) {
          const previousAccountId = accountId;
          const replacement = await createPlatformManagedAccount(stripe, store, profile, previousAccountId);
          accountId = await saveReplacementAccount(admin, store, replacement);
        } else if (!isPlatformManaged(existing)) {
          if (env !== "sandbox") {
            throw new Error("This payment account needs a SEZA Support migration before setup can continue.");
          }

          const previousAccountId = accountId;
          const replacement = await createPlatformManagedAccount(stripe, store, profile, previousAccountId);
          accountId = await saveReplacementAccount(admin, store, replacement);
        }
      }

      if (!accountId) {
        const account = await createPlatformManagedAccount(stripe, store, profile);
        accountId = await saveReplacementAccount(admin, store, account);
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
