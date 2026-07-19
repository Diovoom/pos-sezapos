import { useState, type FormEvent } from "react";
import logoAsset from "@/assets/seza-logo.png.asset.json";
import { supabase } from "../supabase";

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
        display: "flex",
        flexDirection: "column",
        padding: "max(env(safe-area-inset-top), 24px) 24px 24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <img src={logoAsset.url} alt="" style={{ width: 40, height: 40 }} />
        <span style={{ fontWeight: 700, fontSize: 18 }}>SEZA POS</span>
      </div>

      <div style={{ marginTop: 48 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Sign in</h1>
        <p style={{ marginTop: 8, color: "#475569", fontSize: 15 }}>
          Enter your employee credentials to open the register.
        </p>
      </div>

      <form onSubmit={submit} style={{ marginTop: 32, display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 8,
            background: "#1e40af",
            color: "#fff",
            border: 0,
            borderRadius: 12,
            padding: "16px",
            fontSize: 16,
            fontWeight: 600,
            opacity: busy ? 0.7 : 1,
            minHeight: 52,
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div style={{ marginTop: "auto", color: "#94a3b8", fontSize: 12, textAlign: "center", paddingTop: 32 }}>
        Bundled build · connects securely to sezapos.com
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "14px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  fontSize: 16,
  color: "#0f172a",
  outline: "none",
  minHeight: 52,
  WebkitAppearance: "none",
};
