import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fmtCurrency } from "@/lib/format";

type DisplayLine = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

type DisplaySale = {
  type: "seza-pos-sale";
  storeName: string;
  currency: string;
  lines: DisplayLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  updatedAt: string;
};

const emptySale: DisplaySale = {
  type: "seza-pos-sale",
  storeName: "SEZA POS",
  currency: "USD",
  lines: [],
  subtotal: 0,
  discount: 0,
  tax: 0,
  total: 0,
  updatedAt: new Date(0).toISOString(),
};

export const Route = createFileRoute("/customer-display")({
  head: () => ({
    meta: [
      { title: "Customer Display — SEZA POS" },
      { name: "description", content: "Live customer-facing order display." },
    ],
  }),
  component: CustomerDisplayPage,
});

function readSavedSale(): DisplaySale {
  if (typeof window === "undefined") return emptySale;
  try {
    const raw = localStorage.getItem("seza.customer-display.sale");
    return raw ? (JSON.parse(raw) as DisplaySale) : emptySale;
  } catch {
    return emptySale;
  }
}

function CustomerDisplayPage() {
  const [sale, setSale] = useState<DisplaySale>(readSavedSale);

  useEffect(() => {
    const markDisplayConnected = () => {
      try {
        localStorage.setItem("pos.hw.display.status", "connected");
        localStorage.setItem("pos.hw.display.lastSeen", String(Date.now()));
      } catch { /* best-effort */ }
    };

    const refreshFromStorage = () => {
      const next = readSavedSale();
      setSale((current) =>
        current.updatedAt === next.updatedAt ? current : next,
      );
    };

    markDisplayConnected();
    refreshFromStorage();

    // Polling is intentional. Some Linux/Firefox multi-window setups do not
    // reliably deliver StorageEvent or BroadcastChannel messages between the
    // cashier window and the customer-facing window.
    const heartbeat = window.setInterval(markDisplayConnected, 2_000);
    const storagePoll = window.setInterval(refreshFromStorage, 500);

    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("seza-customer-display")
        : null;

    if (channel) {
      channel.onmessage = (event: MessageEvent<DisplaySale>) => {
        if (event.data?.type === "seza-pos-sale") {
          markDisplayConnected();
          setSale(event.data);
        }
      };
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === "seza.customer-display.sale") refreshFromStorage();
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
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshFromStorage);
      document.removeEventListener("visibilitychange", onVisible);
      try { localStorage.setItem("pos.hw.display.status", "disconnected"); } catch { /* ignore */ }
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col p-8 md:p-12">
      <header className="flex items-center justify-between border-b border-white/15 pb-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-bold">{sale.storeName}</h1>
          <p className="mt-2 text-sm uppercase tracking-[0.22em] text-white/55">Customer display</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-emerald-300">Register ready</p>
          <p className="mt-1 text-xs text-white/45">Prices update as items are scanned</p>
        </div>
      </header>

      <section className="flex-1 min-h-0 py-7 overflow-y-auto">
        {sale.lines.length === 0 ? (
          <div className="h-full min-h-[320px] grid place-items-center text-center">
            <div>
              <p className="text-3xl font-semibold">Welcome</p>
              <p className="mt-3 text-lg text-white/55">Your items will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sale.lines.map((line) => (
              <div key={line.id} className="grid grid-cols-[1fr_auto] gap-6 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-xl md:text-2xl font-semibold">{line.name}</p>
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

      <footer className="border-t border-white/15 pt-6">
        <div className="ml-auto max-w-xl space-y-2 text-lg">
          <MoneyRow label="Subtotal" value={fmtCurrency(sale.subtotal, sale.currency)} />
          {sale.discount > 0 && <MoneyRow label="Discount" value={`− ${fmtCurrency(sale.discount, sale.currency)}`} />}
          <MoneyRow label="Tax" value={fmtCurrency(sale.tax, sale.currency)} />
          <div className="mt-4 flex items-end justify-between border-t border-dashed border-white/25 pt-5">
            <span className="text-2xl md:text-3xl font-bold">Total</span>
            <span className="text-4xl md:text-6xl font-mono font-black tracking-tight">
              {fmtCurrency(sale.total, sale.currency)}
            </span>
          </div>
        </div>
      </footer>
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
