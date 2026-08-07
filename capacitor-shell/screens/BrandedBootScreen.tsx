import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { SEZA_LOGO_URL } from "../logo";
import { readMeta } from "@/lib/offline/db";

type Step = { id: string; label: string };
const STEPS: Step[] = [
  { id: "session", label: "Loading employee…" },
  { id: "store", label: "Loading store…" },
  { id: "register", label: "Loading register…" },
  { id: "ready", label: "Ready" },
];

export function BrandedBootScreen({ onReady }: { onReady: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [logo, setLogo] = useState<string>(SEZA_LOGO_URL);
  const [storeName, setStoreName] = useState<string>("SEZA POS");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user || cancelled) {
        if (!cancelled) onReady();
        return;
      }

      setStepIndex(0);
      const cachedMe = await readMeta<any>(`authenticated_me:${user.id}`).catch(() => undefined);
      if (cachedMe?.store?.name) setStoreName(cachedMe.store.name);
      if (cachedMe?.store?.logo_url) setLogo(cachedMe.store.logo_url);
      await pause(180);

      setStepIndex(1);
      // Fetch only THIS employee's store. Never use `stores.limit(1)` on a
      // shared POS because that can flash another merchant's branding.
      try {
        const profile = cachedMe?.profile ?? (
          await supabase.from("profiles").select("store_id").eq("id", user.id).maybeSingle()
        ).data;
        const storeId = profile?.store_id;
        if (storeId) {
          const cachedStore = await readMeta<any>(`store:${storeId}`).catch(() => undefined);
          if (cachedStore?.name) setStoreName(cachedStore.name);
          if (cachedStore?.logo_url) setLogo(cachedStore.logo_url);
          const onlineStore = await Promise.race([
            supabase.from("stores").select("name,logo_url").eq("id", storeId).maybeSingle(),
            new Promise<any>((resolve) => window.setTimeout(() => resolve({ data: null }), 1400)),
          ]);
          if (!cancelled && onlineStore?.data?.name) setStoreName(onlineStore.data.name);
          if (!cancelled && onlineStore?.data?.logo_url) setLogo(onlineStore.data.logo_url);
        }
      } catch {
        // Cached branding is enough to start the local register.
      }
      await pause(220);

      setStepIndex(2);
      // The register itself is local-first; do not block startup on product,
      // shift, or permission cloud calls. Those hydrate behind this screen.
      await pause(520);
      setStepIndex(3);
      await pause(220);
      if (!cancelled) onReady();
    })();

    return () => { cancelled = true; };
  }, [onReady]);

  const step = STEPS[stepIndex] ?? STEPS[STEPS.length - 1];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2147483000, background: "#1e40af",
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
          width: "min(320px, 72%)", height: 7, background: "rgba(255,255,255,.2)",
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
      <div style={{ color: "rgba(255,255,255,.7)", fontSize: 11 }}>Loading POS…</div>
    </div>
  );
}
