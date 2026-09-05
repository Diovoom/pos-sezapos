import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { SEZA_LOGO_URL } from "../logo";
import { loadCachedProducts, readMeta } from "@/lib/offline/db";

type Step = { id: string; label: string };
const STEPS: Step[] = [
  { id: "session", label: "Loading employee…" },
  { id: "store", label: "Loading store…" },
  { id: "clock", label: "Loading clock & register…" },
  { id: "catalog", label: "Loading products & categories…" },
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

      // The first visible register frame must already know this employee's
      // local clock/register state. Never let a late cloud response decide
      // whether the cashier appears clocked in after the screen is shown.
      setStepIndex(2);
      const storeId = cachedMe?.profile?.store_id ?? cachedMe?.store?.id ?? null;
      await Promise.all([
        readMeta(`timeclock_open:${user.id}`).catch(() => undefined),
        readMeta(`open_register_session:${user.id}`).catch(() => undefined),
        readMeta(`register_history:${user.id}`).catch(() => undefined),
      ]);

      // Products/categories are local-first too. Reading them here makes the
      // branded loader a real readiness boundary rather than a timed splash.
      setStepIndex(3);
      await Promise.all([
        loadCachedProducts().catch(() => []),
        storeId ? readMeta(`categories:${storeId}`).catch(() => []) : Promise.resolve([]),
        storeId ? readMeta(`cart_draft:${storeId}:${user.id}`).catch(() => []) : Promise.resolve([]),
      ]);

      setStepIndex(4);
      await pause(120);
      if (!cancelled) onReady();
    })();

    return () => { cancelled = true; };
  }, [onReady]);

  const step = STEPS[stepIndex] ?? STEPS[STEPS.length - 1];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2147483000, background: "#ffffff",
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
      <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 22, letterSpacing: 0.5 }}>
        {storeName}
      </div>
      <div style={{ color: "#475569", fontSize: 13, minHeight: 18 }}>
        {step.label}
      </div>
      <div
        style={{
          width: "min(320px, 72%)", height: 7, background: "#e2e8f0",
          borderRadius: 999, overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`, height: "100%", background: "#2563eb",
            transition: "width 220ms ease",
          }}
        />
      </div>
      <div style={{ color: "#64748b", fontSize: 11 }}>Loading POS…</div>
    </div>
  );
}
