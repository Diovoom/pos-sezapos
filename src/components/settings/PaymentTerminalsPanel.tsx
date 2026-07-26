import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, CreditCard } from "lucide-react";
import { useMe } from "@/hooks/useMe";
import { logAudit } from "@/lib/audit-log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Terminal = {
  id: string;
  store_id: string;
  label: string;
  provider: string;
  serial: string | null;
  location: string | null;
  status: string;
  last_seen_at: string | null;
  config?: Record<string, unknown> | null;
};

const PROVIDERS = [
  { id: "stripe-tap-to-pay", label: "Stripe Tap to Pay on Android" },
  { id: "stripe-wisepos", label: "Stripe WisePOS E / S700 (Internet)" },
  { id: "stripe-wisepad3", label: "Stripe WisePad 3 (Bluetooth)" },
  { id: "manual", label: "Cash-only register" },
  { id: "custom", label: "Custom / Other" },
];

export function PaymentTerminalsPanel({ canEdit }: { canEdit: boolean }) {
  const { data: me } = useMe();
  const storeId = me?.store?.id as string | undefined;
  const qc = useQueryClient();

  const terminals = useQuery({
    queryKey: ["payment_terminals", storeId],
    enabled: !!storeId,
    queryFn: async (): Promise<Terminal[]> => {
      const { data } = await sb
        .from("payment_terminals")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at");
      return (data ?? []) as Terminal[];
    },
  });

  const [form, setForm] = useState({
    label: "",
    provider: "stripe-tap-to-pay",
    serial: "",
    location: "",
    stripeLocationId: "",
    testMode: true,
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("No store");
      if (!form.label.trim()) throw new Error("Label required");
      const { data, error } = await sb
        .from("payment_terminals")
        .insert({
          store_id: storeId,
          label: form.label.trim(),
          provider: form.provider,
          serial: form.serial || null,
          location: form.location || null,
          status: "inactive",
          config: {
            reader_type: form.provider,
            location_id: form.stripeLocationId.trim(),
            test_mode: form.testMode,
          },
        })
        .select()
        .single();
      if (error) throw error;
      void logAudit({
        action: "terminal.create",
        entity: "payment_terminal",
        entity_id: data.id,
        details: { label: form.label, provider: form.provider },
      });
    },
    onSuccess: () => {
      toast.success("Terminal added");
      setForm({
        label: "",
        provider: "stripe-tap-to-pay",
        serial: "",
        location: "",
        stripeLocationId: "",
        testMode: true,
      });
      qc.invalidateQueries({ queryKey: ["payment_terminals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("payment_terminals").delete().eq("id", id);
      if (error) throw error;
      void logAudit({ action: "terminal.delete", entity: "payment_terminal", entity_id: id });
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["payment_terminals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggle = useMutation({
    mutationFn: async (t: Terminal) => {
      const nextStatus = t.status === "active" ? "inactive" : "active";
      const { error } = await sb
        .from("payment_terminals")
        .update({
          status: nextStatus,
          last_seen_at: nextStatus === "active" ? new Date().toISOString() : t.last_seen_at,
        })
        .eq("id", t.id);
      if (error) throw error;
      void logAudit({
        action: "terminal.toggle",
        entity: "payment_terminal",
        entity_id: t.id,
        details: { status: nextStatus },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment_terminals"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-5" /> Registered terminals
        </CardTitle>
        <CardDescription>
          Pair Stripe Tap to Pay or a supported Stripe reader. Connection tokens and card-present
          PaymentIntents are created securely by SEZA; secret keys never enter the register app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {terminals.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : terminals.data && terminals.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2">Label</th>
                  <th>Provider</th>
                  <th>Serial</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {terminals.data.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{t.label}</td>
                    <td>{PROVIDERS.find((p) => p.id === t.provider)?.label ?? t.provider}</td>
                    <td className="text-muted-foreground">{t.serial ?? "—"}</td>
                    <td className="text-muted-foreground">{t.location ?? "—"}</td>
                    <td>
                      <Badge
                        variant="outline"
                        className={
                          t.status === "active"
                            ? "text-success border-success/30"
                            : "text-muted-foreground"
                        }
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canEdit}
                        onClick={() => toggle.mutate(t)}
                      >
                        {t.status === "active" ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canEdit}
                        onClick={() => remove.mutate(t.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No terminals registered yet.</p>
        )}

        {canEdit && (
          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-medium">Add terminal</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Label</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Front counter"
                />
              </div>
              <div className="space-y-1">
                <Label>Provider</Label>
                <Select
                  value={form.provider}
                  onValueChange={(v) => setForm({ ...form, provider: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Serial</Label>
                <Input
                  value={form.serial}
                  onChange={(e) => setForm({ ...form, serial: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Physical location label</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Main floor"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Stripe Terminal Location ID</Label>
                <Input
                  value={form.stripeLocationId}
                  onChange={(e) => setForm({ ...form, stripeLocationId: e.target.value })}
                  placeholder="tml_…"
                />
                <p className="text-xs text-muted-foreground">
                  Create or copy this from Stripe Dashboard → Terminal → Locations.
                </p>
              </div>
              <div className="col-span-2 flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">Stripe test mode</div>
                  <div className="text-xs text-muted-foreground">
                    Turn off only after live Stripe Terminal credentials and a real reader are
                    approved.
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={form.testMode}
                  onChange={(e) => setForm({ ...form, testMode: e.target.checked })}
                />
              </div>
            </div>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Plus className="size-4 mr-2" />
              )}{" "}
              Add terminal
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
