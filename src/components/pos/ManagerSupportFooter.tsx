import { LifeBuoy, Phone } from "lucide-react";
import { LEGAL_CONFIG } from "@/lib/legal/config";

export function ManagerSupportFooter() {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <LifeBuoy className="size-4 text-primary" />
        <span>Need help? SEZA Support</span>
      </div>
      <a
        href={`tel:${LEGAL_CONFIG.phone}`}
        className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-primary"
      >
        <Phone className="size-4" />
        {LEGAL_CONFIG.phoneDisplay}
      </a>
    </div>
  );
}
