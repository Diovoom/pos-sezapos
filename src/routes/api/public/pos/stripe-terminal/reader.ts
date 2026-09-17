import { createFileRoute } from "@tanstack/react-router";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

function clean(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export const Route = createFileRoute("/api/public/pos/stripe-terminal/reader")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.stripe_reader",
          limit: 40,
          windowSeconds: 60,
          blockSeconds: 300,
          maxBodyBytes: 32768,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;

        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const auth = request.headers.get("authorization") ?? "";
        const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";

        try {
          const {
            resolveStripeTerminalCaller,
            requireStripeTerminalManager,
            loadStripeTerminalStore,
            listStripeTerminals,
          } = await import("@/lib/stripe-terminal.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin: any = supabaseAdmin;
          const caller = await resolveStripeTerminalCaller({ bearerToken, nativeAuth: body.nativeAuth });
          const state = await loadStripeTerminalStore(caller);
          const action = clean(body.action, 40);
          const terminalId = clean(body.terminalId, 80);

          if (["save", "activate", "remove"].includes(action)) {
            await requireStripeTerminalManager(caller);
          }

          if (action === "save") {
            if (!state.ready) throw new Error("Finish Stripe merchant setup before adding a reader.");
            const label = clean(body.label, 100);
            const model = clean(body.model, 80);
            const serial = clean(body.serial, 100);
            const location = clean(body.location, 100) || "Front counter";
            const readerType = clean(body.readerType, 40);
            const connectionMethod = body.connectionMethod === "bluetooth" ? "bluetooth" : "usb";
            if (!label || !model || !readerType.startsWith("stripe-")) {
              throw new Error("Reader name and model are required.");
            }
            const { error } = await admin.from("payment_terminals").insert({
              store_id: caller.storeId,
              label,
              provider: "stripe",
              serial: serial || null,
              location,
              status: "configured",
              stripe_connected_account_id: state.accountId,
              stripe_terminal_location_id: state.locationId,
              config: {
                model,
                mode: "integrated",
                setup_source: "android_pos",
                device_id: caller.deviceId || undefined,
                reader_type: readerType,
                connection_method: readerType === "stripe-m2" ? connectionMethod : undefined,
              },
            });
            if (error) throw error;
          } else if (action === "activate") {
            if (!terminalId) throw new Error("Reader not found.");
            let clearQuery = admin
              .from("payment_terminals")
              .update({ status: "inactive" })
              .eq("store_id", caller.storeId)
              .eq("provider", "stripe");
            if (caller.deviceId) clearQuery = clearQuery.eq("config->>device_id", caller.deviceId);
            await clearQuery;
            const { data, error } = await admin
              .from("payment_terminals")
              .update({
                status: "active",
                stripe_connected_account_id: state.accountId || null,
                stripe_terminal_location_id: state.locationId || null,
              })
              .eq("id", terminalId)
              .eq("store_id", caller.storeId)
              .eq("provider", "stripe")
              .select("id")
              .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error("Reader not found.");
          } else if (action === "connected") {
            if (!terminalId) throw new Error("Reader not found.");
            const { error } = await admin
              .from("payment_terminals")
              .update({
                status: "active",
                serial: clean(body.serial, 100) || null,
                last_seen_at: new Date().toISOString(),
              })
              .eq("id", terminalId)
              .eq("store_id", caller.storeId)
              .eq("provider", "stripe");
            if (error) throw error;
          } else if (action === "disconnected") {
            if (!terminalId) throw new Error("Reader not found.");
            const { error } = await admin
              .from("payment_terminals")
              .update({ status: "configured" })
              .eq("id", terminalId)
              .eq("store_id", caller.storeId)
              .eq("provider", "stripe");
            if (error) throw error;
          } else if (action === "remove") {
            if (!terminalId) throw new Error("Reader not found.");
            const { error } = await admin
              .from("payment_terminals")
              .delete()
              .eq("id", terminalId)
              .eq("store_id", caller.storeId)
              .eq("provider", "stripe");
            if (error) throw error;
          } else {
            return json({ error: "Unsupported reader action" }, 400);
          }

          const terminals = await listStripeTerminals(caller.storeId);
          return json({ ok: true, terminals });
        } catch (error) {
          return json({ error: "Reader update failed" }, 400);
        }
      },
    },
  },
});
