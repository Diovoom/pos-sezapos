import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () => (await supabase.from("stores").select("*").limit(1).maybeSingle()).data,
  });

  const [form, setForm] = useState({ name: "", address: "", phone: "", tax_rate: "0.0825", currency: "USD" });
  useEffect(() => {
    if (store) setForm({
      name: store.name ?? "",
      address: store.address ?? "",
      phone: store.phone ?? "",
      tax_rate: String(store.tax_rate ?? "0.0825"),
      currency: store.currency ?? "USD",
    });
  }, [store]);

  const save = useMutation({
    mutationFn: async () => {
      if (!store) return;
      const { error } = await supabase.from("stores").update({
        name: form.name,
        address: form.address || null,
        phone: form.phone || null,
        tax_rate: Number(form.tax_rate),
        currency: form.currency,
      }).eq("id", store.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Store settings saved");
      qc.invalidateQueries({ queryKey: ["store"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <>
      <PageHeader title="Settings" subtitle="Store profile and tax" />
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Store profile</CardTitle>
            <CardDescription>These details appear on receipts and reports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Store name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-2"><Label>Tax rate</Label><Input type="number" step="0.0001" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} /></div>
              <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Save changes
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
