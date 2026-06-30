import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number;
  stock: number;
  taxable: boolean;
  is_favorite: boolean;
};

function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () => (await supabase.from("stores").select("*").limit(1).maybeSingle()).data,
  });
  const cur = store?.currency ?? "USD";

  const { data: products = [], isLoading } = useQuery<ProductRow[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,sku,barcode,price,cost,stock,taxable,is_favorite")
        .order("created_at", { ascending: false });
      return (data as ProductRow[]) ?? [];
    },
  });

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q);
  });

  const toggleFav = useMutation({
    mutationFn: async (p: ProductRow) => {
      const { error } = await supabase.from("products").update({ is_favorite: !p.is_favorite }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={`${products.length} items`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="size-4 mr-1" /> New product</Button>
            </DialogTrigger>
            <NewProductDialog
              onCreated={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["products"] });
              }}
              storeId={store?.id}
            />
          </Dialog>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU, barcode" className="pl-9" />
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="size-5 animate-spin inline" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No products yet — click "New product" to add one.</TableCell></TableRow>
              ) : (
                filtered.map((p) => {
                  const margin = Number(p.price) > 0 ? ((Number(p.price) - Number(p.cost)) / Number(p.price)) * 100 : 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <button onClick={() => toggleFav.mutate(p)} aria-label="Toggle favorite">
                          <Star className={`size-4 ${p.is_favorite ? "fill-warning text-warning" : "text-muted-foreground"}`} />
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{p.sku ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{p.barcode ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(Number(p.cost), cur)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(Number(p.price), cur)}</TableCell>
                      <TableCell className="text-right font-mono">{margin.toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-mono">{Number(p.stock)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function NewProductDialog({ onCreated, storeId }: { onCreated: () => void; storeId?: string }) {
  const [form, setForm] = useState({
    name: "", sku: "", barcode: "", price: "", cost: "", stock: "0", taxable: true, is_favorite: false,
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("products").insert({
      store_id: storeId,
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      stock: Number(form.stock) || 0,
      taxable: form.taxable,
      is_favorite: form.is_favorite,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Product created");
    onCreated();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New product</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          <div className="space-y-2"><Label>Barcode</Label><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2"><Label>Cost</Label><Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
          <div className="space-y-2"><Label>Price</Label><Input type="number" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          <div className="space-y-2"><Label>Stock</Label><Input type="number" step="1" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="taxable">Taxable</Label>
          <Switch id="taxable" checked={form.taxable} onCheckedChange={(v) => setForm({ ...form, taxable: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="fav">Show on checkout favorites</Label>
          <Switch id="fav" checked={form.is_favorite} onCheckedChange={(v) => setForm({ ...form, is_favorite: v })} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin mr-2" />}Create</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
