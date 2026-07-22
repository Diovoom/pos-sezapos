import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_adminApp/admin/stores")({
  beforeLoad: () => {
    throw redirect({
      to: "/admin/businesses",
      search: {
        q: "",
        filter: "all",
        sortBy: "created_at",
        sortDir: "desc",
        page: 1,
        pageSize: 25,
      },
    });
  },
  component: () => null,
});
