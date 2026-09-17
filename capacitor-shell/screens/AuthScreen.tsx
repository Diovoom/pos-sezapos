import { nativeFetch, userSafeNetworkMessage } from "../lib/nativeHttp";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SEZA_LOGO_URL } from "../logo";
import { API_BASE_URL, supabase } from "../supabase";
import { clearPairing, getPairing } from "../lib/pairing";
import { isNetworkConnectedNow } from "@/lib/offline/useOnline";
import {
  cacheEmployees,
  cacheMeta,
  cacheProducts,
  deleteMeta,
  readMeta,
} from "@/lib/offline/db";

type Stage = "pin" | "id_then_pin";

type OfflinePinVerifier = {
  version: 2;
  userId: string;
  storeId: string;
  salt: string;
  digest: string;
  verifiedAt: string;
};

type OfflinePinVault = { version: 2; entries: OfflinePinVerifier[] };
const OFFLINE_PIN_KEY = "seza.offline_pin_verifiers";

const devConsole = {
  error: (...args: unknown[]) => { if (import.meta.env.DEV) console.error(...args); },
  warn: (...args: unknown[]) => { if (import.meta.env.DEV) console.warn(...args); },
  info: (...args: unknown[]) => { if (import.meta.env.DEV) console.info(...args); },
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function derivePinDigest(pin: string, deviceSecret: string, saltB64: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${pin}:${deviceSecret}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const salt = Uint8Array.from(atob(saltB64), (value) => value.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 120_000 },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function rememberOfflinePin(pin: string, deviceSecret: string, storeId: string, userId: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = bytesToBase64(salt);
  const verifier: OfflinePinVerifier = {
    version: 2,
    userId,
    storeId,
    salt: saltB64,
    digest: await derivePinDigest(pin, deviceSecret, saltB64),
    verifiedAt: new Date().toISOString(),
  };
  let vault: OfflinePinVault = { version: 2, entries: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_PIN_KEY) ?? "null") as OfflinePinVault | null;
    if (parsed?.version === 2 && Array.isArray(parsed.entries)) vault = parsed;
  } catch { /* ignore corrupt legacy cache */ }
  vault.entries = [
    verifier,
    ...vault.entries.filter((entry) => !(entry.storeId === storeId && entry.userId === userId)),
  ].slice(0, 32);
  localStorage.setItem(OFFLINE_PIN_KEY, JSON.stringify(vault));
}

async function findOfflineEmployee(pin: string, deviceSecret: string, storeId: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_PIN_KEY) ?? "null") as OfflinePinVault | null;
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.entries)) return null;
    for (const entry of parsed.entries) {
      if (entry.storeId !== storeId) continue;
      const digest = await derivePinDigest(pin, deviceSecret, entry.salt);
      if (digest === entry.digest) return entry;
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pairing, setPairing] = useState(() => getPairing());
  useEffect(() => {
    const refresh = () => setPairing(getPairing());
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const [stage, setStage] = useState<Stage>("pin");
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState(false);

  const activeIsId = stage === "id_then_pin" && collectingId;
  const value = activeIsId ? empId : pin;
  const setValue = activeIsId ? setEmpId : setPin;
  const label = activeIsId ? "Employee ID" : "PIN";

  const dots = useMemo(() => Array.from({ length: 6 }, (_, i) => i < value.length), [value]);

  const press = (d: string) => { if (value.length < 6) setValue(value + d); };
  const del = () => setValue(value.slice(0, -1));
  const clear = () => setValue("");

  useEffect(() => {
    if (stage === "id_then_pin" && collectingId && empId.length === 6) setCollectingId(false);
  }, [empId, stage, collectingId]);

  useEffect(() => {
    if (activeIsId) return;
    if (pin.length !== 6) return;
    if (stage === "id_then_pin" && empId.length !== 6) return;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (busy || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        press(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        del();
      } else if (event.key === "Escape" || event.key === "Delete") {
        event.preventDefault();
        clear();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, value]);

  const signedInDestination = () =>
    localStorage.getItem("seza.device_setup_completed_v1") === "1" ? "/pos" : "/device-setup";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (pairing && !isNetworkConnectedNow()) {
        const offlineEmployee = await findOfflineEmployee(pin, pairing.deviceSecret, pairing.storeId);
        if (offlineEmployee) {
          const cachedMe = await readMeta<any>(`authenticated_me:${offlineEmployee.userId}`).catch(() => undefined);
          if (cachedMe?.profile && cachedMe?.store) {
            await cacheMeta("authenticated_me_current_user", offlineEmployee.userId).catch(() => {});
            queryClient.clear();
            queryClient.setQueryData(["me"], cachedMe);
            navigate({ to: signedInDestination() as any, replace: true });
            return;
          }
        }
      }

      const endpoint = pairing
        ? "/api/public/pos/verify-pin"
        : "/api/public/pos/verify-employee-pin";

      const body = pairing
        ? {
            store_id: pairing.storeId,
            device_id: pairing.deviceId,
            device_secret: pairing.deviceSecret,
            pin,
            ...(stage === "id_then_pin" ? { employee_id: empId } : {}),
          }
        : {
            pin,
            ...(stage === "id_then_pin" ? { employee_id: empId } : {}),
          };

      const res = await nativeFetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user_id?: string;
        email?: string | null;
        token_hash?: string | null;
        error?: string;
        message?: string;
        bootstrap?: {
          profile?: any;
          roles?: string[];
          store?: any;
          products?: any[];
          categories?: any[];
          employees?: any[];
          role_permissions?: Array<{ role: string; permission: string }>;
          prepared_at?: string;
        };
      };
      if (!res.ok) {
        // A paired device that the merchant just revoked → force re-pair.
        if (pairing && res.status === 401 && (data.error ?? "").toLowerCase().includes("device")) {
          clearPairing();
          navigate({ to: "/pair", replace: true });
          return;
        }
        if (data.error === "MULTIPLE_MATCHES") {
          setStage("id_then_pin");
          setCollectingId(true);
          setPin(""); setEmpId("");
          setError(data.message ?? "Enter your Employee ID first, then your PIN.");
          return;
        }
        if (!data.error) {
          const raw = await res.clone().text().catch(() => "");
          devConsole.error("[SEZA POS] PIN endpoint returned a non-SEZA error", {
            status: res.status,
            endpoint,
            body: raw.slice(0, 500),
          });
        }
        setPin("");
        setError(data.error ?? "Sign-in failed. Please try again.");
        return;
      }
      let userId = data.user_id ?? null;
      let bootstrap = data.bootstrap ?? {};
      let cloudSessionReady = false;

      if (!userId && data.token_hash) {
        devConsole.info("[SEZA POS] legacy PIN response detected; resolving employee from token");
        await supabase.auth.signOut({ scope: "local" } as any).catch(() => {});
        const { data: verified, error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: "magiclink",
        });
        if (otpErr || !verified.session?.user?.id) {
          devConsole.error("[SEZA POS] PIN accepted but cloud session could not be established", otpErr);
          setError("Sign-in is temporarily unavailable. Please try again.");
          setPin("");
          return;
        }
        userId = verified.session.user.id;
        cloudSessionReady = true;
      }

      if (!userId) {
        devConsole.error("[SEZA POS] incomplete PIN response", {
          status: res.status,
          hasToken: Boolean(data.token_hash),
          hasBootstrap: Boolean(data.bootstrap),
        });
        setError("Sign-in is temporarily unavailable. Please try again.");
        setPin("");
        return;
      }

      if (pairing && (!bootstrap.profile || !bootstrap.store || !Array.isArray(bootstrap.products) || bootstrap.products.length === 0)) {
        try {
          const snapshotResponse = await nativeFetch(`${API_BASE_URL}/api/public/pos/device-bootstrap`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              store_id: pairing.storeId,
              device_id: pairing.deviceId,
              device_secret: pairing.deviceSecret,
              user_id: userId,
            }),
          });
          if (snapshotResponse.ok) {
            const snapshot = (await snapshotResponse.json().catch(() => ({}))) as any;
            bootstrap = {
              profile: snapshot.profile ?? bootstrap.profile,
              roles: snapshot.roles ?? bootstrap.roles,
              store: snapshot.store ?? bootstrap.store,
              products: snapshot.products ?? bootstrap.products,
              categories: snapshot.categories ?? bootstrap.categories,
              employees: snapshot.employees ?? bootstrap.employees,
              role_permissions: snapshot.role_permissions ?? bootstrap.role_permissions,
              prepared_at: snapshot.prepared_at ?? bootstrap.prepared_at,
            };
          }
        } catch (snapshotError) {
          devConsole.warn("[SEZA POS] device bootstrap compatibility request deferred", snapshotError);
        }
      }

      if ((!bootstrap.profile || !bootstrap.store) && cloudSessionReady && pairing) {
        try {
          const [profileResult, rolesResult, storeResult, productsResult, categoriesResult, employeesResult, permissionsResult] =
            await Promise.all([
              supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
              supabase.from("user_roles").select("role").eq("user_id", userId),
              supabase.from("stores").select("*").eq("id", pairing.storeId).maybeSingle(),
              supabase.from("products").select("*").eq("store_id", pairing.storeId).eq("status", "active"),
              supabase.from("categories").select("*").eq("store_id", pairing.storeId),
              supabase.from("profiles").select("*").eq("store_id", pairing.storeId).eq("status", "active"),
              supabase.from("role_permissions").select("role,permission").eq("store_id", pairing.storeId),
            ]);
          bootstrap = {
            profile: profileResult.data ?? bootstrap.profile,
            roles: (rolesResult.data ?? []).map((row: any) => row.role),
            store: storeResult.data ?? bootstrap.store,
            products: productsResult.data ?? bootstrap.products,
            categories: categoriesResult.data ?? bootstrap.categories,
            employees: employeesResult.data ?? bootstrap.employees,
            role_permissions: permissionsResult.data ?? bootstrap.role_permissions,
            prepared_at: new Date().toISOString(),
          };
        } catch (compatError) {
          devConsole.warn("[SEZA POS] legacy bootstrap reconstruction deferred", compatError);
        }
      }

      const profile = bootstrap.profile ?? {
        id: userId,
        email: data.email ?? null,
        store_id: pairing?.storeId ?? null,
        status: "active",
      };
      const store = bootstrap.store ?? (pairing ? { id: pairing.storeId } : null);
      const roles = Array.isArray(bootstrap.roles) && bootstrap.roles.length
        ? bootstrap.roles
        : ["cashier"];
      const meSnapshot = {
        user: { id: userId, email: data.email ?? profile?.email ?? undefined },
        profile,
        roles,
        store,
      };

      await Promise.all([
        cacheMeta("authenticated_me_current_user", userId),
        cacheMeta(`authenticated_me:${userId}`, meSnapshot),
        cacheMeta(`profile:${userId}`, profile),
        cacheMeta("profile", profile),
        store?.id ? cacheMeta("store_id", store.id) : Promise.resolve(),
        store?.id ? cacheMeta(`store:${store.id}`, store) : Promise.resolve(),
        store ? cacheMeta("store", store) : Promise.resolve(),
        store?.id && Array.isArray(bootstrap.categories)
          ? cacheMeta(`categories:${store.id}`, bootstrap.categories)
          : Promise.resolve(),
        store?.id && Array.isArray(bootstrap.role_permissions)
          ? cacheMeta(`role_permissions:${store.id}`, bootstrap.role_permissions)
          : Promise.resolve(),
        Array.isArray(bootstrap.products) ? cacheProducts(bootstrap.products as any[]) : Promise.resolve(),
        Array.isArray(bootstrap.employees) ? cacheEmployees(bootstrap.employees as any[]) : Promise.resolve(),
        deleteMeta("authenticated_me"),
      ]).catch((cacheError) => devConsole.error("[SEZA POS] bootstrap cache failed", cacheError));

      queryClient.clear();
      queryClient.setQueryData(["me"], meSnapshot);
      window.dispatchEvent(new Event("seza:bootstrap-updated"));

      if (pairing) {
        await rememberOfflinePin(pin, pairing.deviceSecret, pairing.storeId, userId).catch(() => {});
      }

      if (data.token_hash && !cloudSessionReady) {
        try {
          await supabase.auth.signOut({ scope: "local" } as any).catch(() => {});
          const { error: otpErr } = await supabase.auth.verifyOtp({
            token_hash: data.token_hash,
            type: "magiclink",
          });
          if (!otpErr) cloudSessionReady = true;
          else devConsole.warn("[SEZA POS] cloud session unavailable:", otpErr.message);
        } catch (cloudError) {
          devConsole.warn("[SEZA POS] cloud session unavailable:", cloudError);
        }
      }

      if (cloudSessionReady) {
        void import("@/lib/offline/sync").then(({ syncNow }) => syncNow().catch(() => undefined));
      }

      setError(null);
      navigate({ to: signedInDestination() as any, replace: true });
    } catch (err) {
      if (pairing) {
        const offlineEmployee = await findOfflineEmployee(pin, pairing.deviceSecret, pairing.storeId);
        if (offlineEmployee) {
          const cachedMe = await readMeta<any>(`authenticated_me:${offlineEmployee.userId}`).catch(() => undefined);
          if (cachedMe?.profile && cachedMe?.store) {
            await cacheMeta("authenticated_me_current_user", offlineEmployee.userId).catch(() => {});
            queryClient.clear();
            queryClient.setQueryData(["me"], cachedMe);
            setError(null);
            navigate({ to: signedInDestination() as any, replace: true });
            return;
          }
        }
      }
      devConsole.error("[SEZA POS] PIN transport error", err); setError(userSafeNetworkMessage());
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.brandRow}>
        <div style={styles.logoBadge}>
          <img src={SEZA_LOGO_URL} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase" }}>SEZA</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>POS Terminal</div>
          {pairing && (
            <div style={{ fontSize: 11, color: "#64748b" }}>{pairing.label}</div>
          )}
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <div style={{ fontSize: 13, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
          {stage === "id_then_pin"
            ? collectingId ? "Enter your Employee ID" : "Enter your PIN"
            : "Enter your 6-digit PIN"}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          {dots.map((filled, i) => (
            <span
              key={i}
              style={{
                width: 14, height: 14, borderRadius: "50%",
                background: filled ? "#1e40af" : "transparent",
                border: `2px solid ${filled ? "#1e40af" : "#cbd5e1"}`,
              }}
            />
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>{label}</div>
        {stage === "id_then_pin" && !collectingId && (
          <button
            type="button"
            onClick={() => { setCollectingId(true); setEmpId(""); setPin(""); }}
            style={{ background: "transparent", border: 0, color: "#1e40af", fontSize: 12, marginTop: 8 }}
          >
            Change Employee ID
          </button>
        )}
      </div>

      <div style={styles.pad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <PadBtn key={d} onClick={() => press(d)} disabled={busy}>{d}</PadBtn>
        ))}
        <PadBtn onClick={clear} disabled={busy} ghost>C</PadBtn>
        <PadBtn onClick={() => press("0")} disabled={busy}>0</PadBtn>
        <PadBtn onClick={del} disabled={busy} ghost>⌫</PadBtn>
      </div>

      {busy && (
        <div style={{ marginTop: 12, textAlign: "center", color: "#475569", fontSize: 13 }}>
          Signing you in…
        </div>
      )}
      {error && <div style={styles.errorBox}>{error}</div>}

      {!pairing && (
        <button
          type="button"
          onClick={() => navigate({ to: "/pair" })}
          style={{
            background: "transparent", border: 0, color: "#1e40af",
            fontSize: 13, marginTop: 12, textAlign: "center",
          }}
        >
          Pair this register with a store
        </button>
      )}

      <div style={styles.footer}>
        SEZA POS
      </div>
    </div>
  );
}

function PadBtn({ children, onClick, disabled, ghost }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; ghost?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      style={{
        height: 52, borderRadius: 12, fontSize: 21, fontWeight: 650,
        background: ghost ? "transparent" : "#fff",
        border: ghost ? "0" : "1px solid #cbd5e1",
        color: ghost ? "#64748b" : "#0f172a",
        opacity: disabled ? 0.55 : 1,
        WebkitTapHighlightColor: "transparent",
      }}
    >{children}</button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh", background: "#f8fafc", color: "#0f172a",
    display: "flex", flexDirection: "column",
    padding: "max(env(safe-area-inset-top), 20px) 20px max(env(safe-area-inset-bottom), 20px)",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 4 },
  logoBadge: {
    width: 48, height: 48, borderRadius: 12, background: "#1e40af",
    display: "grid", placeItems: "center", boxShadow: "0 8px 24px rgba(30,64,175,.25)",
  },
  pad: {
    width: "min(100%, 720px)", alignSelf: "center", marginTop: 18,
    display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10,
  },
  errorBox: {
    marginTop: 12, background: "#fef2f2", border: "1px solid #fecaca",
    color: "#b91c1c", padding: "10px 12px", borderRadius: 10, fontSize: 13, textAlign: "center",
  },
  footer: { marginTop: "auto", paddingTop: 20, textAlign: "center", color: "#94a3b8", fontSize: 11 },
};
