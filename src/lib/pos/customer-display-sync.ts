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
  currency: string;
  phase: "idle" | "sale" | "complete";
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

const publisherChannels = new Map<string, ReturnType<typeof supabase.channel>>();
const publisherReady = new Map<string, Promise<ReturnType<typeof supabase.channel>>>();

function getPublisherChannel(storeId: string) {
  const existing = publisherChannels.get(storeId);
  if (existing) return Promise.resolve(existing);

  const pending = publisherReady.get(storeId);
  if (pending) return pending;

  const channel = supabase.channel(realtimeTopic(storeId), {
    config: { broadcast: { self: false, ack: false } },
  });

  const ready = new Promise<ReturnType<typeof supabase.channel>>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      publisherReady.delete(storeId);
      void supabase.removeChannel(channel);
      reject(new Error("Customer display connection timed out"));
    }, 5_000);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timeout);
        publisherReady.delete(storeId);
        publisherChannels.set(storeId, channel);
        resolve(channel);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        window.clearTimeout(timeout);
        publisherReady.delete(storeId);
        publisherChannels.delete(storeId);
        reject(new Error(`Customer display channel ${status.toLowerCase()}`));
      }
    });
  });

  publisherReady.set(storeId, ready);
  return ready;
}

/**
 * Publish through three layers:
 * 1) localStorage for Firefox/Linux polling,
 * 2) BroadcastChannel for same-browser instant updates,
 * 3) Supabase Realtime broadcast for Android/web registers on another device.
 */
export async function publishCustomerDisplay(payload: CustomerDisplayPayload): Promise<void> {
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
    const channel = await getPublisherChannel(payload.storeId);
    await channel.send({ type: "broadcast", event: EVENT, payload });
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

  const channel = supabase
    .channel(realtimeTopic(storeId), {
      config: { broadcast: { self: false, ack: false } },
    })
    .on("broadcast", { event: EVENT }, ({ payload }) => {
      const next = payload as CustomerDisplayPayload;
      if (next?.type === "seza-pos-display" && next.storeId === storeId) onPayload(next);
    })
    .subscribe((status) => {
      onConnectionChange?.(status === "SUBSCRIBED");
    });

  return () => {
    onConnectionChange?.(false);
    void supabase.removeChannel(channel);
  };
}

export const customerDisplayLocalChannel = LOCAL_CHANNEL;
export const customerDisplayStorageKey = STORAGE_KEY;
