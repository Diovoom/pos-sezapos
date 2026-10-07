import { marketingUrl } from "@/lib/host";

type AuthTrustPanelProps = {
  portal: "owner" | "admin" | "recovery";
  hostname?: string;
};

const PORTAL_LABEL: Record<AuthTrustPanelProps["portal"], string> = {
  owner: "Owner sign in",
  admin: "Admin sign in",
  recovery: "Password recovery",
};

export function AuthTrustPanel({ portal, hostname }: AuthTrustPanelProps) {
  const expectedHost =
    hostname ?? (portal === "admin" ? "admin.sezapos.com" : "dashboard.sezapos.com");

  return (
    <div
      className="mt-4 text-center text-xs leading-5 text-muted-foreground"
      role="note"
      aria-label="SEZA portal verification"
    >
      <p>
        {PORTAL_LABEL[portal]} · Make sure the address is{" "}
        <span className="font-medium text-foreground">{expectedHost}</span>.
      </p>
      <p className="mt-1">
        <a className="text-primary hover:underline" href={marketingUrl("/")}>Home</a>
        <span aria-hidden="true"> · </span>
        <a className="text-primary hover:underline" href={marketingUrl("/security")}>Security</a>
        <span aria-hidden="true"> · </span>
        <a className="text-primary hover:underline" href={marketingUrl("/support")}>Support</a>
      </p>
    </div>
  );
}
