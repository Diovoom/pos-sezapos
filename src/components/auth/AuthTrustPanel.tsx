import { ShieldCheck } from "lucide-react";
import { marketingUrl } from "@/lib/host";

type AuthTrustPanelProps = {
  portal: "owner" | "admin" | "recovery";
  hostname?: string;
};

const PORTAL_LABEL: Record<AuthTrustPanelProps["portal"], string> = {
  owner: "owner portal",
  admin: "platform administration portal",
  recovery: "password recovery portal",
};

export function AuthTrustPanel({ portal, hostname }: AuthTrustPanelProps) {
  const expectedHost =
    hostname ?? (portal === "admin" ? "admin.sezapos.com" : "dashboard.sezapos.com");

  return (
    <div
      className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-muted-foreground"
      role="note"
      aria-label="Official SEZA portal verification"
    >
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <div className="font-semibold text-foreground">
            Official SEZA Technologies Inc. {PORTAL_LABEL[portal]}
          </div>
          <p className="mt-1 leading-5">
            Verify the address bar shows <span className="font-medium text-foreground">{expectedHost}</span>
            {" "}before entering SEZA credentials. SEZA account pages only use <span className="font-medium text-foreground">sezapos.com</span> domains.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <a className="font-medium text-primary hover:underline" href={marketingUrl("/")}>SEZA home</a>
            <a className="font-medium text-primary hover:underline" href={marketingUrl("/security")}>Security</a>
            <a className="font-medium text-primary hover:underline" href={marketingUrl("/legal/privacy")}>Privacy</a>
            <a className="font-medium text-primary hover:underline" href={marketingUrl("/legal/terms")}>Terms</a>
            <a className="font-medium text-primary hover:underline" href={marketingUrl("/support")}>Support</a>
          </div>
        </div>
      </div>
    </div>
  );
}
