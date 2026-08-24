import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sendViaProvider } from "@/lib/sms/providers.server";
import type { SmsProviderId } from "@/lib/sms/types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers ?? {}) },
  });
}

function optionsResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function redactPhone(p: string): string {
  if (!p) return "***";
  return p.length <= 4 ? "***" : `***${p.slice(-4)}`;
}

export const Route = createFileRoute("/api/sms/send")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.sms.send",
          limit: 30,
          windowSeconds: 60,
          blockSeconds: 300,
          maxBodyBytes: 32768,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
          return jsonResponse({ error: "Server configuration error" }, { status: 500 });
        }

        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return jsonResponse({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length).trim();
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: userRes, error: authErr } = await admin.auth.getUser(token);
        if (authErr || !userRes?.user) {
          return jsonResponse({ error: "Unauthorized" }, { status: 401 });
        }
        const user = userRes.user;
        const { consumeRateLimit } = await import("@/lib/security/rate-limit.server");
        const userLimit = await consumeRateLimit({
          scope: "api.sms.send.user",
          limit: 10,
          windowSeconds: 60,
          blockSeconds: 300,
          identifier: user.id,
          request,
        });
        if (!userLimit.allowed) {
          return jsonResponse(
            { error: "Too many SMS requests", retry_after_seconds: userLimit.retryAfterSeconds },
            { status: 429, headers: { "Retry-After": String(userLimit.retryAfterSeconds) } },
          );
        }

        type Body = {
          to?: string;
          body?: string;
          saleId?: string | null;
          idempotencyKey?: string;
          test?: boolean;
        };
        let payload: Body;
        try {
          payload = (await request.json()) as Body;
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
        }

        const to = (payload.to ?? "").trim();
        const body = (payload.body ?? "").trim();
        if (!/^\+[1-9]\d{6,14}$/.test(to)) {
          return jsonResponse(
            { error: "Recipient phone must be in E.164 format" },
            { status: 400 },
          );
        }
        if (body.length < 1 || body.length > 1600) {
          return jsonResponse({ error: "Message body must be 1–1600 characters" }, { status: 400 });
        }

        // Resolve caller's store
        const { data: profile, error: profErr } = await admin
          .from("profiles")
          .select("store_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profErr || !profile?.store_id) {
          return jsonResponse({ error: "No store linked to this account" }, { status: 400 });
        }
        const storeId = profile.store_id as string;

        // Idempotency short-circuit
        if (payload.idempotencyKey) {
          const { data: existing } = await admin
            .from("sms_send_log")
            .select("id,status,provider_message_id")
            .eq("store_id", storeId)
            .eq("idempotency_key", payload.idempotencyKey)
            .maybeSingle();
          if (existing && existing.status === "sent") {
            return jsonResponse({
              success: true,
              alreadySent: true,
              providerMessageId: existing.provider_message_id,
            });
          }
        }

        // Load SMS settings
        const { data: settings } = await admin
          .from("sms_settings")
          .select("provider, credentials, sender_id, enabled")
          .eq("store_id", storeId)
          .maybeSingle();

        if (!settings) {
          return jsonResponse(
            { error: "SMS is not configured. Open Settings → SMS Setup." },
            { status: 400 },
          );
        }
        if (!settings.enabled && !payload.test) {
          return jsonResponse(
            { error: "SMS delivery is disabled. Enable it in Settings → SMS Setup." },
            { status: 400 },
          );
        }

        const provider = settings.provider as SmsProviderId;
        const result = await sendViaProvider(provider, {
          to,
          body,
          credentials: (settings.credentials ?? {}) as any,
          senderId: settings.sender_id,
        });

        await admin.from("sms_send_log").insert({
          store_id: storeId,
          sale_id: payload.saleId ?? null,
          sent_by: user.id,
          provider,
          recipient_phone: to,
          status: result.ok ? "sent" : "failed",
          provider_message_id: result.ok ? (result.providerMessageId ?? null) : null,
          provider_response: (result as any).raw ?? null,
          error_message: result.ok ? null : result.error,
          message_body: body,
          idempotency_key: payload.idempotencyKey ?? null,
        });

        if (payload.test) {
          await admin
            .from("sms_settings")
            .update({
              last_status: result.ok ? "connected" : "failed",
              last_checked_at: new Date().toISOString(),
            })
            .eq("store_id", storeId);
        }

        if (!result.ok) {
          console.warn("SMS send failed", {
            provider,
            to: redactPhone(to),
            error: result.error,
          });
          return jsonResponse({ error: result.error }, { status: 502 });
        }

        return jsonResponse({
          success: true,
          providerMessageId: result.providerMessageId,
        });
      },
    },
  },
});
