import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  cleanSetup,
  hydrateSetup,
  setupProducts,
  setupStorePatch,
  validateSetup,
  normalizeKey,
  type WizardState,
} from "./model";
import { LEGAL_CONFIG } from "@/lib/legal/config";

const admin = supabaseAdmin as any;
async function owner(context: any, expected: { actorId: string; storeId: string }) {
  if (context.userId !== expected.actorId) throw new Error("SETUP_SCOPE");
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id,store_id,status,email,first_name,last_name,phone")
    .eq("id", context.userId)
    .maybeSingle();
  if (error || !profile || profile.status !== "active" || profile.store_id !== expected.storeId)
    throw new Error("SETUP_SCOPE");
  const { data: roles, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("store_id", profile.store_id)
    .eq("role", "owner");
  if (roleError || !roles?.length) throw new Error("SETUP_SCOPE");
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("*")
    .eq("id", profile.store_id)
    .single();
  if (storeError || !store) throw new Error("SETUP_SCOPE");
  return { profile, store };
}
function busy(state: any) {
  return state?._lock && Date.now() - state._lock.at < 300_000;
}
async function compareSave(store: any, next: any, patch: any = {}) {
  let query = admin
    .from("stores")
    .update({ ...patch, setup_state: next })
    .eq("id", store.id);
  query =
    store.setup_state == null
      ? query.is("setup_state", null)
      : query.eq("setup_state", JSON.stringify(store.setup_state));
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("SETUP_CONFLICT");
  store.setup_state = next;
}
async function legalAccepted(userId: string, storeId: string) {
  const { data, error } = await admin
    .from("legal_acceptances")
    .select("accepted_at")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .eq("terms_version", LEGAL_CONFIG.termsVersion)
    .eq("privacy_version", LEGAL_CONFIG.privacyVersion)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function readSetup(context: any, scope: any) {
  const { profile, store } = await owner(context, scope);
  const saved = store.setup_state ?? {};
  const state = cleanSetup(hydrateSetup(store, profile, saved));
  const legal = await legalAccepted(profile.id, store.id);
  if (legal)
    Object.assign(state.owner, {
      accepted_terms: true,
      legal_accepted_at: legal.accepted_at,
      terms_version: LEGAL_CONFIG.termsVersion,
      privacy_version: LEGAL_CONFIG.privacyVersion,
    });
  return { state, revision: saved._revision ?? null, completed: Boolean(store.setup_completed_at) };
}
export async function saveSetup(context: any, data: any) {
  const { store, profile } = await owner(context, data);
  if (store.setup_completed_at)
    return { revision: store.setup_state?._revision ?? null, completed: true };
  if (busy(store.setup_state)) throw new Error("SETUP_BUSY");
  if ((store.setup_state?._revision ?? null) !== data.revision) throw new Error("SETUP_CONFLICT");
  const state = cleanSetup(data.state);
  state.owner.email = profile.email;
  state.step = Math.min(10, Math.max(0, state.step));
  const revision = crypto.randomUUID();
  await compareSave(store, { ...state, _revision: revision });
  return { revision, completed: false };
}
async function productId(storeId: string, key: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`seza-setup-product:${storeId}:${key}`),
    ),
  );
  digest[6] = (digest[6] & 15) | 80;
  digest[8] = (digest[8] & 63) | 128;
  const h = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function finishSetup(context: any, data: any) {
  const { profile, store } = await owner(context, data);
  if (store.setup_completed_at) return { completed: true, alreadyCompleted: true };
  if (busy(store.setup_state)) throw new Error("SETUP_BUSY");
  if ((store.setup_state?._revision ?? null) !== data.revision) throw new Error("SETUP_CONFLICT");
  const state = cleanSetup(data.state);
  state.owner.email = profile.email;
  const invalid = validateSetup(state);
  if (invalid) throw new Error(invalid.message);
  const products = setupProducts(state);
  const lock = {
    ...state,
    _revision: crypto.randomUUID(),
    _lock: { id: crypto.randomUUID(), at: Date.now() },
  };
  await compareSave(store, lock);
  try {
    // Idempotent legal RPC runs once at completion, never during navigation.
    if (!(await legalAccepted(profile.id, store.id))) {
      const { error } = await context.supabase.rpc("record_legal_acceptance", {
        p_terms_version: LEGAL_CONFIG.termsVersion,
        p_privacy_version: LEGAL_CONFIG.privacyVersion,
        p_accepted_at: new Date().toISOString(),
        p_source: "setup_wizard",
      });
      if (error) throw error;
    }
    // Preserve existing catalog rows. Setup inserts new identities only, never
    // upserts prices/stock into existing products. Pagination prevents missed SKUs.
    const existing: any[] = [];
    if (products.length)
      for (let offset = 0; ; offset += 500) {
        const { data: rows, error } = await admin
          .from("products")
          .select("id,name,sku")
          .eq("store_id", store.id)
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        existing.push(...rows);
        if (rows.length < 500) break;
      }
    const rows = [];
    for (const product of products) {
      const key = product.sku
        ? `sku:${normalizeKey(product.sku)}`
        : `name:${normalizeKey(product.name)}`;
      const id = await productId(store.id, key);
      if (
        existing.some(
          (p) =>
            p.id === id ||
            (product.sku
              ? normalizeKey(p.sku ?? "") === normalizeKey(product.sku)
              : normalizeKey(p.name) === normalizeKey(product.name)),
        )
      )
        continue;
      rows.push({ ...product, sku: product.sku || null, id, store_id: store.id, taxable: true });
    }
    if (rows.length) {
      const { error } = await admin
        .from("products")
        .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    }
    if (!state.employee.skip) {
      const { createEmployeeForOwner } = await import("@/lib/employees.functions");
      await createEmployeeForOwner(
        {
          ...state.employee,
          email: normalizeKey(state.employee.email),
          expectedActorId: profile.id,
          expectedStoreId: store.id,
        },
        context,
        true,
      );
    }
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        first_name: state.owner.first_name.trim(),
        last_name: state.owner.last_name.trim(),
        full_name: `${state.owner.first_name.trim()} ${state.owner.last_name.trim()}`,
        phone: state.owner.phone.trim() || null,
      })
      .eq("id", profile.id)
      .eq("store_id", store.id)
      .select("id")
      .single();
    if (profileError) throw profileError;
    const completed = { ...state, step: 11, _revision: crypto.randomUUID() };
    await compareSave(store, completed, {
      ...setupStorePatch(state, store),
      setup_completed_at: new Date().toISOString(),
    });
    return { completed: true, imported: rows.length, skipped: products.length - rows.length };
  } catch (error) {
    // Keep the exact revision so a retry can resume safely after partial success.
    await compareSave(store, { ...state, _revision: data.revision }).catch(() => undefined);
    throw error;
  }
}
