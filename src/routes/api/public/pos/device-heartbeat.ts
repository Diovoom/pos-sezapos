import { createFileRoute } from "@tanstack/react-router";
import { sanitizeStripeTerminalDiagnostic } from "@/lib/hardware/terminal-diagnostics";

type Body = {
  store_id?: unknown;
  device_id?: unknown;
  device_secret?: unknown;
  app_version?: unknown;
  status_snapshot?: unknown;
  device_diagnostic?: unknown;
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

function sanitizeMerchantStatusSnapshot(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const snapshot = { ...(value as Record<string, unknown>) };
  if (snapshot.terminal && typeof snapshot.terminal === "object" && !Array.isArray(snapshot.terminal)) {
    const terminal = { ...(snapshot.terminal as Record<string, unknown>) };
    // Merchant managers can read status_snapshot. Keep it operational only;
    // native/Stripe internals belong exclusively in admin_device_diagnostics.
    delete terminal.last_error;
    delete terminal.raw_error;
    delete terminal.native_error;
    delete terminal.native_error_code;
    delete terminal.connection_token;
    delete terminal.connection_token_requested;
    delete terminal.connection_token_delivered;
    delete terminal.actor_token;
    delete terminal.device_secret;
    delete terminal.client_secret;
    delete terminal.authorization;
    delete terminal.account_id;
    delete terminal.stripe_account_id;
    delete terminal.stripe_connected_account_id;
    snapshot.terminal = terminal;
  }
  return snapshot;
}

export const Route = createFileRoute("/api/public/pos/device-heartbeat")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.device_heartbeat",
          limit: 180,
          windowSeconds: 60,
          blockSeconds: 60,
          maxBodyBytes: 8192,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const storeId = typeof body.store_id === "string" ? body.store_id : "";
        const deviceId = typeof body.device_id === "string" ? body.device_id : "";
        const deviceSecret = typeof body.device_secret === "string" ? body.device_secret : "";
        const appVersion =
          typeof body.app_version === "string" ? body.app_version.slice(0, 80) : null;
        const snapshot = sanitizeMerchantStatusSnapshot(body.status_snapshot);
        const diagnostic = sanitizeStripeTerminalDiagnostic(body.device_diagnostic);

        if (!storeId || !deviceId || !deviceSecret) {
          return json({ error: "Device not paired" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { verifyDeviceSecret } = await import("@/lib/pos/device.server");

        const admin: any = supabaseAdmin;

        const { data: device } = await admin
          .from("device_registrations")
          .select("id, store_id, status, secret_hash")
          .eq("id", deviceId)
          .maybeSingle();

        if (!device || device.status !== "active" || device.store_id !== storeId) {
          return json({ error: "Device is not active for this store" }, 401);
        }
        if (!verifyDeviceSecret(deviceSecret, device.secret_hash)) {
          return json({ error: "Invalid device credentials" }, 401);
        }

        const now = new Date().toISOString();
        const { error } = await admin
          .from("device_registrations")
          .update({
            last_seen_at: now,
            last_sync_at: now,
            app_version: appVersion,
            status_snapshot: snapshot,
          })
          .eq("id", deviceId);
        if (error) return json({ error: "SEZA could not complete this request. Please try again." }, 500);

        if (diagnostic) {
          const diagnosticRow = {
            device_id: deviceId,
            store_id: storeId,
            subsystem: diagnostic.subsystem,
            stage: diagnostic.stage,
            status: diagnostic.status,
            transport: diagnostic.transport,
            reader_discovered: diagnostic.reader_discovered,
            reader_serial: diagnostic.reader_serial,
            stripe_plugin_linked: diagnostic.stripe_plugin_linked,
            merchant_ready: diagnostic.merchant_ready,
            terminal_location_ready: diagnostic.terminal_location_ready,
            connection_token_requested: diagnostic.connection_token_requested,
            connection_token_delivered: diagnostic.connection_token_delivered,
            // CONNECTED/ok always writes null here, clearing a prior failure.
            native_error_code: diagnostic.status === "ok" ? null : diagnostic.native_error_code,
            native_error: diagnostic.status === "ok" ? null : diagnostic.native_error,
            app_version: appVersion,
            occurred_at: diagnostic.occurred_at,
            updated_at: now,
          };
          const { error: diagnosticError } = await admin
            .from("admin_device_diagnostics")
            .upsert(diagnosticRow, { onConflict: "device_id" });
          // Diagnostics are support telemetry and must never take the POS
          // heartbeat/store-config channel down if their storage is unavailable.
          if (diagnosticError && typeof console !== "undefined") {
            console.error("[SEZA device diagnostics] persistence failed", diagnosticError.code ?? "unknown");
          }
        }

        // Return the small operating configuration on every acknowledged
        // heartbeat. This keeps an already-open Android register aligned with
        // Owner Dashboard changes (store name, tax, plan, receipt/display
        // settings) without forcing the cashier to close/reopen the APK.
        const { data: storeConfig } = await admin
          .from("stores")
          .select(
            "id,name,tax_rate,currency,recover_card_processing_costs,card_processing_percent,card_processing_fixed_fee,plan_tier,plan_status,plan_period_end,plan_cancel_at_period_end,logo_url,receipt_logo_url,receipt_header,receipt_footer,return_policy,thank_you_message,customer_display_settings,language,time_zone,date_format,updated_at",
          )
          .eq("id", storeId)
          .maybeSingle();

        return json({ ok: true, server_time: now, store_config: storeConfig ?? null });
      },
    },
  },
});
