import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sendViaProvider } from "@/lib/sms/providers.server";
import type { SmsProviderId } from "@/lib/sms/types";

function redactPhone(p: string): string {
  if (!p) return "***";
  return p.length <= 4 ? "***" : `***${p.slice(-4)}`;
}

export const Route = createFileRoute("/lovable/sms/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length).trim();
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: userRes, error: authErr } = await admin.auth.getUser(token);
        if (authErr || !userRes?.user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const user = userRes.user;

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
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const to = (payload.to ?? "").trim();
        const body = (payload.body ?? "").trim();
        if (!/^\+[1-9]\d{6,14}$/.test(to)) {
          return Response.json({ error: "Recipient phone must be in E.164 format" }, { status: 400 });
        }
        if (body.length < 1 || body.length > 1600) {
          return Response.json({ error: "Message body must be 1–1600 characters" }, { status: 400 });
        }

        // Resolve caller's store
        const { data: profile, error: profErr } = await admin
          .from("profiles")
          .select("store_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profErr || !profile?.store_id) {
          return Response.json({ error: "No store linked to this account" }, { status: 400 });
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
            return Response.json({
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
          return Response.json(
            { error: "SMS is not configured. Open Settings → SMS Setup." },
            { status: 400 },
          );
        }
        if (!settings.enabled && !payload.test) {
          return Response.json(
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
          provider_message_id: result.ok ? result.providerMessageId ?? null : null,
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
          return Response.json({ error: result.error }, { status: 502 });
        }

        return Response.json({
          success: true,
          providerMessageId: result.providerMessageId,
        });
      },
    },
  },
});
