import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { adminListCompanyEmployees } from "@/lib/admin/company-admin.functions";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, ShieldCheck, BriefcaseBusiness, Headphones, Clock3 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_adminApp/admin/employees")({
  head: () => ({
    meta: [
      { title: "SEZA Employees — SEZA Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EmployeesPage,
});

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "S"
  );
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    super_admin: "Founder access",
    operations_admin: "Operations admin",
    support_admin: "Support admin",
    billing_admin: "Billing admin",
    analyst: "Analyst",
  };
  return labels[role] ?? role.replaceAll("_", " ");
}

function EmployeesPage() {
  const load = useServerFn(adminListCompanyEmployees);
  const { data: permissions } = useAdminPermissions();
  const { data, isLoading } = useQuery({
    queryKey: ["admin_company_employees"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((row: any) => {
      const matchesSearch =
        !term ||
        [row.full_name, row.email, row.title, row.department, ...(row.roles ?? [])].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(term),
        );
      const matchesDepartment = department === "all" || row.department === department;
      return matchesSearch && matchesDepartment;
    });
  }, [data?.rows, search, department]);

  const departments = Array.from(
    new Set((data?.rows ?? []).map((row: any) => row.department).filter(Boolean)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SEZA Employees</h1>
          <p className="text-sm text-muted-foreground">
            Company employees who work for SEZA. Merchant store cashiers and managers are not shown
            here.
          </p>
        </div>
        {permissions?.isFounder && (
          <Button asChild variant="outline">
            <Link to="/admin/team">Manage staff access</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{data?.rows.length ?? 0}</div>
            <div className="text-xs text-muted-foreground">Company staff</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {(data?.rows ?? []).filter((r: any) => r.employment_status === "active").length}
            </div>
            <div className="text-xs text-muted-foreground">Active employees</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {(data?.rows ?? []).reduce(
                (sum: number, r: any) => sum + Number(r.active_cases ?? 0),
                0,
              )}
            </div>
            <div className="text-xs text-muted-foreground">Assigned active cases</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company directory</CardTitle>
          <CardDescription>
            Titles, departments, platform roles, workload, and recent activity.
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative min-w-[240px] flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SEZA employees…"
              />
            </div>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="all">All departments</option>
              {departments.map((value) => (
                <option key={String(value)} value={String(value)}>
                  {String(value)}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-sm text-muted-foreground">Loading SEZA employees…</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No company employees match your filters.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map((employee: any) => (
                <div key={employee.id} className="rounded-xl border p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={employee.avatar_url ?? undefined} />
                      <AvatarFallback>{initials(employee.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold">{employee.full_name}</div>
                        {employee.is_founder && (
                          <Badge className="gap-1">
                            <ShieldCheck className="h-3 w-3" /> Founder & CEO
                          </Badge>
                        )}
                        <Badge
                          variant={
                            employee.employment_status === "active" ? "outline" : "secondary"
                          }
                        >
                          {employee.employment_status}
                        </Badge>
                      </div>
                      <div className="truncate text-sm text-muted-foreground">{employee.email}</div>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                        <div className="flex items-center gap-1.5">
                          <BriefcaseBusiness className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                          {employee.title || "Title not set"} · {employee.department}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Headphones className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                          {employee.active_cases} active case
                          {employee.active_cases === 1 ? "" : "s"}
                        </div>
                        <div className="flex items-center gap-1.5 sm:col-span-2">
                          <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                          {employee.last_activity_at
                            ? `${employee.last_action} · ${formatDistanceToNow(new Date(employee.last_activity_at), { addSuffix: true })}`
                            : "No recorded admin activity"}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {(employee.roles ?? []).map((role: string) => (
                          <Badge key={role} variant="secondary">
                            {roleLabel(role)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
