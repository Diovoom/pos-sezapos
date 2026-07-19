import { useEffect, useState } from "react";
import logoAsset from "@/assets/seza-logo.png.asset.json";
import { isNativeMode } from "@/lib/native";

/**
 * Full-screen branded loading overlay shown ONLY inside the Capacitor
 * Android shell. Covers the WebView through hydration and the first paint
 * of the destination route (auth or POS), then fades out. Also hides the
 * native Android splash screen once mounted so there's no white flash
 * between the two.
 */
export function NativeLoadingOverlay() {
  const [native, setNative] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!isNativeMode()) return;
    setNative(true);

    // Hide the Android SplashScreen the instant the overlay is mounted so
    // the transition is overlay -> overlay (no white gap).
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.SplashScreen?.hide) {
          await cap.Plugins.SplashScreen.hide({ fadeOutDuration: 300 });
        }
      } catch {
        /* noop */
      }
    })();

    // Give the destination route two paint cycles + a short buffer to
    // render its shell, then fade the overlay away.
    const t1 = window.setTimeout(() => setFading(true), 650);
    const t2 = window.setTimeout(() => setHidden(true), 1050);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (!native || hidden) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "#1e40af",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        opacity: fading ? 0 : 1,
        transition: "opacity 380ms ease",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: "#fff",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
        }}
      >
        <img
          src={logoAsset.url}
          alt=""
          draggable={false}
          style={{ width: 104, height: 104, objectFit: "contain" }}
        />
      </div>
      <div
        style={{
          color: "#fff",
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: 0.5,
        }}
      >
        SEZA POS
      </div>
      <div
        style={{
          width: 28,
          height: 28,
          border: "3px solid rgba(255,255,255,0.28)",
          borderTopColor: "#fff",
          borderRadius: "50%",
          animation: "seza-spin 0.9s linear infinite",
        }}
      />
      <style>{`@keyframes seza-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
