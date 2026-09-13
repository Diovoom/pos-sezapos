import { createFileRoute } from "@tanstack/react-router";
import { StripeSiteLinkPage } from "@/components/settings/StripeSiteLinkPage";
import type { StripeEmbeddedView } from "@/lib/stripe-connect.functions";

const VALID_VIEWS = new Set<StripeEmbeddedView>([
  "account-management",
  "notification-banner",
  "payments",
  "payouts",
  "balances",
  "documents",
]);

export const Route = createFileRoute("/_dashboard/stripe-connect")({
  validateSearch: (search: Record<string, unknown>) => {
    const requested = String(search.view || "account-management") as StripeEmbeddedView;
    return {
      view: VALID_VIEWS.has(requested) ? requested : ("account-management" as StripeEmbeddedView),
      stripe_account_id:
        typeof search.stripe_account_id === "string" ? search.stripe_account_id : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Stripe account tools - SEZA POS" },
      {
        name: "description",
        content: "Secure Stripe account tools for SEZA POS merchants.",
      },
    ],
  }),
  component: StripeConnectRoute,
});

function StripeConnectRoute() {
  const { view } = Route.useSearch();
  return <StripeSiteLinkPage view={view} />;
}
