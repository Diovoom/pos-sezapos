import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Construction } from "lucide-react";
import { useAdminPermissions } from "@/lib/admin/permissions";

export const Route = createFileRoute("/_adminApp/admin/platform-health")({
  head: () => ({
    meta: [
      { title: "SEZA Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PlaceholderPage,
});

function PlaceholderPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["businesses.view", "diagnostics.view", "billing.view", "incidents.view", "admin_users.view", "audit.view"]) ?? false;
  if (perms && !canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Not authorized</h1>
        <p className="text-sm text-muted-foreground">Your admin role does not include access to this section.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight capitalize">platform health</h1>
        <p className="text-sm text-muted-foreground">Coming in the next SEZA Platform Admin phase.</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-amber-600" />
            <CardTitle>Under construction</CardTitle>
          </div>
          <CardDescription>
            This surface is reserved for the next implementation phase. Existing production data is not affected.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The Businesses, Support, Devices, Subscriptions, Audit Logs, and Settings surfaces remain fully operational.
        </CardContent>
      </Card>
    </div>
  );
}
