import type { ReactNode } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminFounderTeam,
  adminInviteCompanyStaff,
  adminUpdateCompanyStaff,
  adminDeactivateCompanyStaff,
} from "@/lib/admin/company-admin.functions";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShieldCheck, UserPlus, Pencil, UserX, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminApp/admin/team")({
  beforeLoad: async () => {
    const { data: userResult, error } = await supabaseAdminAuth.auth.getUser();
    const user = userResult.user;
    if (error || !user || user.email?.toLowerCase() !== "admin@sezapos.com") {
      throw redirect({ to: "/admin" });
    }
    const { data: roles } = await supabaseAdminAuth
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (!(roles ?? []).some((row) => row.role === "super_admin")) {
      throw redirect({ to: "/admin" });
    }
  },
  head: () => ({
    meta: [
      { title: "Admin Team  -  SEZA Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminTeamPage,
});

const ROLE_OPTIONS = [
  { value: "operations_admin", label: "Operations Admin" },
  { value: "support_admin", label: "Support Admin" },
  { value: "billing_admin", label: "Billing Admin" },
  { value: "analyst", label: "Analyst" },
];

type EditState = {
  id: string;
  isFounder: boolean;
  fullName: string;
  role: string;
  title: string;
  department: string;
  employmentStatus: "invited" | "active" | "inactive";
  phone: string;
};

function AdminTeamPage() {
  const { data: permissions, isLoading: permissionLoading } = useAdminPermissions();
  const load = useServerFn(adminFounderTeam);
  const invite = useServerFn(adminInviteCompanyStaff);
  const update = useServerFn(adminUpdateCompanyStaff);
  const deactivate = useServerFn(adminDeactivateCompanyStaff);
  const qc = useQueryClient();

  const teamQuery = useQuery({
    queryKey: ["admin_founder_team"],
    queryFn: () => load(),
    enabled: permissions?.isFounder === true,
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    fullName: "",
    role: "support_admin",
    title: "Support Specialist",
    department: "Support",
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin_founder_team"] });
    qc.invalidateQueries({ queryKey: ["admin_company_employees"] });
  };

  async function sendInvite() {
    setBusy(true);
    try {
      await invite({ data: inviteForm });
      toast.success("SEZA staff invitation sent");
      setInviteOpen(false);
      setInviteForm({
        email: "",
        fullName: "",
        role: "support_admin",
        title: "Support Specialist",
        department: "Support",
      });
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not invite staff member");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    if (reason.trim().length < 4) {
      toast.error("Enter a reason for the audit trail");
      return;
    }
    setBusy(true);
    try {
      await update({
        data: {
          userId: edit.id,
          fullName: edit.fullName,
          role: edit.isFounder ? undefined : edit.role,
          title: edit.isFounder ? "Founder & CEO" : edit.title,
          department: edit.isFounder ? "Executive" : edit.department,
          employmentStatus: edit.isFounder ? "active" : edit.employmentStatus,
          phone: edit.phone,
          reason,
        },
      });
      toast.success("Staff access updated");
      setEdit(null);
      setReason("");
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update staff member");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    if (reason.trim().length < 4) {
      toast.error("Enter a reason for the audit trail");
      return;
    }
    setBusy(true);
    try {
      await deactivate({ data: { userId: deactivateTarget.id, reason } });
      toast.success("Staff access deactivated");
      setDeactivateTarget(null);
      setReason("");
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not deactivate staff member");
    } finally {
      setBusy(false);
    }
  }

  if (permissionLoading)
    return <div className="text-sm text-muted-foreground">Checking founder access…</div>;

  if (!permissions?.isFounder) {
    return (
      <Card className="max-w-2xl border-amber-400">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5" /> Founder-only area
          </CardTitle>
          <CardDescription>
            Admin Team access management is visible only to admin@sezapos.com, the SEZA Founder &
            CEO.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rows = teamQuery.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Admin Team</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Founder-only control of everyone who can access SEZA company operations.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" /> Invite employee
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 text-sm">
          <strong>Owner:</strong> admin@sezapos.com · <strong>Title:</strong> Founder & CEO. Only
          this account can invite staff, change company roles, or deactivate Admin access.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company access roster</CardTitle>
          <CardDescription>
            Platform roles are completely separate from merchant store roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {teamQuery.isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading company team…</div>
          ) : teamQuery.isError ? (
            <div className="p-8">
              <div className="text-sm text-destructive">
                {(teamQuery.error as any)?.message ?? "Could not load company team"}
              </div>
              <Button className="mt-3" variant="outline" onClick={() => teamQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Title / department</th>
                  <th className="p-3">Access role</th>
                  <th className="p-3">Employment</th>
                  <th className="p-3">Active cases</th>
                  <th className="p-3">Last activity</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((person: any) => (
                  <tr key={person.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{person.full_name}</div>
                      <div className="text-xs text-muted-foreground">{person.email}</div>
                      {person.is_founder && <Badge className="mt-1">Founder & CEO</Badge>}
                    </td>
                    <td className="p-3">
                      <div>{person.title || "Not set"}</div>
                      <div className="text-xs text-muted-foreground">{person.department}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {person.roles.map((role: string) => (
                          <Badge key={role} variant="outline">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={person.employment_status === "active" ? "default" : "secondary"}
                      >
                        {person.employment_status}
                      </Badge>
                    </td>
                    <td className="p-3">{person.active_cases}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {person.last_activity_at
                        ? new Date(person.last_activity_at).toLocaleString()
                        : " - "}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEdit({
                            id: person.id,
                            isFounder: Boolean(person.is_founder),
                            fullName: person.full_name ?? "",
                            role: person.is_founder
                              ? "super_admin"
                              : (person.roles.find((role: string) => role !== "super_admin") ??
                                "support_admin"),
                            title: person.is_founder ? "Founder & CEO" : (person.title ?? ""),
                            department: person.is_founder
                              ? "Executive"
                              : (person.department ?? "Operations"),
                            employmentStatus: person.is_founder
                              ? "active"
                              : (person.employment_status ?? "active"),
                            phone: person.phone ?? "",
                          });
                          setReason("");
                        }}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />{" "}
                        {person.is_founder ? "Edit my profile" : "Edit"}
                      </Button>
                      {!person.is_founder && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="ml-2"
                          onClick={() => {
                            setDeactivateTarget(person);
                            setReason("");
                          }}
                        >
                          <UserX className="mr-1 h-3.5 w-3.5" /> Deactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a SEZA employee</DialogTitle>
            <DialogDescription>
              Sends an Admin invitation and assigns a company role. This is not a merchant employee
              account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Full name">
              <Input
                value={inviteForm.fullName}
                onChange={(e) => setInviteForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </Field>
            <Field label="Company email">
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Job title">
              <Input
                value={inviteForm.title}
                onChange={(e) => setInviteForm((f) => ({ ...f, title: e.target.value }))}
              />
            </Field>
            <Field label="Department">
              <Input
                value={inviteForm.department}
                onChange={(e) => setInviteForm((f) => ({ ...f, department: e.target.value }))}
              />
            </Field>
            <Field label="Admin role">
              <Select
                value={inviteForm.role}
                onValueChange={(role) => setInviteForm((f) => ({ ...f, role }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !inviteForm.email || !inviteForm.fullName}
              onClick={sendInvite}
            >
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit company employee</DialogTitle>
            <DialogDescription>
              Every change is server-authorized and written to the Admin audit log.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <Field label="Full name">
                <Input
                  value={edit.fullName}
                  onChange={(e) => setEdit({ ...edit, fullName: e.target.value })}
                />
              </Field>
              <Field label="Job title">
                <Input
                  disabled={edit.isFounder}
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                />
              </Field>
              <Field label="Department">
                <Input
                  disabled={edit.isFounder}
                  value={edit.department}
                  onChange={(e) => setEdit({ ...edit, department: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={edit.phone}
                  onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                />
              </Field>
              <Field label="Admin role">
                <Select
                  disabled={edit.isFounder}
                  value={edit.role}
                  onValueChange={(role) => setEdit({ ...edit, role })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Employment status">
                <Select
                  disabled={edit.isFounder}
                  value={edit.employmentStatus}
                  onValueChange={(value) =>
                    setEdit({ ...edit, employmentStatus: value as EditState["employmentStatus"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invited">Invited</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Reason for change">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={saveEdit}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Admin access?</DialogTitle>
            <DialogDescription>
              This removes all SEZA company roles and bans new sessions for{" "}
              {deactivateTarget?.email}. It does not delete audit history.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Employment ended, access no longer required…"
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={confirmDeactivate}>
              Deactivate access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
