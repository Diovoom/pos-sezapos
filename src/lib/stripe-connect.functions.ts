import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authenticatedWriteRateLimit } from "@/lib/security/rate-limit";
import Stripe from "stripe";
import { getStripeSecretKey, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";

const DASHBOARD_URL = (process.env.SEZA_DASHBOARD_URL || "https://dashboard.sezapos.com").replace(/\/$/, "");

function connectEnv(): StripeEnv {
  return process.env.STRIPE_CONNECT_MODE === "live" ? "live" : "sandbox";
}

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

function hasTerminalAddress(store: any) {
  return Boolean(store.address && store.city && store.state && store.zip && store.country);
}

async function ensureTerminalLocation(stripe: any, accountId: string, store: any) {
  if (store.stripe_terminal_location_id) return store.stripe_terminal_location_id as string;
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
  if (!accountId) {
    return {
      status: "not_started",
      cardPaymentsStatus: null,
      terminalLocationReady: false,
      needsStoreAddress: !hasTerminalAddress(store),
      accountConnected: false,
    };
  }

  const env = connectEnv();
  const stripe: any = connectStripeClient(env);
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant", "identity", "requirements"],
  });
  const status = cardStatus(account);
  const cardReady = ["active", "enabled"].includes(String(status).toLowerCase());
  let locationId = store.stripe_terminal_location_id || null;
  if (cardReady && !locationId) {
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

  return {
    status: connectStatus,
    cardPaymentsStatus: status ? String(status) : null,
    terminalLocationReady: Boolean(locationId),
    needsStoreAddress: cardReady && !locationId && !hasTerminalAddress(store),
    accountConnected: true,
  };
}

export const getStripeConnectStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    try {
      return await refreshConnectedAccount(context.userId);
    } catch (error) {
      const message = getStripeErrorMessage(error);
      if (message !== "Stripe request failed") throw new Error(message);
      throw error;
    }
  });

export const startStripeConnectOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, authenticatedWriteRateLimit])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { admin, profile, store } = await loadStore(context.userId);
    const env = connectEnv();
    const stripe: any = connectStripeClient(env);
    let accountId = String(store.stripe_connected_account_id || "").trim();

    try {
      if (!accountId) {
        const account = await stripe.v2.core.accounts.create({
          contact_email: store.email || profile.email || undefined,
          display_name: String(store.name || "SEZA POS Store").slice(0, 100),
          dashboard: "full",
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
          include: ["configuration.merchant", "identity", "requirements"],
        });
        accountId = account.id;
        const { error: saveError } = await admin
          .from("stores")
          .update({
            stripe_connected_account_id: accountId,
            stripe_connect_status: "onboarding",
            stripe_card_payments_status: cardStatus(account),
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
