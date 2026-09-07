import { useState } from "react";

type Props = {
  error: unknown;
};

function diagnosticCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "unknown");
  let hash = 2166136261;
  for (let index = 0; index < message.length; index += 1) {
    hash ^= message.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `BOOT-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function BootFailureScreen({ error }: Props) {
  const [copied, setCopied] = useState(false);
  const code = diagnosticCode(error);

  const copyDiagnostics = async () => {
    const details = [
      "SEZA POS startup failure",
      `Code: ${code}`,
      `Time: ${new Date().toISOString()}`,
      `Online: ${typeof navigator === "undefined" ? "unknown" : navigator.onLine}`,
      `Platform: ${typeof navigator === "undefined" ? "unknown" : navigator.userAgent}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main
      role="alert"
      style={{
        minHeight: "100%",
        background: "#1e40af",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <section
        style={{
          width: "min(440px, 100%)",
          background: "#ffffff",
          borderRadius: 18,
          padding: 24,
          boxShadow: "0 24px 80px rgba(0, 0, 0, .28)",
          color: "#0f172a",
        }}
      >
        <div style={{ fontSize: 42, lineHeight: 1 }} aria-hidden="true">!</div>
        <h1 style={{ margin: "14px 0 8px", fontSize: 24 }}>SEZA POS could not start</h1>
        <p style={{ margin: 0, color: "#475569", lineHeight: 1.55 }}>
          The app stopped during startup instead of opening a blank screen. Check the internet
          connection, then try again. If it continues, send the support code to SEZA Support.
        </p>
        <div
          style={{
            marginTop: 18,
            padding: "12px 14px",
            borderRadius: 10,
            background: "#f1f5f9",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13,
          }}
        >
          {code}
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 0,
              borderRadius: 10,
              background: "#1e40af",
              color: "white",
              minHeight: 46,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={copyDiagnostics}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              background: "white",
              color: "#0f172a",
              minHeight: 46,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {copied ? "Support info copied" : "Copy support info"}
          </button>
        </div>
      </section>
    </main>
  );
}
