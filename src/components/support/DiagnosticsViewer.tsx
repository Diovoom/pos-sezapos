import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";

type Props = {
  diagnostics: Record<string, unknown> | unknown;
};

/**
 * Renders a sanitized diagnostics blob (as sent by the merchant client) as a
 * collapsible section list, with a "Copy JSON" affordance for the support
 * agent to paste into a ticket note.
 */
export function DiagnosticsViewer({ diagnostics }: Props) {
  const d = (diagnostics ?? {}) as Record<string, unknown>;
  const sections = Object.entries(d);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Client diagnostics
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => {
            try {
              navigator.clipboard.writeText(JSON.stringify(d, null, 2));
              toast.success("Diagnostics copied");
            } catch {
              toast.error("Copy failed");
            }
          }}
        >
          <Copy className="h-3 w-3" />
          Copy JSON
        </Button>
      </div>
      {sections.length === 0 ? (
        <div className="text-xs text-muted-foreground">No diagnostics.</div>
      ) : (
        <div className="space-y-2">
          {sections.map(([key, value]) => (
            <Section key={key} name={key} value={value} />
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ name, value }: { name: string; value: unknown }) {
  const [open, setOpen] = useState(true);
  const isObj = value != null && typeof value === "object";
  return (
    <div className="rounded-md border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium hover:bg-muted/50"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="uppercase tracking-wide">{name}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 text-[11px] font-mono">
          {isObj ? (
            <KVGrid data={value as Record<string, unknown>} />
          ) : (
            <span className="text-foreground">{String(value)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function KVGrid({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 min-w-0">
      {Object.entries(data).map(([k, v]) => {
        const nested = v != null && typeof v === "object";
        return (
          <div key={k} className="contents">
            <div className="text-muted-foreground truncate">{k}</div>
            <div className="text-foreground break-all">
              {nested ? (
                <pre className="text-[10.5px] bg-background/60 rounded p-1 border overflow-x-auto">
                  {JSON.stringify(v, null, 2)}
                </pre>
              ) : (
                String(v ?? " - ")
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
