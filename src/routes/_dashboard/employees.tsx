import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  createEmployee,
  resetEmployeeCredentials,
  setEmployeeStatus,
} from "@/lib/employees.functions";
import { useMe } from "@/hooks/useMe";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2, Plus, KeyRound, Ban, Check, Copy,
} from "lucide-react";

export const Route = createFileRoute("/_dashboard/employees")({
  head: () => ({ meta: [{ title: "Employees — SEZA POS" }, { name: "description", content: "Manage store employees, roles, and 6-digit PIN sign-in credentials." }] }),
  component: EmployeesPage,
});

type EmployeeRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  employee_id: string | null;
  status: string;
  hire_date: string | null;
  must_change_password: boolean;
  photo_url: string | null;
};

function EmployeesPage() {
  const qc = useQueryClient();
  const me = useMe();
  const navigate = useNavigate();
  const isOwner = me.data?.roles.includes("owner");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: employees = [], isLoading } = useQuery<EmployeeRow[]>({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      return (data as unknown as EmployeeRow[]) ?? [];
    },
  });

  const toggleStatus = useServerFn(setEmployeeStatus);
  const resetCreds = useServerFn(resetEmployeeCredentials);

  const disableM = useMutation({
    mutationFn: async (row: EmployeeRow) =>
      toggleStatus({
        data: { user_id: row.id, status: row.status === "active" ? "disabled" : "active" },
      }),
    onSuccess: () => {
      toast.success("Employee status updated");
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [resetInfo, setResetInfo] = useState<{ email: string; temp: string } | null>(null);
  const resetM = useMutation({
    mutationFn: async (row: EmployeeRow) => {
      const r = await resetCreds({ data: { user_id: row.id } });
      return { email: row.email!, temp: r.temp_password };
    },
    onSuccess: (data) => {
      setResetInfo(data);
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Owners create accounts. Employees sign in with their 6-digit ID."
        actions={
          isOwner ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-2" /> New employee
            </Button>
          ) : null
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => navigate({ to: "/employees/$id", params: { id: row.id } })}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-full bg-muted grid place-items-center text-xs font-bold">
                            {(row.first_name?.[0] ?? row.email?.[0] ?? "?").toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-sm">
                              {row.full_name || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "—"}
                            </div>
                            {row.must_change_password && (
                              <div className="text-[10px] text-warning uppercase tracking-wider">First login pending</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{row.employee_id ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <div>{row.email}</div>
                        {row.phone && <div className="text-muted-foreground">{row.phone}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "active" ? "default" : "secondary"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {isOwner && me.data?.user.id !== row.id && (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="outline" onClick={() => resetM.mutate(row)}>
                              <KeyRound className="size-3.5 mr-1" /> Reset
                            </Button>
                            <Button
                              size="sm"
                              variant={row.status === "active" ? "outline" : "default"}
                              onClick={() => disableM.mutate(row)}
                            >
                              {row.status === "active" ? <><Ban className="size-3.5 mr-1" />Disable</> : <><Check className="size-3.5 mr-1" />Enable</>}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {employees.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">No employees yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateEmployeeDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={!!resetInfo} onOpenChange={(v) => !v && setResetInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password issued</DialogTitle>
            <DialogDescription>
              Share this with the employee. They'll be asked to set a new password on next sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-4 font-mono text-lg text-center">{resetInfo?.temp}</div>
          <div className="text-xs text-muted-foreground text-center">Email: {resetInfo?.email}</div>
          <DialogFooter>
            <CopyBtn value={resetInfo?.temp ?? ""} />
            <Button onClick={() => setResetInfo(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CopyBtn({ value }: { value: string }) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success("Copied");
      }}
    >
      <Copy className="size-4 mr-2" />Copy
    </Button>
  );
}

function CreateEmployeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createEmployee);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    role: "cashier" as "manager" | "cashier",
    hire_date: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ employee_id: string; email: string; temp: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await create({ data: form });
      setResult({ employee_id: r.employee_id, email: r.email, temp: r.temp_password });
      qc.invalidateQueries({ queryKey: ["employees"] });
      setForm({ first_name: "", last_name: "", email: "", phone: "", role: "cashier", hire_date: new Date().toISOString().slice(0, 10) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create employee");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>New employee</DialogTitle>
              <DialogDescription>
                A 6-digit Employee ID and one-time password will be generated.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>First name</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Last name</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></div>
              </div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-2"><Label>Hire date</Label><Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "manager" | "cashier" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                  Create employee
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Employee created</DialogTitle>
              <DialogDescription>
                Share these credentials with the employee. They'll set a permanent password and PIN on first sign-in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Employee ID" value={result.employee_id} mono big />
              <Field label="Email (first login only)" value={result.email} />
              <Field label="Temporary password" value={result.temp} mono />
            </div>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono, big }: { label: string; value: string; mono?: boolean; big?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div className={`flex-1 rounded-md border bg-muted/40 px-3 py-2 ${mono ? "font-mono" : ""} ${big ? "text-2xl text-center tracking-widest" : ""}`}>{value}</div>
        <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}>
          <Copy className="size-4" />
        </Button>
      </div>
    </div>
  );
}
