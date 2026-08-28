import { nativeFetch } from "./nativeHttp";
import { API_BASE_URL } from "../supabase";
import { getPairing } from "./pairing";
import {
  cacheEmployees,
  cacheMeta,
  cacheProducts,
  readMeta,
} from "@/lib/offline/db";

let running: Promise<boolean> | null = null;
let lastCompletedAt = 0;

export async function refreshDeviceBootstrap(force = false): Promise<boolean> {
  if (!force && Date.now() - lastCompletedAt < 5 * 60_000) return true;
  if (running) return running;

  running = (async () => {
    const pairing = getPairing();
    if (!pairing) return false;
    const userId = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);

    const response = await nativeFetch(`${API_BASE_URL}/api/public/pos/device-bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        store_id: pairing.storeId,
        device_id: pairing.deviceId,
        device_secret: pairing.deviceSecret,
        user_id: userId ?? undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as any;
    if (!response.ok) {
      if (response.status === 401) window.dispatchEvent(new Event("seza:device-revoked"));
      return false;
    }

    const store = data.store ?? { id: pairing.storeId };
    await Promise.all([
      cacheMeta("store_id", pairing.storeId),
      cacheMeta(`store:${pairing.storeId}`, store),
      cacheMeta("store", store),
      cacheMeta(`categories:${pairing.storeId}`, data.categories ?? []),
      cacheMeta(`role_permissions:${pairing.storeId}`, data.role_permissions ?? []),
      cacheProducts(data.products ?? []),
      cacheEmployees(data.employees ?? []),
      cacheMeta("device_bootstrap_at", data.prepared_at ?? new Date().toISOString()),
    ]);

    if (userId && data.profile) {
      const me = {
        user: { id: userId, email: data.profile.email ?? undefined },
        profile: data.profile,
        roles: Array.isArray(data.roles) ? data.roles : [],
        store,
      };
      await Promise.all([
        cacheMeta(`authenticated_me:${userId}`, me),
        cacheMeta(`profile:${userId}`, data.profile),
        cacheMeta("profile", data.profile),
      ]);
    }

    lastCompletedAt = Date.now();
    window.dispatchEvent(new Event("seza:bootstrap-updated"));
    return true;
  })()
    .catch((error) => {
      console.warn("[SEZA POS] device bootstrap refresh deferred", error);
      return false;
    })
    .finally(() => {
      running = null;
    });

  return running;
}
