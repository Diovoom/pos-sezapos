import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnline, useSyncEvents } from "@/lib/offline/useOnline";
import { pendingCounts, syncNow, installAutoSync } from "@/lib/offline/sync";
import { getAllOfflineSales, type OfflineSale } from "@/lib/offline/db";

export function OfflineIndicator() {
  const online = useOnline();
  const evt = useSyncEvents();
  const [counts, setCounts] = useState<{
    pendingSales: number;
    syncedSales: number;
    failedSales: number;
    pendingCash: number;
    lastSync: string | null;
  }>({
    pendingSales: 0,
    syncedSales: 0,
    failedSales: 0,
    pendingCash: 0,
    lastSync: null,
  });
  const [sales, setSales] = useState<OfflineSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [cloudReachable, setCloudReachable] = useState<boolean | null>(null);
  const [lastCloudCheck, setLastCloudCheck] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setCounts(await pendingCounts());
      setSales(await getAllOfflineSales());
    } catch {
      /* IDB unavailable in SSR */
    }
  };

  useEffect(() => {
    installAutoSync();
    void refresh();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkCloud = async () => {
      if (!online) {
        if (!cancelled) setCloudReachable(false);
        return;
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6_000);
      try {
        const response = await fetch(`/api/public/health?ts=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = response.ok ? await response.json().catch(() => null) : null;
        if (!cancelled) {
          setCloudReachable(Boolean(response.ok && body?.status === "operational"));
          setLastCloudCheck(new Date().toISOString());
        }
      } catch {
        if (!cancelled) {
          setCloudReachable(false);
          setLastCloudCheck(new Date().toISOString());
        }
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void checkCloud();
    const timer = window.setInterval(checkCloud, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [online]);
  useEffect(() => {
    void refresh();
  }, [evt, online]);

  const state: "offline" | "syncing" | "issue" | "online" = !online
    ? "offline"
    : cloudReachable === false
      ? "issue"
      : syncing || evt?.type === "start" || evt?.type === "progress"
        ? "syncing"
        : counts.failedSales > 0
          ? "issue"
          : "online";

  const label =
    state === "offline"
      ? "Offline"
      : state === "syncing"
        ? "Syncing"
        : state === "issue"
          ? "Sync issue"
          : "Online";

  const Icon =
    state === "offline"
      ? WifiOff
      : state === "syncing"
        ? RefreshCw
        : state === "issue"
          ? AlertTriangle
          : Wifi;

  const color =
    state === "offline"
      ? "text-red-600 bg-white border-slate-200"
      : state === "syncing"
        ? "text-primary bg-white border-slate-200"
        : state === "issue"
          ? "text-red-600 bg-white border-slate-200"
          : "text-emerald-600 bg-white border-slate-200";

  const pending = counts.pendingSales + counts.pendingCash;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex size-10 items-center justify-center rounded-full border shadow-sm transition",
            color,
          )}
          aria-label={`Connection: ${label}`}
        >
          <span
            className={cn(
              "absolute ml-5 -mt-5 size-2.5 rounded-full ring-2 ring-white",
              state === "online"
                ? "bg-emerald-500"
                : state === "offline"
                  ? "bg-amber-400"
                  : "bg-red-500",
            )}
          />
          <Icon
            className={cn(
              "size-5",
              state === "syncing" && "animate-spin",
              state === "offline" && "text-red-600",
            )}
          />
          {pending > 0 && <span className="sr-only">{pending} pending records</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Icon className={cn("size-4", state === "syncing" && "animate-spin")} />
            <span className="font-semibold">{label}</span>
          </div>
          {state === "offline" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Offline mode - cash sales will be saved on this register and synced when connection
              returns.
            </p>
          )}
          {state === "issue" && (
            <p className="mt-2 text-xs text-destructive">
              {cloudReachable === false
                ? "The device has a network connection, but SEZA Cloud did not answer the health check."
                : `${counts.failedSales} record${counts.failedSales === 1 ? "" : "s"} could not sync. Retry below.`}
            </p>
          )}
        </div>
        <div className="p-4 space-y-2 text-sm">
          <Row label="Network" value={online ? "Connected" : "Disconnected"} />
          <Row
            label="SEZA Cloud"
            value={cloudReachable === null ? "Checking" : cloudReachable ? "Reachable" : "Unavailable"}
          />
          <Row
            label="Cloud checked"
            value={lastCloudCheck ? new Date(lastCloudCheck).toLocaleTimeString() : " - "}
          />
          <Row label="Pending sales" value={counts.pendingSales} />
          <Row label="Pending cash movements" value={counts.pendingCash} />
          <Row label="Failed records" value={counts.failedSales} />
          <Row
            label="Last sync"
            value={counts.lastSync ? new Date(counts.lastSync).toLocaleTimeString() : " - "}
          />
        </div>
        {sales.length > 0 && (
          <div className="border-t max-h-48 overflow-auto">
            {sales
              .slice(-10)
              .reverse()
              .map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-4 py-2 text-xs border-b last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="font-mono truncate">
                      Pending receipt · {new Date(s.local_created_at).toLocaleTimeString()}
                    </div>
                    <div className="text-muted-foreground">
                      {s.total.toFixed(2)} {s.currency}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              ))}
          </div>
        )}
        <div className="p-3 border-t bg-surface/40">
          <Button
            size="sm"
            className="w-full"
            disabled={!online || syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                await syncNow();
              } finally {
                setSyncing(false);
                void refresh();
              }
            }}
          >
            <RefreshCw className={cn("size-4 mr-2", syncing && "animate-spin")} />
            Retry sync
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: OfflineSale["status"] }) {
  const map: Record<OfflineSale["status"], { c: string; Icon: typeof RefreshCw }> = {
    pending: { c: "bg-amber-500/10 text-amber-700", Icon: RefreshCw },
    syncing: { c: "bg-primary/10 text-primary", Icon: RefreshCw },
    synced: { c: "bg-success/10 text-success", Icon: CheckCircle2 },
    failed: { c: "bg-destructive/10 text-destructive", Icon: AlertTriangle },
    conflict: { c: "bg-destructive/10 text-destructive", Icon: AlertTriangle },
    needs_attention: { c: "bg-destructive/10 text-destructive", Icon: AlertTriangle },
  };
  const { c, Icon } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        c,
      )}
    >
      <Icon className={cn("size-3", status === "syncing" && "animate-spin")} />
      {status}
    </span>
  );
}
