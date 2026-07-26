import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { fmtCurrency } from "@/lib/format";
import {
  customerDisplayLocalChannel,
  customerDisplayStorageKey,
  emptyCustomerDisplayPayload,
  readLocalCustomerDisplay,
  subscribeCustomerDisplay,
  type CustomerDisplayPayload,
} from "@/lib/pos/customer-display-sync";

export const Route = createFileRoute("/customer-display")({
  head: () => ({
    meta: [
      { title: "Customer Display — SEZA POS" },
      { name: "description", content: "Live customer-facing order display." },
    ],
  }),
  component: CustomerDisplayPage,
});

function requestedStoreId() {
  if (typeof window === "undefined") return null;
  const queryStore = new URL(window.location.href).searchParams.get("store");
  if (queryStore) return queryStore;
  try {
    return localStorage.getItem("seza.customer-display.storeId");
  } catch {
    return null;
  }
}

function CustomerDisplayPage() {
  const storeId = useMemo(requestedStoreId, []);
  const [sale, setSale] = useState<CustomerDisplayPayload>(() => {
    const local = readLocalCustomerDisplay();
    return storeId && local.storeId && local.storeId !== storeId
      ? emptyCustomerDisplayPayload(storeId)
      : local;
  });
  const [remoteConnected, setRemoteConnected] = useState(false);

  useEffect(() => {
    const accept = (next: CustomerDisplayPayload) => {
      if (storeId && next.storeId && next.storeId !== storeId) return;
      setSale((current) => (current.updatedAt === next.updatedAt ? current : next));
    };
    const refreshFromStorage = () => accept(readLocalCustomerDisplay());
    const markDisplayConnected = () => {
      try {
        localStorage.setItem("pos.hw.display.status", "connected");
        localStorage.setItem("pos.hw.display.lastSeen", String(Date.now()));
        window.dispatchEvent(new Event("seza-hardware-status"));
      } catch {
        // best effort
      }
    };

    markDisplayConnected();
    refreshFromStorage();
    const heartbeat = window.setInterval(markDisplayConnected, 2_000);
    const storagePoll = window.setInterval(refreshFromStorage, 500);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(customerDisplayLocalChannel)
        : null;
    if (channel) {
      channel.onmessage = (event: MessageEvent<CustomerDisplayPayload>) => {
        if (event.data?.type === "seza-pos-display") accept(event.data);
      };
    }
    const unsubscribeRemote = subscribeCustomerDisplay(storeId, (payload) => {
      setRemoteConnected(true);
      markDisplayConnected();
      accept(payload);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === customerDisplayStorageKey) refreshFromStorage();
    };
    const onVisible = () => {
      if (!document.hidden) refreshFromStorage();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshFromStorage);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(storagePoll);
      channel?.close();
      unsubscribeRemote();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshFromStorage);
      document.removeEventListener("visibilitychange", onVisible);
      try {
        localStorage.setItem("pos.hw.display.status", "disconnected");
      } catch {
        // ignore
      }
    };
  }, [storeId]);

  const completed = sale.phase === "complete";
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col p-8 md:p-12">
      <header className="flex items-center justify-between border-b border-white/15 pb-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-bold">{sale.storeName}</h1>
          <p className="mt-2 text-sm uppercase tracking-[0.22em] text-white/55">Customer display</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-emerald-300">
            {completed ? "Payment complete" : "Register ready"}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {storeId
              ? remoteConnected
                ? "Connected to register"
                : "Waiting for register updates"
              : "Same-device display mode"}
          </p>
        </div>
      </header>

      <section className="flex-1 min-h-0 py-7 overflow-y-auto">
        {completed ? (
          <div className="h-full min-h-[320px] grid place-items-center text-center">
            <div>
              <div className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-400/15 text-4xl text-emerald-300">
                ✓
              </div>
              <p className="mt-6 text-4xl md:text-6xl font-black">Thank you!</p>
              <p className="mt-3 text-xl text-white/60">Payment approved</p>
              <p className="mt-6 text-4xl font-mono font-bold">
                {fmtCurrency(sale.total, sale.currency)}
              </p>
            </div>
          </div>
        ) : sale.lines.length === 0 ? (
          <div className="h-full min-h-[320px] grid place-items-center text-center">
            <div>
              <p className="text-3xl font-semibold">Welcome</p>
              <p className="mt-3 text-lg text-white/55">Your items will appear here.</p>
              {storeId ? null : (
                <p className="mt-5 max-w-md text-sm text-amber-200/70">
                  For an Android register on another device, open this page with
                  <span className="font-mono"> ?store=STORE_ID</span>.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sale.lines.map((line) => (
              <div
                key={line.id}
                className="grid grid-cols-[1fr_auto] gap-6 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="break-words text-xl md:text-2xl font-semibold">{line.name}</p>
                  <p className="mt-1 text-sm md:text-base text-white/55">
                    {line.qty} × {fmtCurrency(line.unitPrice, sale.currency)}
                  </p>
                </div>
                <p className="self-center text-xl md:text-2xl font-mono font-bold">
                  {fmtCurrency(line.lineTotal, sale.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {!completed && (
        <footer className="border-t border-white/15 pt-6">
          <div className="ml-auto max-w-xl space-y-2 text-lg">
            <MoneyRow label="Subtotal" value={fmtCurrency(sale.subtotal, sale.currency)} />
            {sale.discount > 0 && (
              <MoneyRow label="Discount" value={`− ${fmtCurrency(sale.discount, sale.currency)}`} />
            )}
            <MoneyRow label="Tax" value={fmtCurrency(sale.tax, sale.currency)} />
            <div className="mt-4 flex items-end justify-between border-t border-dashed border-white/25 pt-5">
              <span className="text-2xl md:text-3xl font-bold">Total</span>
              <span className="text-4xl md:text-6xl font-mono font-black tracking-tight">
                {fmtCurrency(sale.total, sale.currency)}
              </span>
            </div>
          </div>
        </footer>
      )}
    </main>
  );
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-8 text-white/70">
      <span>{label}</span>
      <span className="font-mono text-white">{value}</span>
    </div>
  );
}
