import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Minimize2, Maximize2, Copy, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { adminEndSupportSession } from "@/lib/admin/admin.functions";
import { DiagnosticsViewer } from "@/components/support/DiagnosticsViewer";

type Props = {
  sessionId: string;
  startedAt: string | null;
  expiresAt: string | null;
  businessName: string | undefined | null;
  storeCode: string | undefined | null;
  employeeName: string | undefined | null;
  metadata: Record<string, unknown> | null;
  onClosed: () => void;
};

/**
 * Admin-side diagnostics-only support panel. Used for accepted sessions
 * where the merchant client cannot stream its screen (bundled Android APK).
 * Displays the sanitized client_metadata snapshot the merchant sent at
 * accept-time, plus session context and countdown. Read-only.
 */
export function AdminDiagnosticsPanel({
  sessionId,
  startedAt,
  expiresAt,
  businessName,
  storeCode,
  employeeName,
  metadata,
  onClosed,
}: Props) {
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [duration, setDuration] = useState("00:00");
  const [remaining, setRemaining] = useState("--:--");
  const endServerFn = useServerFn(adminEndSupportSession);
  const qc = useQueryClient();

  useEffect(() => {
    const tick = () => {
      if (startedAt) {
        const s = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
        setDuration(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
      }
      if (expiresAt) {
        const r = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
        setRemaining(`${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`);
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt, expiresAt]);

  async function closeAndEnd() {
    try {
      await endServerFn({ data: { sessionId } });
      toast.success("Support session ended");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to end session";
      toast.error(msg);
    } finally {
      qc.invalidateQueries({ queryKey: ["admin_support_session_active"] });
      onClosed();
    }
  }

  return (
    <div
      className={cn(
        "fixed z-40 rounded-lg border bg-background shadow-2xl overflow-hidden flex flex-col",
        expanded ? "inset-4" : "bottom-4 right-4 w-[520px] max-w-[calc(100vw-2rem)]",
        minimized && !expanded && "w-64",
      )}
    >
      <div className="px-3 py-2 border-b flex items-center gap-2 bg-muted/40">
        <div className="flex items-center gap-1.5 text-xs">
          <Smartphone className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium">Android diagnostics session</span>
        </div>
        <div className="ml-2 hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
          <span className="truncate">
            <span className="uppercase tracking-wide mr-1">Biz</span>
            <span className="text-foreground font-medium">{businessName ?? "—"}</span>
          </span>
          <span className="truncate">
            <span className="uppercase tracking-wide mr-1">Store</span>
            <span className="font-mono text-foreground">{storeCode ?? "—"}</span>
          </span>
          <span className="truncate">
            <span className="uppercase tracking-wide mr-1">Emp</span>
            <span className="text-foreground">{employeeName ?? "—"}</span>
          </span>
          <span className="font-mono text-foreground" title="Elapsed">{duration}</span>
          <span className="font-mono text-foreground" title="Time remaining">{remaining}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMinimized((m) => !m)} aria-label="Minimize">
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded((e) => !e)} aria-label="Expand">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeAndEnd} aria-label="End session">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!minimized || expanded ? (
        <div className={cn("overflow-y-auto p-3", expanded ? "max-h-[calc(100vh-8rem)]" : "max-h-[60vh]")}>
          <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-200">
            Live screen viewing is not available for the Android APK in this version.
            You can still help using the diagnostics and account context below.
          </div>
          {metadata ? (
            <DiagnosticsViewer diagnostics={metadata} />
          ) : (
            <div className="text-xs text-muted-foreground">
              No client diagnostics were shared for this session.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
