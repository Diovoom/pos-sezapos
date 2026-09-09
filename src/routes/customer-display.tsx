import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
      { title: "Customer Display  -  SEZA POS" },
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

export function CustomerDisplayPage() {
  const [storeId, setStoreId] = useState<string | null>(() => requestedStoreId());
  const [sale, setSale] = useState<CustomerDisplayPayload>(() => {
    const local = readLocalCustomerDisplay();
    return storeId && local.storeId && local.storeId !== storeId
      ? emptyCustomerDisplayPayload(storeId)
      : local;
  });
  const [remoteConnected, setRemoteConnected] = useState(false);

  useEffect(() => {
    if (storeId) return;
    let cancelled = false;
    void supabase
      .from("stores")
      .select("id")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.id) return;
        try {
          localStorage.setItem("seza.customer-display.storeId", data.id);
        } catch {
          // Storage is optional.
        }
        setStoreId(data.id);
        setSale((current) => ({ ...current, storeId: data.id }));
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

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
    const unsubscribeRemote = subscribeCustomerDisplay(
      storeId,
      (payload) => {
        markDisplayConnected();
        accept(payload);
      },
      setRemoteConnected,
    );
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

  const awaitingCard = sale.phase === "awaiting_card";
  const completed = sale.phase === "complete";
  const processing = sale.phase === "processing";
  const declined = sale.phase === "declined";
  const cancelled = sale.phase === "cancelled";
  const isFresh = useMemo(() => {
    const updated = Date.parse(sale.updatedAt);
    return Number.isFinite(updated) && Date.now() - updated < 15_000;
  }, [sale.updatedAt, remoteConnected]);
  const connected = remoteConnected || isFresh;

  if (awaitingCard) {
    return (
      <main className="min-h-screen overflow-hidden bg-white text-slate-950 grid place-items-center">
        <div
          className="relative w-full"
          style={{
            width: "min(100vw, calc(100vh * 4 / 3))",
            aspectRatio: "4 / 3",
          }}
        >
          <img
            src="/images/seza-card-reader-payment-guide.png"
            alt="Tap, insert, or swipe your card on the card reader"
            className="absolute inset-0 size-full object-contain"
          />
          <div
            className="absolute left-1/2 top-[72%] -translate-x-1/2 text-center whitespace-nowrap"
            aria-live="polite"
          >
            <p className="text-lg md:text-2xl font-semibold text-slate-500">Total</p>
            <p className="mt-1 text-5xl md:text-7xl font-black tracking-tight text-slate-950">
              {fmtCurrency(sale.total, sale.currency)}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col p-8 md:p-12">
      <header className="flex items-center justify-between border-b border-white/15 pb-6">
        <div className="flex items-center gap-4">
          {sale.logoUrl ? (
            <img
              src={sale.logoUrl}
              alt=""
              className="size-14 md:size-20 rounded-xl bg-white object-contain p-1"
            />
          ) : null}
          <div>
            <h1 className="text-3xl md:text-5xl font-bold">{sale.storeName}</h1>
            <p className="mt-2 text-sm uppercase tracking-[0.22em] text-white/55">
              Customer display
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-emerald-300">
            {completed
              ? "Payment complete"
              : processing
                ? "Processing payment"
                : declined
                  ? "Payment declined"
                  : cancelled
                    ? "Sale cancelled"
                    : "Register ready"}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {connected ? "Connected to register" : "Waiting for register"}
          </p>
        </div>
      </header>

      <section className="flex-1 min-h-0 py-7 overflow-y-auto">
        {processing || declined || cancelled ? (
          <div className="h-full min-h-[320px] grid place-items-center text-center">
            <div>
              <div
                className={`mx-auto grid size-20 place-items-center rounded-full text-4xl ${
                  processing
                    ? "bg-blue-400/15 text-blue-300"
                    : declined
                      ? "bg-rose-400/15 text-rose-300"
                      : "bg-amber-400/15 text-amber-300"
                }`}
              >
                {processing ? "…" : declined ? "×" : "–"}
              </div>
              <p className="mt-6 text-4xl md:text-6xl font-black">
                {processing
                  ? "Processing payment"
                  : declined
                    ? "Payment declined"
                    : "Sale cancelled"}
              </p>
              <p className="mt-3 text-xl text-white/60">
                {sale.statusMessage ??
                  (processing
                    ? "Please wait and keep your card near the reader."
                    : declined
                      ? "Please try another payment method."
                      : "The register is ready for a new sale.")}
              </p>
              {processing ? (
                <p className="mt-6 text-4xl font-mono font-bold">
                  {fmtCurrency(sale.total, sale.currency)}
                </p>
              ) : null}
            </div>
          </div>
        ) : completed ? (
          <div className="h-full min-h-[320px] grid place-items-center text-center">
            <div>
              <div className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-400/15 text-4xl text-emerald-300">
                ✓
              </div>
              <p className="mt-6 text-4xl md:text-6xl font-black">Thank you!</p>
              <p className="mt-6 text-4xl font-mono font-bold">
                {fmtCurrency(sale.total, sale.currency)}
              </p>
              {sale.changeDue != null && sale.changeDue > 0 ? (
                <div className="mt-6 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-8 py-4">
                  <p className="text-sm uppercase tracking-[0.2em] text-emerald-200/70">
                    Change due
                  </p>
                  <p className="mt-1 text-4xl font-mono font-black text-emerald-200">
                    {fmtCurrency(sale.changeDue, sale.currency)}
                  </p>
                </div>
              ) : null}
              {sale.receiptNumber ? (
                <p className="mt-5 text-sm text-white/45">Receipt {sale.receiptNumber}</p>
              ) : null}
            </div>
          </div>
        ) : sale.lines.length === 0 ? (
          <div className="h-full min-h-[320px] grid place-items-center text-center">
            {sale.idleMode === "image" && sale.idleImageUrl ? (
              <img
                src={sale.idleImageUrl}
                alt=""
                className="max-h-[48vh] max-w-[46vw] rounded-3xl object-contain shadow-2xl"
              />
            ) : (
              <p
                className="max-w-[92vw] font-black leading-[1.05] tracking-tight break-words"
                style={{
                  fontSize: `${Math.round(64 * Math.min(1.8, Math.max(0.8, Number(sale.idleTextScale ?? 1))))}px`,
                }}
              >
                {sale.idleMessage?.trim() || "Welcome"}
              </p>
            )}
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

      {!completed && sale.lines.length > 0 && (
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
