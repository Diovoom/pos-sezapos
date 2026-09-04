// APK: one-time pairing screen. Prompts the cashier/owner for the 10-char
// pairing code shown on the merchant dashboard, exchanges it for a
// device_secret, and stashes {store_id, device_id, device_secret, label}
// in localStorage. All subsequent PIN sign-ins on this install are
// automatically scoped to the paired store.
import { nativeFetch, userSafeNetworkMessage, SEZA_ANDROID_BUILD_ID } from "../lib/nativeHttp";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SEZA_LOGO_URL } from "../logo";
import { API_BASE_URL } from "../supabase";
import { setPairing } from "../lib/pairing";
import { cacheMeta, cacheProducts } from "@/lib/offline/db";

export function PairDeviceScreen() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{10}$/.test(c)) { setErr("Enter the full 10-character pairing code."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await nativeFetch(`${API_BASE_URL}/api/public/pos/pair-device`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: c, label: label.trim() || undefined, platform: "android" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        device_id?: string; device_secret?: string; store_id?: string; label?: string; error?: string;
        bootstrap?: {
          store?: any;
          products?: any[];
          categories?: any[];
          role_permissions?: Array<{ role: string; permission: string }>;
          prepared_at?: string;
        };
      };
      if (!res.ok || !data.device_id || !data.device_secret || !data.store_id) {
        setErr(data.error ?? "Could not pair this device"); return;
      }
      await setPairing({
        deviceId: data.device_id,
        deviceSecret: data.device_secret,
        storeId: data.store_id,
        label: data.label ?? label.trim() ?? "POS Register",
      });

      // Seed the local operating snapshot as part of provisioning. A terminal
      // should not need a second cloud request just to display its store and
      // catalog after pairing.
      const bootstrap = data.bootstrap ?? {};
      await Promise.all([
        cacheMeta("store_id", data.store_id),
        cacheMeta(`store:${data.store_id}`, bootstrap.store ?? { id: data.store_id }),
        cacheMeta("store", bootstrap.store ?? { id: data.store_id }),
        cacheMeta(`categories:${data.store_id}`, bootstrap.categories ?? []),
        cacheMeta(`role_permissions:${data.store_id}`, bootstrap.role_permissions ?? []),
        Array.isArray(bootstrap.products)
          ? cacheProducts(bootstrap.products as any[])
          : Promise.resolve(),
        cacheMeta("provisioned_at", bootstrap.prepared_at ?? new Date().toISOString()),
      ]).catch((cacheError) => console.warn("[SEZA POS] pairing bootstrap cache warning", cacheError));

      navigate({ to: "/auth", replace: true });
    } catch (e) {
      console.error("[SEZA POS] pairing transport error", e); setErr(userSafeNetworkMessage());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#f8fafc", color: "#0f172a",
      display: "flex", flexDirection: "column",
      padding: "max(env(safe-area-inset-top), 24px) 24px max(env(safe-area-inset-bottom), 24px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: "#1e40af",
          display: "grid", placeItems: "center",
        }}>
          <img src={SEZA_LOGO_URL} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase" }}>SEZA</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Pair this register</div>
        </div>
      </div>

      <p style={{ fontSize: 14, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
        In the SEZA merchant dashboard, open <b>POS Devices</b> and generate a pairing code. Enter it below to link this device to your store — you only do this once.
      </p>

      <label style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>Pairing code</label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 10))}
        placeholder="ABCDE23456"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        style={{
          marginTop: 6, marginBottom: 16, padding: "14px 16px", fontSize: 22,
          letterSpacing: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          border: "1px solid #cbd5e1", borderRadius: 12, background: "#fff",
        }}
      />

      <label style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>Register name (optional)</label>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value.slice(0, 60))}
        placeholder="Front Counter"
        style={{
          marginTop: 6, marginBottom: 20, padding: "12px 14px", fontSize: 15,
          border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff",
        }}
      />

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        style={{
          background: "#1e40af", color: "#fff", border: 0, borderRadius: 12,
          padding: "14px 16px", fontSize: 16, fontWeight: 600,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Pairing…" : "Pair register"}
      </button>

      {err && (
        <div style={{
          marginTop: 14, background: "#fef2f2", border: "1px solid #fecaca",
          color: "#b91c1c", padding: "10px 12px", borderRadius: 10, fontSize: 13,
        }}>{err}</div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 20, textAlign: "center", color: "#94a3b8", fontSize: 11 }}>
        Connected securely to sezapos.com
      </div>
    <div style={{ fontSize: 9, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>{SEZA_ANDROID_BUILD_ID}</div>
      </div>
  );
}
