const FINIX_VERSION = "2022-02-01";

type FinixEnvironment = "sandbox" | "live";

function credentials(env: FinixEnvironment) {
  const username = env === "live" ? process.env.FINIX_LIVE_USERNAME : process.env.FINIX_SANDBOX_USERNAME;
  const password = env === "live" ? process.env.FINIX_LIVE_PASSWORD : process.env.FINIX_SANDBOX_PASSWORD;
  if (!username || !password) {
    throw new Error(`Finix ${env} credentials are not configured on the SEZA server.`);
  }
  return { username, password };
}

function baseUrl(env: FinixEnvironment) {
  return env === "live"
    ? "https://finix.live-payments-api.com"
    : "https://finix.sandbox-payments-api.com";
}

export class FinixApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "FinixApiError";
    this.status = status;
    this.payload = payload;
  }
}

function errorMessage(payload: any, fallback: string) {
  if (typeof payload?.message === "string" && payload.message) return payload.message;
  const first = Array.isArray(payload?._embedded?.errors) ? payload._embedded.errors[0] : null;
  if (typeof first?.message === "string" && first.message) return first.message;
  return fallback;
}

export async function finixRequest<T>(
  env: FinixEnvironment,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { username, password } = credentials(env);
  const headers = new Headers(init.headers);
  headers.set("accept", "application/hal+json");
  headers.set("content-type", "application/json");
  headers.set("finix-version", FINIX_VERSION);
  headers.set("authorization", `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);

  const response = await fetch(`${baseUrl(env)}${path}`, { ...init, headers });
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new FinixApiError(
      response.status,
      errorMessage(payload, `Finix request failed (${response.status}).`),
      payload,
    );
  }
  return payload as T;
}

export type FinixTerminalConfig = {
  terminalId: string;
  deviceId: string;
  merchantId: string | null;
  environment: FinixEnvironment;
};

export async function resolveFinixTerminal(admin: any, storeId: string): Promise<FinixTerminalConfig> {
  const { data, error } = await admin
    .from("payment_terminals")
    .select("id, provider, status, config")
    .eq("store_id", storeId)
    .eq("provider", "finix")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No active Finix terminal is assigned to this store.");

  const config = (data.config ?? {}) as Record<string, unknown>;
  const deviceId = typeof config.finix_device_id === "string" ? config.finix_device_id.trim() : "";
  const merchantId = typeof config.finix_merchant_id === "string" ? config.finix_merchant_id.trim() : "";
  const environment: FinixEnvironment = config.finix_environment === "live" ? "live" : "sandbox";
  if (!deviceId) throw new Error("This terminal is missing its Finix Device ID.");
  return { terminalId: data.id, deviceId, merchantId: merchantId || null, environment };
}

export async function authenticatePosUser(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new FinixApiError(401, "Sign in to SEZA POS again.", null);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new FinixApiError(401, "Your SEZA session has expired.", null);

  const admin: any = supabaseAdmin;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, store_id, status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile || profile.status !== "active" || !profile.store_id) {
    throw new FinixApiError(403, "This employee is not active for a SEZA store.", null);
  }
  return { admin, userId: data.user.id, storeId: profile.store_id as string };
}

export function transferOutcome(transfer: any) {
  const state = String(transfer?.state ?? "").toUpperCase();
  if (state === "SUCCEEDED") return { status: "approved" as const, message: "Payment approved" };
  if (state === "FAILED") return { status: "declined" as const, message: transfer?.failure_message || "Card declined" };
  if (state === "CANCELED" || state === "CANCELLED") return { status: "cancelled" as const, message: "Payment cancelled" };
  return { status: "processing" as const, message: "Payment is processing" };
}
