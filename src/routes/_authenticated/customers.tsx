import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/pos/AppShell";

export const Route = createFileRoute("/_authenticated/customers")({
  component: () => <PlaceholderPage title="Customers" description="Customer CRM with purchase history, loyalty points, and rewards lands in the next iteration." />,
});
