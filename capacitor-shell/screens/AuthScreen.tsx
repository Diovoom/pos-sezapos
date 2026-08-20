// Production PIN sign-in for the bundled Android shell.
//
// If this device has been paired with a store (via the /pair screen), we
// use the store-scoped, PIN-only endpoint /api/public/pos/verify-pin and
// send our device_secret as proof. Otherwise we fall back to the
// employee-id + PIN endpoint used by unpaired installs.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SEZA_LOGO_URL } from "../logo";
import { API_BASE_URL, supabase } from "../supabase";
import { clearPairing, getPairing } from "../lib/pairing";
import { cacheMeta, deleteMeta } from "@/lib/offline/db";

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
  // Read pairing on every mount (not memoized at module load) so that a
  // freshly paired device immediately renders the PIN-only flow when the
  // /pair screen navigates back to /auth.
  const [pairing, setPairing] = useState(() => getPairing());
  useEffect(() => {
    // Re-check when the tab regains focus (e.g. returning from OS prompts).
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

  // Physical keyboards and USB numeric keypads remain supported without a
  // second visible PIN field. The six dots are the only PIN display.
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

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Offline-first sign-in: once this employee has been successfully
      // verified on this paired register, authenticate against the local
      // device-bound PIN verifier FIRST. Do not wait for sezapos.com just to
      // open the register. Cloud validation/sync happens separately.
      if (pairing) {
        const offlineEmployee = await findOfflineEmployee(pin, pairing.deviceSecret, pairing.storeId);
        if (offlineEmployee) {
          await cacheMeta("authenticated_me_current_user", offlineEmployee.userId).catch(() => {});
          navigate({ to: "/pos", replace: true });
          return;
        }
      }

      // First-time PIN use on this register still needs one online verification
      // so we can securely seed the device-bound local verifier. After that,
      // normal PIN entry is local-first and does not depend on the website.
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

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token_hash?: string; error?: string; message?: string;
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
        setPin("");
        setError(data.error ?? "Sign-in failed. Please try again.");
        return;
      }
      if (!data.token_hash) { setError("Sign-in failed. Please try again."); setPin(""); return; }
      // Always end the previous employee session locally before accepting the
      // new PIN identity. This prevents a fast Switch user from reusing the
      // previous owner's auth/query state.
      await supabase.auth.signOut({ scope: "local" } as any).catch(() => {});
      const { data: verified, error: otpErr } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash, type: "magiclink",
      });
      if (otpErr) { setError(otpErr.message); setPin(""); return; }
      if (verified.session?.user?.id) {
        await cacheMeta("authenticated_me_current_user", verified.session.user.id).catch(() => {});
        await deleteMeta("authenticated_me").catch(() => {});
      }
      if (pairing && verified.session?.user?.id) {
        await rememberOfflinePin(pin, pairing.deviceSecret, pairing.storeId, verified.session.user.id).catch(() => {});
      }

      // Never leave the shell waiting on auth/query side effects. A successful
      // PIN verification always transitions directly into the POS. This fixes
      // the old blue-page state where authentication succeeded but the route
      // never advanced.
      navigate({ to: "/pos", replace: true });
    } catch (err) {
      if (pairing) {
        const offlineEmployee = await findOfflineEmployee(pin, pairing.deviceSecret, pairing.storeId);
        if (offlineEmployee) {
          // The PIN verifier is device-secret + store scoped and was created
          // only after a successful online Stripe/Supabase-backed sign-in.
          // Restore that exact cached identity even if the cloud auth session
          // can't refresh. This is a real local register session, not a fake
          // bypass; cloud sync remains paused until authenticated connectivity
          // is available again.
          await cacheMeta("authenticated_me_current_user", offlineEmployee.userId).catch(() => {});
          setError(null);
          navigate({ to: "/pos", replace: true });
          return;
        }
      }
      setError(err instanceof Error ? err.message : "Network error. Check your connection.");
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
        Offline-first register · automatic cloud sync · v1.3.4
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
