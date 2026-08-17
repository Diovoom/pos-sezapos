import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/pos/finix/sale")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardApiRequest, securityHeaders } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.finix.sale",
          limit: 30,
          windowSeconds: 60,
          blockSeconds: 60,
          maxBodyBytes: 16384,
          allowMissingOrigin: true,
        });
        if (blocked) return blocked;

        try {
          const body = (await request.json()) as Record<string, unknown>;
          const amount = Number(body.amount_cents);
          const currency = String(body.currency ?? "USD").toUpperCase();
          const idempotencyId = String(body.idempotency_id ?? "").trim();
          if (!Number.isInteger(amount) || amount <= 0) return Response.json({ error: "Invalid amount" }, { status: 400, headers: securityHeaders() });
          if (!/^[A-Z]{3}$/.test(currency)) return Response.json({ error: "Invalid currency" }, { status: 400, headers: securityHeaders() });
          if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyId)) return Response.json({ error: "Invalid payment attempt ID" }, { status: 400, headers: securityHeaders() });

          const {
            authenticatePosUser,
            resolveFinixTerminal,
            finixRequest,
            FinixApiError,
            transferOutcome,
          } = await import("@/lib/finix/client.server");
          const { admin, storeId, userId } = await authenticatePosUser(request);
          const terminal = await resolveFinixTerminal(admin, storeId);

          // Refuse to launch a payment when Finix reports the assigned device offline.
          const device: any = await finixRequest(terminal.environment, `/devices/${encodeURIComponent(terminal.deviceId)}?include_connection=true`);
          const connected = device?.connection?.connected ?? device?.connected;
          if (connected === false) {
            return Response.json({ error: "Finix payment terminal is offline." }, { status: 409, headers: securityHeaders() });
          }

          let transfer: any;
          try {
            transfer = await finixRequest(terminal.environment, "/transfers", {
              method: "POST",
              body: JSON.stringify({
                amount,
                currency,
                device: terminal.deviceId,
                operation_key: "CARD_PRESENT_SALE",
                idempotency_id: idempotencyId,
                tags: {
                  seza_store_id: storeId,
                  seza_employee_id: userId,
                  seza_attempt_id: idempotencyId,
                },
              }),
            });
          } catch (error) {
            // A retry after an ambiguous network response must not create a second charge.
            // Recover the original transfer by Finix idempotency ID when possible.
            if (error instanceof FinixApiError && error.status >= 400 && error.status < 500) {
              const existing: any = await finixRequest(
                terminal.environment,
                `/transfers?idempotency_id=${encodeURIComponent(idempotencyId)}`,
              ).catch(() => null);
              transfer = existing?._embedded?.transfers?.[0] ?? null;
              if (!transfer) throw error;
            } else {
              throw error;
            }
          }

          const outcome = transferOutcome(transfer);
          try {
            await admin.from("payment_attempts").insert({
              provider: "finix",
              method: "card",
              amount: amount / 100,
              currency,
              status: outcome.status,
              message: outcome.message,
              reference: transfer?.id ?? null,
            });
          } catch {
            // Payment logging must never change the processor outcome.
          }

          return Response.json({
            ok: outcome.status === "approved",
            final_status: outcome.status,
            message: outcome.message,
            reference: transfer?.id ?? null,
            state: transfer?.state ?? null,
            card_brand: transfer?.payment_instrument_details?.brand ?? transfer?.card_type ?? null,
            last4: transfer?.payment_instrument_details?.last_four ?? transfer?.instrument_last_four ?? null,
          }, { headers: securityHeaders() });
        } catch (error: any) {
          const status = Number(error?.status) || 500;
          const safeStatus = status >= 400 && status <= 599 ? status : 500;
          return Response.json({ error: error?.message || "Finix payment could not be completed." }, { status: safeStatus, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
