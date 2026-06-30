import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/pos/AppShell";

export const Route = createFileRoute("/_authenticated/reports")({
  component: () => <PlaceholderPage title="Reports" description="Sales, profit, tax, employee, and cash reports with PDF/CSV export." />,
});
