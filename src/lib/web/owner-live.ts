import type { QueryClient } from "@tanstack/react-query";

// Mounted only by the owner web layout. Native/offline synchronization is separate.
export function subscribeOwnerWebUpdates(client: any, queries: QueryClient, storeId: string) {
  let stopped = false;
  const invalidate = (keys: unknown[][]) => {
    if (stopped) return;
    for (const queryKey of keys) void queries.invalidateQueries({ queryKey });
  };
  const employees = () => invalidate([
    ["employees", storeId], ["employee"], ["employee-roles"],
    ["employee-plan-usage", storeId], ["billing-plan-usage"], ["me"],
  ]);
  const support = () => invalidate([
    ["my-support-tickets", storeId], ["owner-support-unread", storeId],
  ]);
  const catchUp = () => {
    employees();
    support();
    invalidate([["store", storeId], ["store-branding", storeId],
      ["owner-store-locations"], ["subscription", storeId], ["pos-devices", storeId]]);
  };
  const channel = client.channel(`owner-web:${storeId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `store_id=eq.${storeId}` }, employees)
    .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `store_id=eq.${storeId}` }, employees)
    .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `store_id=eq.${storeId}` }, support)
    .subscribe((status: string) => {
      // Postgres Changes does not replay events missed during a disconnect.
      if (status === "SUBSCRIBED") catchUp();
    });
  // user_roles is not in the live Realtime publication. Keep role/employee
  // changes current without altering the completed database configuration.
  const poll = window.setInterval(() => {
    if (document.visibilityState === "visible") employees();
  }, 30_000);
  window.addEventListener("focus", catchUp);
  return () => {
    stopped = true;
    window.clearInterval(poll);
    window.removeEventListener("focus", catchUp);
    void client.removeChannel(channel);
  };
}
