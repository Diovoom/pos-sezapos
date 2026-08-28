// Device-authenticated operating snapshot for the installed SEZA POS.
//
// This endpoint deliberately authenticates the PHYSICAL REGISTER rather than
// requiring a Supabase employee session. It lets a paired terminal refresh the
// store/catalog/employee/permission snapshot even when user Auth is degraded.
import { createFileRoute } from "@tanstack/react-router";

type Body = {
  store_id?: unknown;
  device_id?: unknown;
  device_secret?: unknown;
  user_id?: unknown;
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

export const Route = createFileRoute("/api/public/pos/device-bootstrap")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.device_bootstrap",
          limit: 60,
          windowSeconds: 600,
          blockSeconds: 300,
          maxBodyBytes: 8192,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const storeId = typeof body.store_id === "string" ? body.store_id : "";
        const deviceId = typeof body.device_id === "string" ? body.device_id : "";
        const deviceSecret = typeof body.device_secret === "string" ? body.device_secret : "";
        const userId = typeof body.user_id === "string" ? body.user_id : "";
        if (!storeId || !deviceId || !deviceSecret) return json({ error: "Device not paired" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { verifyDeviceSecret } = await import("@/lib/pos/device.server");
        const admin: any = supabaseAdmin;

        const { data: dev } = await admin
          .from("device_registrations")
          .select("id,store_id,status,secret_hash,label")
          .eq("id", deviceId)
          .maybeSingle();
        if (!dev || dev.status !== "active" || dev.store_id !== storeId || !verifyDeviceSecret(deviceSecret, dev.secret_hash)) {
          return json({ error: "Device is not paired to this store" }, 401);
        }

        const [storeResult, productsResult, categoriesResult, employeesResult, permissionsResult] = await Promise.all([
          admin.from("stores").select("*").eq("id", storeId).maybeSingle(),
          admin
            .from("products")
            .select("id,name,price,cost,sku,barcode,stock,taxable,category_id,is_favorite,store_id,image_url,age_restricted,min_age,age_category,status")
            .eq("store_id", storeId)
            .eq("status", "active")
            .order("name"),
          admin.from("categories").select("id,name,sort_order").eq("store_id", storeId).order("sort_order"),
          admin
            .from("profiles")
            .select("id,first_name,last_name,full_name,email,phone,employee_id,status,hire_date,must_change_password,photo_url,store_id")
            .eq("store_id", storeId)
            .eq("status", "active"),
          admin.from("role_permissions").select("role,permission").eq("store_id", storeId),
        ]);

        if (!storeResult.data) return json({ error: "Store configuration is unavailable" }, 503);

        let profile: any = null;
        let roles: string[] = [];
        if (userId) {
          const [{ data: p }, { data: r }] = await Promise.all([
            admin.from("profiles").select("*").eq("id", userId).eq("store_id", storeId).maybeSingle(),
            admin.from("user_roles").select("role").eq("user_id", userId),
          ]);
          if (p?.status === "active") {
            profile = p;
            roles = (r ?? []).map((row: { role: string }) => row.role);
          }
        }

        try {
          await admin
            .from("device_registrations")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", deviceId);
        } catch {
          /* heartbeat is best-effort */
        }

        return json({
          store: storeResult.data,
          products: productsResult.data ?? [],
          categories: categoriesResult.data ?? [],
          employees: employeesResult.data ?? [],
          role_permissions: permissionsResult.data ?? [],
          profile,
          roles,
          device: { id: dev.id, label: dev.label, store_id: dev.store_id },
          prepared_at: new Date().toISOString(),
        });
      },
    },
  },
});
