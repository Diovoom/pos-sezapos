import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { isNativeMode } from "@/lib/native";

export function NativeConnectionBanner() {
  const [native, setNative] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!isNativeMode()) return;
    setNative(true);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!native || online) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-[2147483000] rounded-2xl border border-amber-300/40 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
          <WifiOff className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">SEZA is offline</p>
          <p className="text-xs text-white/65">
            Cash sales remain available and will sync automatically when the connection returns.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-semibold hover:bg-white/10"
        >
          <RefreshCw className="size-4" />
          Retry
        </button>
      </div>
    </div>
  );
}
