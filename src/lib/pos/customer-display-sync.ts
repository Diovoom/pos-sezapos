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
  currency: string;
  phase: "idle" | "sale" | "complete";
  lines: CustomerDisplayLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod?: string | null;
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
 * 3) Supabase Realtime broadcast for APK -> web display on another device.
 */
export async function publishCustomerDisplay(payload: CustomerDisplayPayload): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      if (payload.storeId)
        window.localStorage.setItem("seza.customer-display.storeId", payload.storeId);
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(LOCAL_CHANNEL);
        channel.postMessage(payload);
        channel.close();
      }
    } catch {
      // Local display support is best-effort and must never block a sale.
    }
  }

  if (!payload.storeId || typeof navigator === "undefined" || !navigator.onLine) return;
  try {
    const channel = supabase.channel(realtimeTopic(payload.storeId), {
      config: { broadcast: { self: false, ack: false } },
    });
    await channel.subscribe();
    await channel.send({ type: "broadcast", event: EVENT, payload });
    await supabase.removeChannel(channel);
  } catch {
    // Remote display failure must never affect checkout.
  }
}

export function subscribeCustomerDisplay(
  storeId: string | null,
  onPayload: (payload: CustomerDisplayPayload) => void,
): () => void {
  if (!storeId) return () => undefined;
  const channel = supabase
    .channel(realtimeTopic(storeId), {
      config: { broadcast: { self: false, ack: false } },
    })
    .on("broadcast", { event: EVENT }, ({ payload }) => {
      const next = payload as CustomerDisplayPayload;
      if (next?.type === "seza-pos-display" && next.storeId === storeId) onPayload(next);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export const customerDisplayLocalChannel = LOCAL_CHANNEL;
export const customerDisplayStorageKey = STORAGE_KEY;
