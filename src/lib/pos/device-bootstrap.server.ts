import { collectExportRows } from "../paginated-export";

// A snapshot replaces local caches. Never return an empty/partial snapshot
// after a failed query or silently truncate a merchant catalog at the API cap.
export async function loadDeviceBootstrap(admin: any, storeId: string) {
  const all = (table: string, columns: string, active = false) => collectExportRows<any>(after => {
    let query = admin.from(table).select(columns).eq("store_id", storeId).order("id").limit(500);
    if (active) query = query.eq("status", "active");
    if (after) query = query.gt("id", after);
    return query;
  });
  const [storeResult, products, categories, employees, permissionsResult] = await Promise.all([
    admin.from("stores").select("*").eq("id", storeId).maybeSingle(),
    all("products", "id,name,price,cost,sku,barcode,stock,taxable,category_id,is_favorite,is_quick_key,quick_key_order,track_inventory,store_id,image_url,age_restricted,min_age,age_category,status", true),
    all("categories", "id,name,sort_order"),
    all("profiles", "id,first_name,last_name,full_name,email,phone,employee_id,status,hire_date,must_change_password,photo_url,store_id", true),
    admin.from("role_permissions").select("role,permission").eq("store_id", storeId),
  ]);
  if (storeResult.error || !storeResult.data || permissionsResult.error) throw new Error("Store configuration is unavailable");
  const { admin_notes: _notes, ...store } = storeResult.data;
  return { store, products: products.sort((a, b) => a.name.localeCompare(b.name)),
    categories: categories.sort((a, b) => a.sort_order - b.sort_order), employees,
    role_permissions: permissionsResult.data ?? [], prepared_at: new Date().toISOString() };
}
