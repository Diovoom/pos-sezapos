import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { SEZA_LOGO_URL } from "../logo";

type Step = { id: string; label: string };
const STEPS: Step[] = [
  { id: "connect", label: "Connecting..." },
  { id: "session", label: "Verifying session..." },
  { id: "store", label: "Loading store branding..." },
  { id: "products", label: "Syncing products..." },
  { id: "register", label: "Loading register..." },
  { id: "permissions", label: "Loading permissions..." },
  { id: "ready", label: "Ready" },
];

export function BrandedBootScreen({
  onReady,
}: {
  onReady: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [logo, setLogo] = useState<string>(SEZA_LOGO_URL);
  const [storeName, setStoreName] = useState<string>("SEZA POS");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const bump = async (i: number, work?: () => Promise<void>) => {
        if (cancelled) return;
        setStepIndex(i);
        if (work) {
          try {
            await Promise.race([
              work(),
              new Promise<never>((_, reject) =>
                window.setTimeout(() => reject(new Error("Boot step timed out")), 3_000),
              ),
            ]);
          } catch {
            // A stale connection must not trap the register on the boot screen.
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 180));
      };

      await bump(0);
      await bump(1, async () => { await supabase.auth.getSession(); });
      await bump(2, async () => {
        const { data } = await supabase.from("stores").select("name, logo_url").limit(1).maybeSingle();
        if (cancelled) return;
        if (data?.logo_url) setLogo(data.logo_url);
        if (data?.name) setStoreName(data.name);
      });
      await bump(3, async () => { await supabase.from("products").select("id").limit(1); });
      await bump(4, async () => { await supabase.from("register_sessions").select("id").limit(1); });
      await bump(5, async () => { await supabase.from("user_roles").select("role").limit(1); });
      await bump(6);
      if (!cancelled) onReady();
    })();

    return () => { cancelled = true; };
  }, [onReady]);

  const step = STEPS[stepIndex] ?? STEPS[STEPS.length - 1];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

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
      <div style={{ color: "rgba(255,255,255,.9)", fontSize: 13, minHeight: 18 }}>
        {step.label}
      </div>
      <div
        style={{
          width: "min(260px, 70%)", height: 4, background: "rgba(255,255,255,.2)",
          borderRadius: 999, overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`, height: "100%", background: "#fff",
            transition: "width 220ms ease",
          }}
        />
      </div>
      <div style={{ color: "rgba(255,255,255,.7)", fontSize: 11 }}>Loading POS...</div>
    </div>
  );
}
