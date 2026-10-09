import { nativeFetch } from "./nativeHttp";
import { API_BASE_URL, supabase } from "../supabase";
import { getPairing } from "./pairing";
import {
  cacheEmployees,
  cacheMeta,
  cacheProducts,
  readMeta,
  deleteMeta,
} from "@/lib/offline/db";

let running: Promise<boolean> | null = null;
let lastCompletedAt = 0;
let lastScope = "";
let runningScope = "";

export async function refreshDeviceBootstrap(force = false): Promise<boolean> {
  const pairing = getPairing();
  if (!pairing) return false;
  const userId = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
  const scope = `${pairing.storeId}:${pairing.deviceId}:${userId ?? ""}`;
  if (!force && scope === lastScope && Date.now() - lastCompletedAt < 5 * 60_000) return true;
  if (running) {
    if (scope === runningScope) return running;
    await running;
    return refreshDeviceBootstrap(force);
  }
  runningScope = scope;
  running = (async () => {

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
    // A late old-store/old-employee response must not replace current caches
    // or revoke a newly paired device.
    const current = getPairing();
    const currentUser = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
    if (current?.storeId !== pairing.storeId || current?.deviceId !== pairing.deviceId || currentUser !== userId) return false;
    if (!response.ok) {
      if (response.status === 401) window.dispatchEvent(new Event("seza:device-revoked"));
      return false;
    }

    const store = data.store ?? { id: pairing.storeId };
    await Promise.all([
      cacheMeta("store_id", pairing.storeId),
      cacheMeta(`store:${pairing.storeId}`, store),
      cacheMeta("store", store),
      Array.isArray(data.categories)
        ? cacheMeta(`categories:${pairing.storeId}`, data.categories)
        : Promise.resolve(),
      Array.isArray(data.role_permissions)
        ? cacheMeta(`role_permissions:${pairing.storeId}`, data.role_permissions)
        : Promise.resolve(),
      Array.isArray(data.products)
        ? cacheProducts(data.products)
        : Promise.resolve(),
      Array.isArray(data.employees) ? cacheEmployees(data.employees) : Promise.resolve(),
      cacheMeta("device_bootstrap_at", data.prepared_at ?? new Date().toISOString()),
    ]);

    if (userId && data.profile === null) {
      // A successful authoritative refresh confirmed this employee is no
      // longer active in the paired store. Keep queued records and pairing,
      // but prevent the cached identity from reopening the register.
      localStorage.setItem("seza.employee_select_required", "1");
      await Promise.all([
        deleteMeta("authenticated_me_current_user"),
        deleteMeta(`authenticated_me:${userId}`),
        deleteMeta("profile"),
      ]);
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
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

    lastScope = scope;
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
