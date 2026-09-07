// APK-only Pending Offline Sales screen.
//
// Shows every unsynced offline sale (pending / syncing / failed / needs
// attention / conflict), lets an authorized user retry sync, view the
// provisional receipt, and open a Support ticket prefilled with safe
// diagnostics for a specific record.
//
// This screen is intentionally read-only for financial values — offline
// sales are finalized on the device the moment the cashier confirms
// payment; the queue only reports server-sync state.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  LifeBuoy,
  Receipt,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useOnline, useSyncEvents } from "@/lib/offline/useOnline";
import { pendingCounts, syncNow } from "@/lib/offline/sync";
import {
  getAllOfflineSales,
  readMeta,
  type OfflineSale,
  type OfflineSaleStatus,
  type StoreSwitchConflict,
} from "@/lib/offline/db";

const STATUS_META: Record<OfflineSaleStatus, { label: string; tone: string; Icon: typeof Clock }> = {
  pending: { label: "Pending", tone: "bg-amber-500/10 text-amber-700 border-amber-500/30", Icon: Clock },
  syncing: { label: "Syncing", tone: "bg-primary/10 text-primary border-primary/30", Icon: RefreshCw },
  synced: { label: "Synced", tone: "bg-success/10 text-success border-success/30", Icon: CheckCircle2 },
  failed: { label: "Retry scheduled", tone: "bg-amber-500/10 text-amber-700 border-amber-500/30", Icon: RefreshCw },
  conflict: { label: "Conflict", tone: "bg-destructive/10 text-destructive border-destructive/30", Icon: AlertTriangle },
  needs_attention: { label: "Needs attention", tone: "bg-destructive/10 text-destructive border-destructive/30", Icon: AlertTriangle },
};

function safeErrorLabel(code?: string | null, message?: string | null): string {
  if (!code && !message) return "—";
  // Redact anything that looks like it could leak sensitive detail; prefer
  // the coarse code + short human message.
  const short = (message ?? "").slice(0, 120);
  return code ? `${code} · ${short}` : short;
}

export function PendingSyncScreen() {
  const navigate = useNavigate();
  const online = useOnline();
  const evt = useSyncEvents();
  const [sales, setSales] = useState<OfflineSale[]>([]);
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof pendingCounts>> | null>(null);
  const [storeConflict, setStoreConflict] = useState<StoreSwitchConflict | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [all, c, conflict] = await Promise.all([
        getAllOfflineSales(),
        pendingCounts(),
        readMeta<StoreSwitchConflict | null>("store_switch_conflict"),
      ]);
      setSales(all.slice().reverse()); // newest first for the operator view
      setCounts(c);
      setStoreConflict(conflict ?? null);
    } catch { /* IDB unavailable */ }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => { void refresh(); }, [evt, online]);

  const doRetry = async () => {
    setBusy(true);
    try { await syncNow(); } finally { setBusy(false); void refresh(); }
  };

  const grouped = useMemo(() => {
    const unsynced = sales.filter((s) => s.status !== "synced");
    const synced = sales.filter((s) => s.status === "synced");
    return { unsynced, synced };
  }, [sales]);

  const supportForRecord = (s: OfflineSale) => {
    // Prefill the Support Center's draft — do NOT auto-submit.
    const draft = {
      subject: `Offline sale needs attention · #${s.local_seq}`,
      category: "billing",
      priority: "high",
      body:
        `An offline sale needs help synchronizing.\n\n` +
        `Sale reference: #${s.local_seq}\n` +
        `Status: ${s.status}\n` +
        `Attempts: ${s.attempts}\n` +
        `Last attempt: ${s.last_attempt_at ?? "—"}\n` +
        `Created: ${s.local_created_at}\n`,
      includeDiag: true,
    };
    try { localStorage.setItem("seza.support.draft.v1", JSON.stringify(draft)); } catch { /* noop */ }
    navigate({ to: "/support" });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex items-center gap-2 px-3 py-2 border-b">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/pos" })}>
          <ChevronLeft className="size-4" />
        </Button>
        <h1 className="text-base font-semibold flex-1">Pending offline sales</h1>
        <Button size="sm" disabled={!online || busy} onClick={doRetry}>
          <RefreshCw className={cn("size-4 mr-1.5", busy && "animate-spin")} />
          Retry sync
        </Button>
      </header>

      <div className="px-3 py-2 border-b bg-surface/40 flex flex-wrap gap-1.5 text-xs">
        <StatChip label="Unsynced" value={counts?.unsyncedSales ?? 0} tone="amber" />
        <StatChip label="Needs attention" value={counts?.needsAttentionSales ?? 0} tone="destructive" />
        <StatChip label="Cash queue" value={(counts?.pendingCash ?? 0) + (counts?.needsAttentionCash ?? 0)} tone="amber" />
        <StatChip label="Actions" value={(counts?.pendingActions ?? 0) + (counts?.needsAttentionActions ?? 0)} tone="amber" />
        <StatChip label="Synced" value={counts?.syncedSales ?? 0} tone="success" />
        <div className="ml-auto self-center text-muted-foreground">
          Last sync: {counts?.lastSync ? new Date(counts.lastSync).toLocaleTimeString() : "—"}
        </div>
      </div>

      {storeConflict && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Store reassignment blocked</p>
            <p className="mt-0.5">
              {storeConflict.preservedUnsyncedRecords} financial record{storeConflict.preservedUnsyncedRecords === 1 ? "" : "s"} from the previous store must be synchronized or recovered before this terminal can process sales for another store.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                const draft = {
                  subject: "Terminal store reassignment blocked",
                  category: "device",
                  priority: "urgent",
                  body: `This register cannot switch stores because ${storeConflict.preservedUnsyncedRecords} pending record${storeConflict.preservedUnsyncedRecords === 1 ? "" : "s"} still need attention.`,
                  includeDiag: true,
                };
                try { localStorage.setItem("seza.support.draft.v1", JSON.stringify(draft)); } catch { /* noop */ }
                navigate({ to: "/support" });
              }}
            >
              <LifeBuoy className="size-4 mr-1.5" />Contact support
            </Button>
          </div>
        </div>
      )}

      {!online && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
          <WifiOff className="size-4 mt-0.5" />
          <div>
            You are offline. Cash sales continue to save on this register and will
            synchronize automatically when the internet returns.
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <Section title="Unsynced" empty="No pending offline sales — everything is up to date.">
          {grouped.unsynced.map((s) => (
            <RecordCard key={s.id} sale={s} onSupport={() => supportForRecord(s)} />
          ))}
        </Section>

        {grouped.synced.length > 0 && (
          <Section title="Synced recently" empty="">
            {grouped.synced.slice(0, 20).map((s) => (
              <RecordCard key={s.id} sale={s} onSupport={() => supportForRecord(s)} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const items = arr.filter(Boolean);
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">{title}</div>
      {items.length === 0 ? (
        empty && <div className="text-sm text-muted-foreground py-4 text-center">{empty}</div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: "amber" | "destructive" | "success" }) {
  const cls =
    tone === "amber" ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
    : tone === "destructive" ? "bg-destructive/10 text-destructive border-destructive/30"
    : "bg-success/10 text-success border-success/30";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium", cls)}>
      {label} <span className="font-mono">{value}</span>
    </span>
  );
}

function RecordCard({ sale, onSupport }: { sale: OfflineSale; onSupport: () => void }) {
  const meta = STATUS_META[sale.status];
  const Icon = meta.Icon;
  const nextRetry = sale.next_retry_at ? new Date(sale.next_retry_at) : null;
  const nextRetryLabel =
    nextRetry && nextRetry.getTime() > Date.now()
      ? `Next retry ${nextRetry.toLocaleTimeString()}`
      : null;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">#{sale.local_seq}</span>
            <Badge variant="outline" className={cn("gap-1", meta.tone)}>
              <Icon className={cn("size-3", sale.status === "syncing" && "animate-spin")} />
              {meta.label}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {new Date(sale.local_created_at).toLocaleString()}
          </div>
          <div className="mt-1 text-sm">
            {sale.items.length} item{sale.items.length === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold">
              {sale.total.toFixed(2)} {sale.currency}
            </span>{" "}
            · cash
          </div>
          {sale.server_receipt_number != null && (
            <div className="mt-1 flex items-center gap-1 text-xs text-success">
              <Receipt className="size-3" />
              Server receipt #{sale.server_receipt_number}
            </div>
          )}
          {(sale.status === "failed" || sale.status === "needs_attention" || sale.status === "conflict") && (
            <div className="mt-1.5 text-xs">
              <span className="text-muted-foreground">Attempts: {sale.attempts}</span>
              {sale.last_error && (
                <div className="text-destructive break-words">
                  {safeErrorLabel(sale.last_error_code, sale.last_error)}
                </div>
              )}
              {nextRetryLabel && <div className="text-muted-foreground">{nextRetryLabel}</div>}
            </div>
          )}
        </div>
      </div>

      {(sale.status === "needs_attention" || sale.status === "conflict" || sale.status === "failed") && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={onSupport}>
            <LifeBuoy className="size-4 mr-1.5" />
            Contact support
          </Button>
        </div>
      )}
    </div>
  );
}
