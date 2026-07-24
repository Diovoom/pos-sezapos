import { Component, type ErrorInfo, type ReactNode } from "react";
import { SEZA_LOGO_URL } from "../logo";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppLoadBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[SEZA Android] application failed to load", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "#eff6ff",
          display: "grid",
          placeItems: "center",
          padding: 24,
          color: "#0f172a",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          style={{
            width: "min(440px, 100%)",
            borderRadius: 20,
            background: "#fff",
            padding: 24,
            boxShadow: "0 18px 60px rgba(15, 23, 42, .16)",
            textAlign: "center",
          }}
        >
          <img
            src={SEZA_LOGO_URL}
            alt="SEZA POS"
            width={88}
            height={88}
            style={{ objectFit: "contain" }}
          />
          <h1 style={{ margin: "14px 0 6px", fontSize: 22 }}>
            SEZA POS could not start
          </h1>
          <p style={{ margin: 0, color: "#475569", lineHeight: 1.55 }}>
            The app files loaded, but one part of the POS failed during startup.
            Check the internet connection, then try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              marginTop: 20,
              border: 0,
              borderRadius: 12,
              padding: "12px 16px",
              background: "#1e40af",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            Reload POS
          </button>
          <details style={{ marginTop: 16, textAlign: "left", color: "#64748b" }}>
            <summary style={{ cursor: "pointer", fontSize: 12 }}>
              Technical details
            </summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: 11,
                marginTop: 8,
              }}
            >
              {this.state.error.message || "Unknown startup error"}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
