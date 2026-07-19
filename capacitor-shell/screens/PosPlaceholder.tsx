import type { Session } from "@supabase/supabase-js";
import logoAsset from "@/assets/seza-logo.png.asset.json";
import { supabase } from "../supabase";

export function PosPlaceholder({ session }: { session: Session }) {
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src={logoAsset.url} alt="" style={{ width: 36, height: 36 }} />
        <div style={{ display: "grid" }}>
          <span style={{ fontWeight: 700 }}>SEZA POS</span>
          <span style={{ fontSize: 12, color: "#64748b" }}>{session.user.email}</span>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "1px solid #cbd5e1",
            color: "#334155",
            padding: "8px 12px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Sign out
        </button>
      </div>

      <div
        style={{
          marginTop: 40,
          padding: 20,
          borderRadius: 16,
          background: "#fff",
          border: "1px solid #e2e8f0",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Register</h1>
        <p style={{ marginTop: 8, color: "#475569", fontSize: 14, lineHeight: 1.5 }}>
          You're signed in with a bundled Capacitor build. The register UI,
          product catalog, cart, and checkout are ported into this shell in
          the next phase. This screen confirms:
        </p>
        <ul style={{ marginTop: 12, paddingLeft: 20, color: "#475569", fontSize: 14, lineHeight: 1.6 }}>
          <li>App loads instantly from local assets (no remote HTML fetch).</li>
          <li>Supabase auth is working with a bearer-token session.</li>
          <li>RLS-scoped reads/writes run directly against the backend.</li>
          <li>Ready to layer IndexedDB offline queueing on top.</li>
        </ul>
      </div>
    </div>
  );
}
