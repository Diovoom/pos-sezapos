import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/pos/AppShell";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — SEZA POS" }, { name: "description", content: "Customer CRM with purchase history, loyalty points, and rewards for your SEZA POS store." }] }),
  component: () => <PlaceholderPage title="Customers" description="Customer CRM with purchase history, loyalty points, and rewards lands in the next iteration." />,
});
