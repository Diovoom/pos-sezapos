import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/refund")({
  beforeLoad: () => {
    throw redirect({ to: "/refund" });
  },
});
