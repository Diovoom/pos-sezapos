import { supabase } from "@/integrations/supabase/client";

export type CustomerDisplayLine = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type CustomerDisplayPayload = {
  type: "seza-pos-display";
  version: 2;
  storeId: string | null;
  storeName: string;
  logoUrl?: string | null;
  idleMode?: "message" | "image";
  idleMessage?: string | null;
  idleImageUrl?: string | null;
  idleTextScale?: number | null;
  currency: string;
  phase: "idle" | "sale" | "awaiting_card" | "processing" | "complete" | "declined" | "cancelled";
  statusMessage?: string | null;
  lines: CustomerDisplayLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod?: string | null;
  amountTendered?: number | null;
  changeDue?: number | null;
  receiptNumber?: string | null;
  updatedAt: string;
};

const STORAGE_KEY = "seza.customer-display.sale";
const LOCAL_CHANNEL = "seza-customer-display";
const EVENT = "display-update";

export function emptyCustomerDisplayPayload(storeId: string | null = null): CustomerDisplayPayload {
  return {
    type: "seza-pos-display",
    version: 2,
    storeId,
    storeName: "SEZA POS",
    idleMode: "message",
    idleMessage: "Welcome",
    idleImageUrl: null,
    idleTextScale: 1,
    currency: "USD",
    phase: "idle",
    lines: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
    updatedAt: new Date(0).toISOString(),
  };
}

export function readLocalCustomerDisplay(): CustomerDisplayPayload {
  if (typeof window === "undefined") return emptyCustomerDisplayPayload();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCustomerDisplayPayload();
    const parsed = JSON.parse(raw) as Partial<CustomerDisplayPayload>;
    if (parsed.type === "seza-pos-display" && parsed.version === 2) {
      return parsed as CustomerDisplayPayload;
    }
    // Compatibility with the temporary v1 web display payload.
    if ((parsed as { type?: string }).type === "seza-pos-sale") {
      return {
        ...emptyCustomerDisplayPayload(),
        ...(parsed as CustomerDisplayPayload),
        type: "seza-pos-display",
        version: 2,
        phase: Array.isArray(parsed.lines) && parsed.lines.length ? "sale" : "idle",
      };
    }
  } catch {
    // Invalid/stale local state should never stop checkout.
  }
  return emptyCustomerDisplayPayload();
}

function realtimeTopic(storeId: string) {
  return `customer-display:${storeId}`;
}

/**
 * Publish through three layers:
 * 1) localStorage for Firefox/Linux polling,
 * 2) BroadcastChannel for same-browser instant updates,
 * 3) a server function that verifies store membership and signs the payload
 *    before broadcasting it to remote registers/displays.
 */
export async function publishCustomerDisplay(payload: CustomerDisplayPayload): Promise<void> {
  // The Android customer display is a native secondary-screen Presentation in
  // the same APK. Update it first so cart/payment changes never depend on a
  // browser window, URL, Supabase, or internet access.
  try {
    const { isNativeMode } = await import("@/lib/native");
    if (isNativeMode()) {
      const { updateNativeCustomerDisplay } = await import("@/lib/hardware/customer-display-native");
      await updateNativeCustomerDisplay(payload);
    }
  } catch {
    // A missing/unplugged second display must never block checkout.
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      if (payload.storeId) {
        window.localStorage.setItem("seza.customer-display.storeId", payload.storeId);
      }
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(LOCAL_CHANNEL);
        channel.postMessage(payload);
        channel.close();
      }
    } catch {
      // Display support is best-effort and must never block checkout.
    }
  }

  if (!payload.storeId || typeof navigator === "undefined" || !navigator.onLine) return;
  try {
    const { publishCustomerDisplayUpdate } = await import("./customer-display.functions");
    await publishCustomerDisplayUpdate({ data: payload });
  } catch {
    // Remote display failure must never affect checkout.
  }
}


export function subscribeCustomerDisplay(
  storeId: string | null,
  onPayload: (payload: CustomerDisplayPayload) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  if (!storeId) {
    onConnectionChange?.(false);
    return () => undefined;
  }

  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    channel = supabase
      .channel(realtimeTopic(storeId), {
        config: { private: true, broadcast: { self: false, ack: false } },
      })
      .on("broadcast", { event: EVENT }, ({ payload }) => {
        const received = payload as CustomerDisplayPayload & { signature?: string };
        if (received?.type !== "seza-pos-display" || received.storeId !== storeId) return;
        const { signature, ...next } = received;
        if (!signature) return;
        void (async () => {
          try {
            const { verifyCustomerDisplayUpdate } = await import("./customer-display.functions");
            const { valid } = await verifyCustomerDisplayUpdate({
              data: { payload: next, signature },
            });
            if (valid) onPayload(next as CustomerDisplayPayload);
          } catch {
            // Reject anything we cannot verify.
          }
        })();
      });
    channel.subscribe((status) => {
      onConnectionChange?.(status === "SUBSCRIBED");
    });
  } catch (error) {
    console.warn("[SEZA POS] remote customer-display realtime unavailable", error);
    onConnectionChange?.(false);
    if (channel) void supabase.removeChannel(channel).catch(() => undefined);
    channel = null;
  }


  return () => {
    onConnectionChange?.(false);
    if (channel) void supabase.removeChannel(channel);
  };
}

export const customerDisplayLocalChannel = LOCAL_CHANNEL;
export const customerDisplayStorageKey = STORAGE_KEY;
