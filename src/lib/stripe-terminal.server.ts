import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, getStripeMode, type StripeEnv } from "@/lib/stripe.server";
import { verifyDeviceSecret } from "@/lib/pos/device.server";

export type NativeTerminalAuth = {
  store_id?: unknown;
  device_id?: unknown;
  device_secret?: unknown;
  caller_id?: unknown;
};

export type StripeTerminalCaller = {
  userId: string;
  storeId: string;
  deviceId: string | null;
};

export type StripeTerminalMerchantContext = StripeTerminalCaller & {
  stripeAccountId: string;
  terminalLocationId: string;
  terminalId: string | null;
  environment: StripeEnv;
  testMode: boolean;
};

function value(input: unknown) {
  return typeof input === "string" ? input.trim() : "";
}

export function createTerminalStripeClient(environment: StripeEnv) {
  return createStripeClient(environment);
}

export async function resolveStripeTerminalCaller(input: {
  bearerToken?: string;
  nativeAuth?: NativeTerminalAuth | null;
}): Promise<StripeTerminalCaller> {
  const bearerToken = value(input.bearerToken);
  const admin: any = supabaseAdmin;

  if (bearerToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearerToken);
    if (error || !data.user) throw new Error("Unauthorized");
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,store_id,status")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.store_id || profile.status !== "active") throw new Error("Unauthorized");
    return { userId: data.user.id, storeId: profile.store_id, deviceId: null };
  }

  const nativeAuth = input.nativeAuth ?? {};
  const storeId = value(nativeAuth.store_id);
  const deviceId = value(nativeAuth.device_id);
  const deviceSecret = value(nativeAuth.device_secret);
  const callerId = value(nativeAuth.caller_id);
  if (!storeId || !deviceId || !deviceSecret || !callerId) throw new Error("Unauthorized");

  const [{ data: device }, { data: profile }] = await Promise.all([
    admin
      .from("device_registrations")
      .select("id,store_id,status,secret_hash")
      .eq("id", deviceId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id,store_id,status")
      .eq("id", callerId)
      .maybeSingle(),
  ]);

  if (
    !device ||
    device.status !== "active" ||
    device.store_id !== storeId ||
    !verifyDeviceSecret(deviceSecret, device.secret_hash) ||
    !profile ||
    profile.status !== "active" ||
    profile.store_id !== storeId
  ) {
    throw new Error("Unauthorized");
  }

  return { userId: callerId, storeId, deviceId };
}

export async function requireStripeTerminalManager(caller: StripeTerminalCaller) {
  const admin: any = supabaseAdmin;
  const { data: roles, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.userId)
    .eq("store_id", caller.storeId);
  if (error) throw error;
  const roleNames = (roles ?? []).map((row: { role: string }) => row.role);
  if (roleNames.includes("owner") || roleNames.includes("manager")) return;

  if (roleNames.length) {
    const { data: permissions } = await admin
      .from("role_permissions")
      .select("permission")
      .eq("store_id", caller.storeId)
      .eq("permission", "hardware.configure")
      .in("role", roleNames);
    if ((permissions ?? []).length) return;
  }
  throw new Error("Manager access is required to configure a payment reader.");
}

export async function loadStripeTerminalStore(caller: StripeTerminalCaller) {
  const admin: any = supabaseAdmin;
  const { data: store, error } = await admin
    .from("stores")
    .select(
      "id,name,stripe_connected_account_id,stripe_connect_status,stripe_card_payments_status,stripe_terminal_location_id,address,city,state,zip,country",
    )
    .eq("id", caller.storeId)
    .maybeSingle();
  if (error) throw error;
  if (!store) throw new Error("Store not found");

  const accountId = value(store.stripe_connected_account_id);
  const locationId = value(store.stripe_terminal_location_id);
  const cardStatus = value(store.stripe_card_payments_status).toLowerCase();
  const ready =
    /^acct_[A-Za-z0-9]+$/.test(accountId) &&
    Boolean(locationId) &&
    (cardStatus === "active" || cardStatus === "enabled");

  return {
    store,
    accountId,
    locationId,
    cardStatus,
    ready,
    environment: getStripeMode(),
  };
}

export async function listStripeTerminals(storeId: string) {
  const admin: any = supabaseAdmin;
  const { data, error } = await admin
    .from("payment_terminals")
    .select(
      "id,store_id,label,provider,serial,location,status,last_seen_at,config,stripe_reader_id,stripe_connected_account_id,stripe_terminal_location_id",
    )
    .eq("store_id", storeId)
    .eq("provider", "stripe")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function resolveStripeTerminalMerchant(input: {
  bearerToken?: string;
  nativeAuth?: NativeTerminalAuth | null;
  requireActiveTerminal?: boolean;
}): Promise<StripeTerminalMerchantContext> {
  const caller = await resolveStripeTerminalCaller(input);
  const state = await loadStripeTerminalStore(caller);
  if (!state.ready) {
    throw new Error("Stripe setup is not complete for this store. Finish merchant verification and payout setup first.");
  }

  let terminalId: string | null = null;
  if (input.requireActiveTerminal) {
    const terminals = await listStripeTerminals(caller.storeId);
    const active = terminals.find((terminal: any) =>
      terminal.status === "active" &&
      (!caller.deviceId || String(terminal.config?.device_id || "") === caller.deviceId),
    ) ?? terminals.find((terminal: any) => terminal.status === "active" && !terminal.config?.device_id);
    if (!active) throw new Error("No Stripe reader is active on this register.");
    terminalId = active.id;
  }

  return {
    ...caller,
    stripeAccountId: state.accountId,
    terminalLocationId: state.locationId,
    terminalId,
    environment: state.environment,
    testMode: state.environment === "sandbox",
  };
}
