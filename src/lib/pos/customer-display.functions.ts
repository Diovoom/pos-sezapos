import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const payloadSchema = z
  .object({
    type: z.literal("seza-pos-display"),
    version: z.literal(2),
    storeId: z.string().uuid(),
  })
  .passthrough();

/**
 * Publish a customer-display update. Only an authenticated staff member of the
 * target store may broadcast, and the payload is signed server-side so displays
 * can reject spoofed messages.
 */
export const publishCustomerDisplayUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => payloadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("store_id")
      .eq("id", context.userId)
      .maybeSingle();

    if (error) throw new Error("Unable to verify store membership");
    if (!profile?.store_id || profile.store_id !== data.storeId) {
      throw new Error("Not permitted to publish to this store display");
    }

    const { signDisplayPayload, broadcastDisplayPayload } = await import(
      "./customer-display.server"
    );
    const signature = await signDisplayPayload(data as Record<string, unknown>);
    await broadcastDisplayPayload(data.storeId, "display-update", {
      ...(data as Record<string, unknown>),
      signature,
    });
    return { ok: true as const };
  });

/** Verify a received display payload signature (no secrets leave the server). */
export const verifyCustomerDisplayUpdate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ payload: payloadSchema, signature: z.string().min(1).max(256) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { verifyDisplaySignature } = await import("./customer-display.server");
    return { valid: await verifyDisplaySignature(data.payload as Record<string, unknown>, data.signature) };
  });
