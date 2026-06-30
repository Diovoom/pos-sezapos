import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/pos/AppShell";

export const Route = createFileRoute("/_authenticated/inventory")({
  component: () => <PlaceholderPage title="Inventory" description="Stock adjustments, transfers, purchase orders, and shrinkage reports are coming next." />,
});
