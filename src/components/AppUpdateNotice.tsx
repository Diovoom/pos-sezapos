import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEZA_APP_UPDATE_EVENT, type SezaVersionManifest } from "@/lib/app-update";

export function AppUpdateNotice() {
  const [manifest, setManifest] = useState<SezaVersionManifest | null>(null);
  useEffect(() => {
    const listener = (event: Event) =>
      setManifest((event as CustomEvent<SezaVersionManifest>).detail);
    window.addEventListener(SEZA_APP_UPDATE_EVENT, listener);
    return () => window.removeEventListener(SEZA_APP_UPDATE_EVENT, listener);
  }, []);
  if (!manifest) return null;
  return (
    <div className="fixed inset-x-3 top-[max(env(safe-area-inset-top),.75rem)] z-[2147483646] rounded-2xl border border-blue-300 bg-white p-4 shadow-2xl dark:border-blue-400/30 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
          <Download className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">SEZA POS {manifest.version} is available</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {manifest.releaseNotes?.slice(0, 2).join(" · ") ||
              "Performance, security and register improvements."}
          </p>
          <Button
            className="mt-3"
            size="sm"
            onClick={() => window.open(manifest.updateUrl, "_blank", "noopener,noreferrer")}
          >
            Update app
          </Button>
        </div>
        {!manifest.mandatory && (
          <button
            aria-label="Dismiss update"
            onClick={() => setManifest(null)}
            className="grid size-8 place-items-center rounded-lg hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
