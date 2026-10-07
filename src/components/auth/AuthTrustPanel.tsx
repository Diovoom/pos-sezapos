type AuthTrustPanelProps = {
  portal: "owner" | "admin" | "recovery";
  hostname?: string;
};

export function AuthTrustPanel({ portal, hostname }: AuthTrustPanelProps) {
  const expectedHost =
    hostname ?? (portal === "admin" ? "admin.sezapos.com" : "dashboard.sezapos.com");

  return (
    <p className="mt-4 text-center text-xs leading-5 text-muted-foreground" role="note">
      Official SEZA Technologies sign-in. Check that the address is {expectedHost}.
    </p>
  );
}
