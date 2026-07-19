// Production PIN sign-in for the bundled Android shell.
//
// Uses the public HTTPS endpoint /api/public/pos/verify-employee-pin to
// exchange a 6-digit PIN (optionally + Employee ID) for a magic-link
// token_hash, then calls supabase.auth.verifyOtp locally to mint a real
// Supabase session in the WebView's localStorage.
import { useEffect, useMemo, useState } from "react";
import logoAsset from "@/assets/seza-logo.png.asset.json";
import { API_BASE_URL, supabase } from "../supabase";

type Stage = "pin" | "id_then_pin";

export function AuthScreen() {
  const [stage, setStage] = useState<Stage>("pin");
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState(false); // true while typing empId

  const activeIsId = stage === "id_then_pin" && collectingId;
  const value = activeIsId ? empId : pin;
  const setValue = activeIsId ? setEmpId : setPin;
  const label = activeIsId ? "Employee ID" : "PIN";

  const dots = useMemo(() => Array.from({ length: 6 }, (_, i) => i < value.length), [value]);

  const press = (d: string) => { if (value.length < 6) setValue(value + d); };
  const del = () => setValue(value.slice(0, -1));
  const clear = () => setValue("");

  // Auto-advance ID -> PIN
  useEffect(() => {
    if (stage === "id_then_pin" && collectingId && empId.length === 6) setCollectingId(false);
  }, [empId, stage, collectingId]);

  // Auto-submit on 6-digit PIN
  useEffect(() => {
    if (activeIsId) return;
    if (pin.length !== 6) return;
    if (stage === "id_then_pin" && empId.length !== 6) return;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/pos/verify-employee-pin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pin,
          ...(stage === "id_then_pin" ? { employee_id: empId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token_hash?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        if (data.error === "MULTIPLE_MATCHES") {
          setStage("id_then_pin");
          setCollectingId(true);
          setPin("");
          setEmpId("");
          setError(data.message ?? "Enter your Employee ID first, then your PIN.");
          return;
        }
        setPin("");
        setError(data.error ?? "Sign-in failed. Please try again.");
        return;
      }
      if (!data.token_hash) {
        setError("Sign-in failed. Please try again.");
        setPin("");
        return;
      }
      const { error: otpErr } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink",
      });
      if (otpErr) {
        setError(otpErr.message);
        setPin("");
        return;
      }
      // Router listener in main.tsx handles navigation on SIGNED_IN.
    } catch (err) {
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
          <img src={logoAsset.url} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase" }}>SEZA</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>POS Terminal</div>
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
      {error && (
        <div style={styles.errorBox}>
          {error}
        </div>
      )}

      <div style={styles.footer}>
        Connected securely to sezapos.com · v1.0
      </div>
    </div>
  );
}

function PadBtn({
  children, onClick, disabled, ghost,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; ghost?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 68,
        borderRadius: 14,
        fontSize: 26,
        fontWeight: 600,
        background: ghost ? "transparent" : "#fff",
        border: ghost ? "0" : "1px solid #cbd5e1",
        color: ghost ? "#64748b" : "#0f172a",
        opacity: disabled ? 0.55 : 1,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {children}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    display: "flex",
    flexDirection: "column",
    padding: "max(env(safe-area-inset-top), 20px) 20px max(env(safe-area-inset-bottom), 20px)",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 4 },
  logoBadge: {
    width: 48, height: 48, borderRadius: 12, background: "#1e40af",
    display: "grid", placeItems: "center", boxShadow: "0 8px 24px rgba(30,64,175,.25)",
  },
  pad: {
    marginTop: 24,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
  },
  errorBox: {
    marginTop: 12,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    padding: "10px 12px",
    borderRadius: 10,
    fontSize: 13,
    textAlign: "center",
  },
  footer: { marginTop: "auto", paddingTop: 20, textAlign: "center", color: "#94a3b8", fontSize: 11 },
};
