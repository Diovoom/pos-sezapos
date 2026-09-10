import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Users, DollarSign, Star, Mail, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { fmtCurrency } from "@/lib/format";
import { usePlanGate } from "@/hooks/useSubscription";

export const Route = createFileRoute("/_dashboard/customers")({
  head: () => ({
    meta: [
      { title: "Customers  -  SEZA POS" },
      {
        name: "description",
        content:
          "Customer CRM with purchase history, communication consent, and optional loyalty rewards.",
      },
    ],
  }),
  component: CustomersPage,
});

type Customer = {
  id: string;
  store_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  loyalty_points: number;
  total_spent: number;
  visit_count: number;
  marketing_email: boolean;
  marketing_sms: boolean;
  last_visit_at: string | null;
  created_at: string;
};

const db = supabase as any;

function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const planGate = usePlanGate();
  const loyaltyEnabled = planGate.canFeature("customer_loyalty");

  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () =>
      (await supabase.from("stores").select("id,currency").limit(1).maybeSingle()).data,
  });

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await db
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone].some((value) =>
        value?.toLowerCase().includes(q),
      ),
    );
  }, [customers, search]);

  const stats = useMemo(
    () => ({
      count: customers.length,
      totalSpent: customers.reduce((sum, customer) => sum + Number(customer.total_spent || 0), 0),
      points: customers.reduce((sum, customer) => sum + Number(customer.loyalty_points || 0), 0),
    }),
    [customers],
  );

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer removed");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error) =>
      toast.error(userFacingError(error, "Could not remove customer")),
  });

  const startNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const startEdit = (customer: Customer) => {
    setEditing(customer);
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={
          loyaltyEnabled
            ? "Profiles, loyalty, communication consent and purchase activity"
            : "Profiles, communication consent and purchase activity"
        }
        actions={
          <Button onClick={startNew}>
            <Plus className="mr-1 size-4" /> New customer
          </Button>
        }
      />
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Metric icon={Users} label="Customers" value={String(stats.count)} />
          <Metric
            icon={DollarSign}
            label="Lifetime sales"
            value={fmtCurrency(stats.totalSpent, store?.currency ?? "USD")}
          />
          {loyaltyEnabled && (
            <Metric icon={Star} label="Loyalty points issued" value={stats.points.toLocaleString()} />
          )}
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email or phone"
            className="pl-9"
          />
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Consent</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                {loyaltyEnabled && <TableHead className="text-right">Points</TableHead>}
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={loyaltyEnabled ? 7 : 6} className="py-12 text-center">
                    <Loader2 className="inline size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={loyaltyEnabled ? 7 : 6} className="py-12 text-center text-muted-foreground">
                    No customers yet. Add one or attach a customer during checkout.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <button className="text-left" onClick={() => startEdit(customer)}>
                        <div className="font-medium">{customer.name}</div>
                        <div className="max-w-56 truncate text-xs text-muted-foreground">
                          {customer.notes || "No notes"}
                        </div>
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{customer.phone || " - "}</div>
                      <div className="text-xs text-muted-foreground">{customer.email || " - "}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {customer.marketing_email && (
                          <Badge variant="outline">
                            <Mail className="mr-1 size-3" /> Email
                          </Badge>
                        )}
                        {customer.marketing_sms && (
                          <Badge variant="outline">
                            <MessageSquare className="mr-1 size-3" /> SMS
                          </Badge>
                        )}
                        {!customer.marketing_email && !customer.marketing_sms && (
                          <span className="text-xs text-muted-foreground">Transactional only</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{customer.visit_count}</TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtCurrency(Number(customer.total_spent), store?.currency ?? "USD")}
                    </TableCell>
                    {loyaltyEnabled && (
                      <TableCell className="text-right font-mono">
                        {customer.loyalty_points}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(customer)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <CustomerDialog
          customer={editing}
          storeId={store?.id}
          loyaltyEnabled={loyaltyEnabled}
          onSaved={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["customers"] });
          }}
          onDelete={
            editing
              ? () => {
                  if (window.confirm(`Remove ${editing.name}? Existing sales will remain.`)) {
                    remove.mutate(editing.id);
                    setOpen(false);
                  }
                }
              : undefined
          }
        />
      </Dialog>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerDialog({
  customer,
  storeId,
  loyaltyEnabled,
  onSaved,
  onDelete,
}: {
  customer: Customer | null;
  storeId?: string;
  loyaltyEnabled: boolean;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    notes: customer?.notes ?? "",
    loyalty_points: String(customer?.loyalty_points ?? 0),
    marketing_email: customer?.marketing_email ?? false,
    marketing_sms: customer?.marketing_sms ?? false,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Customer name is required");
    if (!storeId) return toast.error("No store is linked to this account");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        store_id: storeId,
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        marketing_email: form.marketing_email,
        marketing_sms: form.marketing_sms,
      };
      if (loyaltyEnabled) {
        payload.loyalty_points = Math.max(0, Number(form.loyalty_points) || 0);
      }
      const query = customer
        ? db.from("customers").update(payload).eq("id", customer.id)
        : db.from("customers").insert(payload);
      const { error } = await query;
      if (error) throw error;
      toast.success(customer ? "Customer updated" : "Customer created");
      onSaved();
    } catch (error) {
      toast.error(userFacingError(error, "Could not save customer"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-2 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        {loyaltyEnabled && (
          <Field label="Loyalty points">
            <Input
              type="number"
              min="0"
              value={form.loyalty_points}
              onChange={(e) => setForm({ ...form, loyalty_points: e.target.value })}
            />
          </Field>
        )}
        <div className="sm:col-span-2">
          <Field label="Notes">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Preferences, delivery notes or internal context"
            />
          </Field>
        </div>
        <Consent
          label="Promotional email consent"
          checked={form.marketing_email}
          onCheckedChange={(value) => setForm({ ...form, marketing_email: value })}
        />
        <Consent
          label="Promotional SMS consent"
          checked={form.marketing_sms}
          onCheckedChange={(value) => setForm({ ...form, marketing_sms: value })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Receipts and service messages remain transactional. Promotional email or SMS must only be
        sent when the matching consent is enabled.
      </p>
      <DialogFooter className="gap-2 sm:justify-between">
        <div>
          {onDelete && (
            <Button type="button" variant="destructive" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          {customer ? "Save changes" : "Create customer"}
        </Button>
      </DialogFooter>
    </DialogContent>
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

function Consent({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
