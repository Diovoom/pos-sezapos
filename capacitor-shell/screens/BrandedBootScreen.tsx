import { useEffect, useState } from "react";
import { SEZA_LOGO_URL } from "../logo";
import { readMeta } from "@/lib/offline/db";

export function BrandedBootScreen({ onReady }: { onReady: () => void }) {
  const [logo, setLogo] = useState<string>(SEZA_LOGO_URL);
  const [storeName, setStoreName] = useState<string>("SEZA POS");

  useEffect(() => {
    let cancelled = false;

    // Boot from local device state only. Network sync is never allowed to hold
    // the cashier behind a splash screen. POS queries refresh in the background.
    void readMeta<any>("store")
      .then((store) => {
        if (cancelled || !store) return;
        if (store.logo_url) setLogo(String(store.logo_url));
        if (store.name) setStoreName(String(store.name));
      })
      .catch(() => {});

    const timer = window.setTimeout(() => {
      if (!cancelled) onReady();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [onReady]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#1e40af",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 20, padding: 24,
      }}
    >
      <div
        style={{
          width: 132, height: 132, borderRadius: "50%", background: "#fff",
          display: "grid", placeItems: "center", boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          overflow: "hidden",
        }}
      >
        <img src={logo} alt="" style={{ width: 96, height: 96, objectFit: "contain" }} />
      </div>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 22, letterSpacing: 0.5 }}>
        {storeName}
      </div>
      <div style={{ color: "rgba(255,255,255,.9)", fontSize: 13 }}>Opening register…</div>
      <div style={{ width: "min(260px, 70%)", height: 4, background: "rgba(255,255,255,.2)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: "100%", height: "100%", background: "#fff" }} />
      </div>
    </div>
  );
}
