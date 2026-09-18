import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  updateEmployee,
  setEmployeeCode,
  regenerateEmployeeCode,
  adminResetPin,
  resetEmployeeCredentials,
  setEmployeeStatus,
  deleteEmployee,
  forceLogoutEmployee,
  updateEmployeePay,
  adjustTimeEntry,
} from "@/lib/employees.functions";
import { useMe } from "@/hooks/useMe";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtCurrency } from "@/lib/format";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  RotateCcw,
  Loader2,
  Camera,
  KeyRound,
  RefreshCw,
  Trash2,
  Ban,
  Check,
  Save,
  Copy,
  ShieldAlert,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";

export const Route = createFileRoute("/_dashboard/employees/$id")({
  head: () => ({
    meta: [
      { title: "Employee  -  SEZA POS" },
      {
        name: "description",
        content: "Manage employee profile, role, PIN, hourly wage, and time clock activity.",
      },
    ],
  }),
  component: EmployeeProfile,
});

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  employee_id: string | null;
  status: string;
  hire_date: string | null;
  photo_url: string | null;
  pin_hash: string | null;
  must_change_pin?: boolean;
  must_change_password?: boolean;
  created_at: string;
};

const sb = supabase as any;

function EmployeeProfile() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const me = useMe();
  const navigate = useNavigate();
  const isOwner = me.data?.roles.includes("owner");
  const isAdmin = me.data?.roles.includes("admin");
  const isManager = me.data?.roles.includes("manager");
  const canManage = isOwner || isAdmin;
  const canEditStaff = isOwner || isAdmin || isManager;
  const isSelf = me.data?.user.id === id;

  const profileQ = useQuery<Profile | null, Error>({
    queryKey: ["employee", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Profile) ?? null;
    },
  });

  const rolesQ = useQuery<string[]>({
    queryKey: ["employee-roles", id],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", id);
      return (data ?? []).map((r) => r.role as string);
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["employee", id] });
    qc.invalidateQueries({ queryKey: ["employee-roles", id] });
    qc.invalidateQueries({ queryKey: ["employees"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  };

  if (profileQ.isLoading) {
    return (
      <>
        <PageHeader title="Employee" />
        <div className="p-6">
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin inline mr-2" />
              Loading employee…
            </CardContent>
          </Card>
        </div>
      </>
    );
  }
  if (profileQ.error) {
    return (
      <>
        <PageHeader title="Employee" />
        <div className="p-6">
          <Card>
            <CardContent className="p-10 text-center text-sm text-destructive">
              {userFacingError(profileQ.error, "Could not load this employee. Please try again.")}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }
  if (!profileQ.data) {
    return (
      <>
        <PageHeader title="Employee not found" />
        <div className="p-6">
          <Card>
            <CardContent className="p-10 text-center space-y-3">
              <ShieldAlert className="size-8 text-destructive mx-auto" />
              <p className="text-sm">
                No employee found with that ID, or you don't have permission to view them.
              </p>
              <Button asChild variant="outline">
                <Link to="/employees">
                  <ArrowLeft className="size-4 mr-2" />
                  Back to employees
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const profile = profileQ.data;
  const roles = rolesQ.data ?? [];
  const currentRole = (roles[0] ?? "cashier") as "owner" | "manager" | "cashier" | "admin";
  const displayName =
    profile.full_name ||
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
    profile.email ||
    " - ";

  return (
    <>
      <PageHeader
        title={displayName}
        subtitle={`Employee · ${profile.employee_id ?? " - "} · ${currentRole}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/employees">
              <ArrowLeft className="size-4 mr-2" />
              All employees
            </Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <ProfileCard
            profile={profile}
            roles={roles}
            canManage={!!canManage}
            onChanged={invalidateAll}
          />

          <div className="md:col-span-2 space-y-4 min-w-0">
            <StatsRow userId={id} />
            <Tabs defaultValue="details">
              <TabsList className="grid grid-cols-5 w-full max-w-2xl h-auto">
                <TabsTrigger value="details" className="text-xs sm:text-sm py-2">
                  Details
                </TabsTrigger>
                <TabsTrigger value="attendance" className="text-xs sm:text-sm py-2">
                  Attend.
                </TabsTrigger>
                <TabsTrigger value="sales" className="text-xs sm:text-sm py-2">
                  Sales
                </TabsTrigger>
                <TabsTrigger value="refunds" className="text-xs sm:text-sm py-2">
                  Refunds
                </TabsTrigger>
                <TabsTrigger value="activity" className="text-xs sm:text-sm py-2">
                  Activity
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                {canEditStaff ? (
                  <EditDetailsCard
                    profile={profile}
                    currentRole={currentRole}
                    isSelf={!!isSelf}
                    isOwner={!!isOwner}
                    canChangeRole={!!canManage}
                    onChanged={invalidateAll}
                  />
                ) : (
                  <ReadOnlyDetails profile={profile} role={currentRole} />
                )}
                {canEditStaff && (
                  <>
                    <EmployeeIdCard profile={profile} onChanged={invalidateAll} />
                    <PinCard profile={profile} onChanged={invalidateAll} />
                    <PayScheduleCard userId={profile.id} />
                  </>
                )}
                {canEditStaff && (
                  <DangerZoneCard
                    profile={profile}
                    isSelf={!!isSelf}
                    isOwner={!!isOwner}
                    onChanged={invalidateAll}
                    onDeleted={() => navigate({ to: "/employees" })}
                  />
                )}
                {!canEditStaff && !isSelf && (
                  <Card>
                    <CardContent className="p-6 text-sm text-muted-foreground">
                      You can only view basic information for other employees.
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="attendance">
                <AttendanceList userId={id} />
              </TabsContent>
              <TabsContent value="sales">
                <SalesList userId={id} />
              </TabsContent>
              <TabsContent value="refunds">
                <RefundsList userId={id} />
              </TabsContent>
              <TabsContent value="activity">
                <ActivityLog userId={id} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Sidebar card ---------------------------- */

function ProfileCard({
  profile,
  roles,
  canManage,
  onChanged,
}: {
  profile: Profile;
  roles: string[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const update = useServerFn(updateEmployee);

  const uploadPhoto = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo must be under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      const url = signed?.signedUrl;
      if (!url) throw new Error("Could not sign avatar URL");
      await update({ data: { user_id: profile.id, photo_url: url } });
      toast.success("Photo updated");
      onChanged();
    } catch (e) {
      toast.error(userFacingError(e, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="md:col-span-1">
      <CardContent className="p-6 text-center space-y-3">
        <div className="relative mx-auto w-24 h-24">
          <div className="size-24 rounded-full bg-muted grid place-items-center text-3xl font-bold overflow-hidden">
            {profile.photo_url ? (
              <img src={profile.photo_url} alt="" className="size-24 rounded-full object-cover" />
            ) : (
              (profile.first_name?.[0] ?? profile.email?.[0] ?? "?").toUpperCase()
            )}
          </div>
          {canManage && (
            <label className="absolute -bottom-1 -right-1 size-8 rounded-full bg-primary text-primary-foreground grid place-items-center cursor-pointer shadow">
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPhoto(f);
                }}
              />
            </label>
          )}
        </div>
        <div>
          <div className="font-semibold">{profile.full_name || profile.email}</div>
          <div className="text-xs text-muted-foreground font-mono">
            ID {profile.employee_id ?? " - "}
          </div>
        </div>
        <div className="flex justify-center gap-2 flex-wrap">
          <Badge variant={profile.status === "active" ? "default" : "secondary"}>
            {profile.status}
          </Badge>
          {roles.map((r) => (
            <Badge key={r} variant="outline">
              {r}
            </Badge>
          ))}
          {profile.pin_hash ? (
            <Badge variant="outline" className="border-success text-success">
              PIN set
            </Badge>
          ) : (
            <Badge variant="outline">No PIN</Badge>
          )}
          {profile.must_change_password && (
            <Badge variant="outline" className="border-warning text-warning">
              Password reset pending
            </Badge>
          )}
          {profile.must_change_pin && (
            <Badge variant="outline" className="border-warning text-warning">
              PIN reset pending
            </Badge>
          )}
        </div>
        <dl className="text-left text-xs space-y-1 pt-3 border-t">
          <Row label="Email" value={profile.email ?? " - "} />
          <Row label="Phone" value={profile.phone ?? " - "} />
          <Row label="Hire date" value={profile.hire_date ?? " - "} />
          <Row label="Joined" value={format(new Date(profile.created_at), "MMM d, yyyy")} />
        </dl>
      </CardContent>
    </Card>
  );
}

/* -------------------------------- Stats -------------------------------- */

function StatsRow({ userId }: { userId: string }) {
  const salesQ = useQuery({
    queryKey: ["employee-sales-agg", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("total, created_at")
        .eq("cashier_id", userId)
        .limit(500);
      const total = (data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      return { count: data?.length ?? 0, total };
    },
  });
  const refundQ = useQuery({
    queryKey: ["employee-refunds-agg", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("refunds")
        .select("total")
        .eq("cashier_id", userId)
        .limit(500);
      const total = (data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      return { count: data?.length ?? 0, total };
    },
  });
  const hoursQ = useQuery({
    queryKey: ["employee-hours-agg", userId],
    queryFn: async () => {
      const { data } = await sb
        .from("time_entries")
        .select("clock_in, clock_out, break_minutes")
        .eq("user_id", userId)
        .not("clock_out", "is", null)
        .limit(1000);
      const mins = (data ?? []).reduce(
        (s: number, e: { clock_in: string; clock_out: string; break_minutes: number }) => {
          const d = (new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000;
          return s + Math.max(0, d - (e.break_minutes ?? 0));
        },
        0,
      );
      return mins / 60;
    },
  });
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat
        icon={DollarSign}
        label="Sales"
        value={fmtCurrency(salesQ.data?.total ?? 0, "USD")}
        sub={`${salesQ.data?.count ?? 0} sales`}
      />
      <Stat
        icon={RotateCcw}
        label="Refunds"
        value={fmtCurrency(refundQ.data?.total ?? 0, "USD")}
        sub={`${refundQ.data?.count ?? 0} refunds`}
      />
      <Stat
        icon={Clock}
        label="Hours worked"
        value={(hoursQ.data ?? 0).toFixed(1)}
        sub="all-time"
      />
    </div>
  );
}

/* --------------------------- Editable details -------------------------- */

function EditDetailsCard({
  profile,
  currentRole,
  isSelf,
  isOwner,
  canChangeRole,
  onChanged,
}: {
  profile: Profile;
  currentRole: "owner" | "manager" | "cashier" | "admin";
  isSelf: boolean;
  isOwner: boolean;
  canChangeRole: boolean;
  onChanged: () => void;
}) {
  const update = useServerFn(updateEmployee);
  const [first, setFirst] = useState(profile.first_name ?? "");
  const [last, setLast] = useState(profile.last_name ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [hireDate, setHireDate] = useState(profile.hire_date ?? "");
  const [role, setRole] = useState(currentRole);

  useEffect(() => {
    setFirst(profile.first_name ?? "");
    setLast(profile.last_name ?? "");
    setEmail(profile.email ?? "");
    setPhone(profile.phone ?? "");
    setHireDate(profile.hire_date ?? "");
    setRole(currentRole);
  }, [profile, currentRole]);

  const m = useMutation({
    mutationFn: async () => {
      const patch: Parameters<typeof update>[0]["data"] = { user_id: profile.id };
      patch.first_name = first || null;
      patch.last_name = last || null;
      patch.phone = phone || null;
      patch.hire_date = hireDate || null;
      if (email && email !== profile.email) patch.email = email;
      if (role !== currentRole) patch.role = role;
      await update({ data: patch });
    },
    onSuccess: () => {
      toast.success("Employee updated");
      onChanged();
    },
    onError: (e) => toast.error(userFacingError(e, "Save failed")),
  });

  // Only owners can promote to owner/admin; admins can only assign manager/cashier.
  const roleOptions = isOwner ? ["owner", "admin", "manager", "cashier"] : ["manager", "cashier"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Edit information</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>First name</Label>
          <Input value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Last name</Label>
          <Input value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Hire date</Label>
          <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Role</Label>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as typeof role)}
            disabled={!canChangeRole || (isSelf && currentRole === "owner")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!canChangeRole && (
            <p className="text-[10px] text-muted-foreground">
              Only owners or admins can change roles.
            </p>
          )}
          {isSelf && currentRole === "owner" && (
            <p className="text-[10px] text-muted-foreground">
              You can't demote yourself from owner.
            </p>
          )}
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReadOnlyDetails({ profile, role }: { profile: Profile; role: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <KV k="First name" v={profile.first_name ?? " - "} />
        <KV k="Last name" v={profile.last_name ?? " - "} />
        <KV k="Email" v={profile.email ?? " - "} />
        <KV k="Phone" v={profile.phone ?? " - "} />
        <KV k="Role" v={role} />
        <KV k="Status" v={profile.status} />
      </CardContent>
    </Card>
  );
}

/* --------------------------- Employee ID card -------------------------- */

function EmployeeIdCard({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const setCode = useServerFn(setEmployeeCode);
  const regen = useServerFn(regenerateEmployeeCode);
  const [manual, setManual] = useState("");
  const setM = useMutation({
    mutationFn: async () => setCode({ data: { user_id: profile.id, employee_id: manual } }),
    onSuccess: () => {
      toast.success("Employee ID updated");
      setManual("");
      onChanged();
    },
    onError: (e) => toast.error(userFacingError(e, "Failed")),
  });
  const regenM = useMutation({
    mutationFn: async () => regen({ data: { user_id: profile.id } }),
    onSuccess: (r) => {
      toast.success(`New ID: ${r.employee_id}`);
      onChanged();
    },
    onError: (e) => toast.error(userFacingError(e, "Failed")),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Employee ID</CardTitle>
        <CardDescription>Six-digit code used for quick sign-in. Must be unique.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="font-mono text-2xl">{profile.employee_id ?? " - "}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (profile.employee_id) {
                navigator.clipboard.writeText(profile.employee_id);
                toast.success("Copied");
              }
            }}
          >
            <Copy className="size-3.5 mr-1" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => regenM.mutate()}
            disabled={regenM.isPending}
          >
            {regenM.isPending ? (
              <Loader2 className="size-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5 mr-1" />
            )}
            Generate new
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1 max-w-xs">
            <Label>Assign manually</Label>
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
            />
          </div>
          <Button
            onClick={() => setM.mutate()}
            disabled={setM.isPending || !/^\d{6}$/.test(manual)}
          >
            {setM.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Save ID
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------- PIN ---------------------------------- */

function PinCard({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const reset = useServerFn(adminResetPin);
  const [manual, setManual] = useState("");
  const [force, setForce] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);

  const generateM = useMutation({
    mutationFn: async () =>
      reset({
        data: {
          user_id: profile.id,
          force_change: force,
          reason: "Owner generated a new employee PIN",
        },
      }),
    onSuccess: (r) => {
      setIssued(r.pin ?? null);
      onChanged();
    },
    onError: (e) => toast.error(userFacingError(e, "Failed")),
  });
  const setM = useMutation({
    mutationFn: async () =>
      reset({
        data: {
          user_id: profile.id,
          pin: manual,
          force_change: force,
          reason: "Owner set a new employee PIN",
        },
      }),
    onSuccess: () => {
      toast.success("PIN set");
      setManual("");
      onChanged();
    },
    onError: (e) => toast.error(userFacingError(e, "Failed")),
  });
  const clearM = useMutation({
    mutationFn: async () =>
      reset({
        data: {
          user_id: profile.id,
          clear: true,
          force_change: force,
          reason: "Owner cleared the employee PIN",
        },
      }),
    onSuccess: () => {
      toast.success("PIN cleared");
      onChanged();
    },
    onError: (e) => toast.error(userFacingError(e, "Failed")),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">PIN</CardTitle>
        <CardDescription>
          Used for sign-in and approvals on paired Android registers. PINs are hashed and never
          shown after being set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {profile.pin_hash ? (
            <Badge variant="outline" className="border-success text-success">
              PIN configured
            </Badge>
          ) : (
            <Badge variant="outline">No PIN</Badge>
          )}
          {profile.must_change_pin && (
            <Badge variant="outline" className="border-warning text-warning">
              Must change on next login
            </Badge>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Require employee to pick a new PIN at next sign-in
        </label>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label>Set specific PIN</Label>
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              className="w-32"
            />
          </div>
          <Button
            onClick={() => setM.mutate()}
            disabled={setM.isPending || !/^\d{6}$/.test(manual)}
          >
            {setM.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Save PIN
          </Button>
          <Button
            variant="outline"
            onClick={() => generateM.mutate()}
            disabled={generateM.isPending}
          >
            {generateM.isPending ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <KeyRound className="size-4 mr-2" />
            )}
            Generate random
          </Button>
          {profile.pin_hash && (
            <Button variant="outline" onClick={() => clearM.mutate()} disabled={clearM.isPending}>
              Clear PIN
            </Button>
          )}
        </div>
      </CardContent>
      <Dialog open={!!issued} onOpenChange={(v) => !v && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New PIN issued</DialogTitle>
            <DialogDescription>
              Share this with the employee. It won't be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-4 font-mono text-3xl tracking-widest text-center">
            {issued}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(issued ?? "");
                toast.success("Copied");
              }}
            >
              <Copy className="size-4 mr-2" />
              Copy
            </Button>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------------------- Pay & Schedule --------------------------- */

function PayScheduleCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const savePay = useServerFn(updateEmployeePay);
  const { data } = useQuery({
    queryKey: ["employee-pay", userId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("profiles")
        .select("hourly_wage, scheduled_start_time, scheduled_end_time, late_threshold_minutes")
        .eq("id", userId)
        .maybeSingle();
      return data as {
        hourly_wage: number | null;
        scheduled_start_time: string | null;
        scheduled_end_time: string | null;
        late_threshold_minutes: number | null;
      } | null;
    },
  });
  const [wage, setWage] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [threshold, setThreshold] = useState("5");
  useEffect(() => {
    if (!data) return;
    setWage(data.hourly_wage != null ? String(data.hourly_wage) : "");
    setStart(data.scheduled_start_time ?? "");
    setEnd(data.scheduled_end_time ?? "");
    setThreshold(String(data.late_threshold_minutes ?? 5));
  }, [data]);
  const save = useMutation({
    mutationFn: async () =>
      savePay({
        data: {
          user_id: userId,
          hourly_wage: wage === "" ? null : Number(wage),
          scheduled_start_time: start || null,
          scheduled_end_time: end || null,
          late_threshold_minutes: Number(threshold) || 5,
        },
      }),
    onSuccess: () => {
      toast.success("Pay & schedule saved");
      qc.invalidateQueries({ queryKey: ["employee-pay", userId] });
      qc.invalidateQueries({ queryKey: ["payroll-profiles"] });
    },
    onError: (e) => toast.error(userFacingError(e, "Save failed")),
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pay & schedule</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
        <div className="space-y-1">
          <Label>Hourly wage</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={wage}
            onChange={(e) => setWage(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1">
          <Label>Scheduled start</Label>
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Scheduled end</Label>
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Late grace</Label>
          <div className="relative">
            <Input
              type="number"
              min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="pr-20"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              minutes
            </span>
          </div>
        </div>
        <div className="sm:col-span-2 xl:col-span-4">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------- Danger zone ------------------------------- */

function DangerZoneCard({
  profile,
  isSelf,
  isOwner,
  onChanged,
  onDeleted,
}: {
  profile: Profile;
  isSelf: boolean;
  isOwner: boolean;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const toggleStatus = useServerFn(setEmployeeStatus);
  const resetCreds = useServerFn(resetEmployeeCredentials);
  const forceLogout = useServerFn(forceLogoutEmployee);
  const del = useServerFn(deleteEmployee);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const askReason = (label: string) => {
    const r = window.prompt(`${label}\n\nReason (min 4 characters):`) ?? "";
    if (r.trim().length < 4) {
      toast.error("A reason of at least 4 characters is required");
      return null;
    }
    return r.trim();
  };

  const disableM = useMutation({
    mutationFn: async () => {
      const nextStatus = profile.status === "active" ? "disabled" : "active";
      let reason: string | undefined;
      if (nextStatus !== "active") {
        const r = askReason(`Disable ${profile.full_name || profile.email}?`);
        if (r === null) throw new Error("Cancelled");
        reason = r;
      }
      return toggleStatus({ data: { user_id: profile.id, status: nextStatus, reason } });
    },
    onSuccess: () => {
      toast.success("Status updated");
      onChanged();
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : "Failed";
      if (m !== "Cancelled") toast.error(userFacingError(e, "This action could not be completed."));
    },
  });
  const resetM = useMutation({
    mutationFn: async () => {
      const reason = askReason(
        "Reset password (issues a one-time temporary password and signs the user out everywhere)",
      );
      if (reason === null) throw new Error("Cancelled");
      return resetCreds({ data: { user_id: profile.id, reason } });
    },
    onSuccess: (r) => {
      setTempPw(r.temp_password);
      onChanged();
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : "Failed";
      if (m !== "Cancelled") toast.error(userFacingError(e, "This action could not be completed."));
    },
  });
  const logoutM = useMutation({
    mutationFn: async () => {
      const reason = askReason("Force sign-out of all devices?");
      if (reason === null) throw new Error("Cancelled");
      return forceLogout({ data: { user_id: profile.id, reason } });
    },
    onSuccess: () => {
      toast.success("Signed out from all devices");
      onChanged();
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : "Failed";
      if (m !== "Cancelled") toast.error(userFacingError(e, "This action could not be completed."));
    },
  });
  const deleteM = useMutation({
    mutationFn: async () =>
      del({ data: { user_id: profile.id, reason: deleteReason.trim(), confirm: true } }),
    onSuccess: (r) => {
      toast.success(
        r.soft_deleted ? "Employee deactivated (history preserved)" : "Employee removed",
      );
      onDeleted();
    },
    onError: (e) => toast.error(userFacingError(e, "Failed")),
  });

  const expectedName = (profile.full_name || profile.email || "").trim();
  const canConfirmDelete =
    deleteReason.trim().length >= 4 && deleteConfirmName.trim() === expectedName;

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => resetM.mutate()}
            disabled={resetM.isPending || isSelf}
          >
            {resetM.isPending ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <KeyRound className="size-4 mr-2" />
            )}
            Reset password
          </Button>
          <Button
            variant="outline"
            onClick={() => logoutM.mutate()}
            disabled={logoutM.isPending || isSelf}
          >
            {logoutM.isPending ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Ban className="size-4 mr-2" />
            )}
            Force sign-out
          </Button>
          <Button
            variant={profile.status === "active" ? "outline" : "default"}
            onClick={() => disableM.mutate()}
            disabled={disableM.isPending || isSelf}
          >
            {profile.status === "active" ? (
              <>
                <Ban className="size-4 mr-2" />
                Disable
              </>
            ) : (
              <>
                <Check className="size-4 mr-2" />
                Enable
              </>
            )}
          </Button>
          {isOwner && (
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteReason("");
                setDeleteConfirmName("");
                setConfirmDelete(true);
              }}
              disabled={isSelf}
            >
              <Trash2 className="size-4 mr-2" />
              Remove employee
            </Button>
          )}
        </div>
        {isSelf && (
          <p className="text-xs text-muted-foreground">
            You cannot disable, reset, or remove your own account.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Employees with sales, refunds, shifts, or audit history are deactivated instead of deleted
          so historical records stay intact.
        </p>
      </CardContent>

      <Dialog open={!!tempPw} onOpenChange={(v) => !v && setTempPw(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password issued</DialogTitle>
            <DialogDescription>
              Share this with the employee. They'll set a new password at next sign-in. All existing
              sessions have been signed out.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-4 font-mono text-lg text-center">{tempPw}</div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(tempPw ?? "");
                toast.success("Copied");
              }}
            >
              <Copy className="size-4 mr-2" />
              Copy
            </Button>
            <Button onClick={() => setTempPw(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {expectedName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Access is revoked immediately. If the employee has any linked history (sales, refunds,
              shifts, cash movements, audit entries) the account is deactivated and their name stays
              on those records. Otherwise the account is deleted permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Reason (required, min 4 chars)</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Left the company on 2026-07-21"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">
                Type <span className="font-mono">{expectedName}</span> to confirm
              </label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={!canConfirmDelete || deleteM.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (canConfirmDelete) deleteM.mutate();
              }}
            >
              {deleteM.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/* -------------------------- Attendance / Sales ------------------------- */

type TimeEntryRow = {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  late?: boolean;
  late_minutes?: number;
};

function AttendanceList({ userId }: { userId: string }) {
  const me = useMe();
  const canAdjust = (me.data?.roles ?? []).some(
    (r) => r === "owner" || r === "admin" || r === "manager",
  );
  const qc = useQueryClient();
  const [editing, setEditing] = useState<TimeEntryRow | null>(null);
  const { data = [], isLoading } = useQuery<TimeEntryRow[]>({
    queryKey: ["employee-time-list", userId],
    queryFn: async () => {
      const { data } = await sb
        .from("time_entries")
        .select("*")
        .eq("user_id", userId)
        .order("clock_in", { ascending: false })
        .limit(50);
      return (data ?? []) as TimeEntryRow[];
    },
  });
  const lastIn = data.find((e) => e.clock_in);
  const lastOut = data.find((e) => e.clock_out);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Attendance history</CardTitle>
        <CardDescription>
          Last clock-in: {lastIn ? format(new Date(lastIn.clock_in), "PPp") : " - "} · Last
          clock-out: {lastOut?.clock_out ? format(new Date(lastOut.clock_out), "PPp") : " - "}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin inline mr-2" />
            Loading…
          </div>
        )}
        {!isLoading && data.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No time entries yet.</div>
        )}
        {data.map((e) => {
          const inD = new Date(e.clock_in);
          const outD = e.clock_out ? new Date(e.clock_out) : null;
          const mins = outD
            ? Math.max(
                0,
                Math.round((outD.getTime() - inD.getTime()) / 60000) - (e.break_minutes ?? 0),
              )
            : null;
          return (
            <div
              key={e.id}
              className="flex items-center justify-between px-4 py-2 border-b last:border-0 text-xs gap-2"
            >
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {format(inD, "EEE, MMM d")}
                  {e.late && (
                    <Badge variant="outline" className="border-warning text-warning">
                      Late {e.late_minutes}m
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {format(inD, "p")} –{" "}
                  {outD ? format(outD, "p") : <span className="text-primary">Clocked in</span>}
                  {e.break_minutes ? ` · ${e.break_minutes}m break` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right font-mono">
                  {mins != null ? `${(mins / 60).toFixed(2)} h` : " - "}
                </div>
                {canAdjust && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                    Adjust
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
      {editing && (
        <TimeEntryEditDialog
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["employee-time-list", userId] });
            qc.invalidateQueries({ queryKey: ["employee-hours-agg", userId] });
          }}
        />
      )}
    </Card>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TimeEntryEditDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimeEntryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const adjust = useServerFn(adjustTimeEntry);
  const [clockIn, setClockIn] = useState(toLocalInput(entry.clock_in));
  const [clockOut, setClockOut] = useState(toLocalInput(entry.clock_out));
  const [breakMin, setBreakMin] = useState(String(entry.break_minutes ?? 0));
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: async () =>
      adjust({
        data: {
          entry_id: entry.id,
          clock_in: new Date(clockIn).toISOString(),
          clock_out: clockOut ? new Date(clockOut).toISOString() : null,
          break_minutes: Number(breakMin) || 0,
          note: note || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Time entry adjusted");
      onSaved();
    },
    onError: (e) => toast.error(userFacingError(e, "Save failed")),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust time entry</DialogTitle>
          <DialogDescription>
            Correct clock-in/out or break for this shift. This is logged for audit.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Clock in</Label>
            <Input
              type="datetime-local"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Clock out</Label>
            <Input
              type="datetime-local"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Break (minutes)</Label>
            <Input
              type="number"
              min="0"
              value={breakMin}
              onChange={(e) => setBreakMin(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Reason / note</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. forgot to clock out"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !clockIn}>
            {m.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SalesList({ userId }: { userId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["employee-sales-list", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, total, created_at, status, receipt_number")
        .eq("cashier_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sales performance</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No sales.</div>
        )}
        {data.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between px-4 py-2 border-b last:border-0 text-sm"
          >
            <div>
              <div className="font-mono text-xs">#{s.receipt_number ?? s.id.slice(0, 6)}</div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(s.created_at), "PPp")}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline">{s.status}</Badge>
              <div className="font-mono">{fmtCurrency(Number(s.total), "USD")}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RefundsList({ userId }: { userId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["employee-refunds-list", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("refunds")
        .select("id, total, created_at, reason")
        .eq("cashier_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Refund history</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No refunds.</div>
        )}
        {data.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between px-4 py-2 border-b last:border-0 text-sm"
          >
            <div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(r.created_at), "PPp")}
              </div>
              {r.reason && <div className="text-xs">{r.reason}</div>}
            </div>
            <div className="font-mono">{fmtCurrency(Number(r.total), "USD")}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ActivityLog({ userId }: { userId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["employee-audit", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id, action, entity, created_at, details")
        .eq("actor_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });
  const activity = useMemo(() => data, [data]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity log</CardTitle>
        <CardDescription>Recent actions by this employee.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {activity.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No activity yet.</div>
        )}
        {activity.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between px-4 py-2 border-b last:border-0 text-xs"
          >
            <div>
              <div className="font-medium">{a.action}</div>
              <div className="text-muted-foreground">{a.entity ?? " - "}</div>
            </div>
            <div className="text-muted-foreground">{format(new Date(a.created_at), "PPp")}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- misc -------------------------------- */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="text-sm">{v}</div>
    </div>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="text-2xl font-bold mt-1 font-mono">{value}</div>
        <div className="text-[10px] text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
