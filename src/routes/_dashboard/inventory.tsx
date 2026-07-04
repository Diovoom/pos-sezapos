import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/pos/AppShell";

export const Route = createFileRoute("/_dashboard/inventory")({
  head: () => ({ meta: [{ title: "Inventory — SEZA POS" }, { name: "description", content: "Stock adjustments, transfers, purchase orders, and shrinkage reports." }] }),
  component: () => <PlaceholderPage title="Inventory" description="Stock adjustments, transfers, purchase orders, and shrinkage reports are coming next." />,
});
