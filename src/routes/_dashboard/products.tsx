import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Star, Loader2, Camera, Wand2, Upload, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { fmtCurrency } from "@/lib/format";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";
import { lookupBarcode } from "@/lib/barcode-lookup.functions";
import { uploadProductImage, importRemoteProductImage, useProductImageUrl } from "@/lib/pos/product-images";

export const Route = createFileRoute("/_dashboard/products")({
  head: () => ({ meta: [{ title: "Products — SEZA POS" }, { name: "description", content: "Manage your product catalog, categories, pricing, and barcodes." }] }),
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
  image_url: string | null;
  age_restricted?: boolean | null;
  min_age?: number | null;
  age_category?: string | null;
};

function ProductThumb({ path }: { path: string | null }) {
  const url = useProductImageUrl(path);
  if (!url) {
    return (
      <div className="size-9 rounded bg-muted grid place-items-center text-muted-foreground">
        <ImageIcon className="size-4" />
      </div>
    );
  }
  return <img src={url} alt="" className="size-9 rounded object-cover" />;
}

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
        .select("id,name,sku,barcode,price,cost,stock,taxable,is_favorite,image_url,age_restricted,min_age,age_category")
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
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products by name, SKU, or barcode" placeholder="Search name, SKU, barcode" className="pl-9" />
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-12"></TableHead>
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
                <TableRow><TableCell colSpan={9} className="text-center py-10"><Loader2 className="size-5 animate-spin inline" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No products yet — click "New product" to add one.</TableCell></TableRow>
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
                      <TableCell><ProductThumb path={p.image_url} /></TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                          {p.age_restricted && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
                              {p.min_age ?? 21}+
                            </span>
                          )}
                        </div>
                      </TableCell>
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
    age_restricted: false, min_age: "21", age_category: "alcohol",
  });
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useProductImageUrl(imagePath);
  const lookup = useServerFn(lookupBarcode);

  const runLookup = async (barcode: string) => {
    if (!barcode.trim()) return toast.error("Enter a barcode first");
    setLooking(true);
    try {
      const result = await lookup({ data: { barcode: barcode.trim() } });
      if (!result.name) {
        toast.error("No product found for that barcode");
        return;
      }
      const name = result.brand ? `${result.brand} ${result.name}` : result.name;
      setForm((f) => ({ ...f, name: f.name || name, barcode: result.barcode }));
      if (result.image_url && !imagePath) {
        const path = await importRemoteProductImage(result.image_url);
        if (path) setImagePath(path);
      }
      toast.success(`Loaded from ${result.source === "openfoodfacts" ? "Open Food Facts" : "UPC database"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLooking(false);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadProductImage(file);
      setImagePath(path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

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
      image_url: imagePath,
      age_restricted: form.age_restricted,
      min_age: form.age_restricted ? Number(form.min_age) || 21 : null,
      age_category: form.age_restricted ? form.age_category : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Product created");
    onCreated();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>New product</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-3">
          <div className="size-20 rounded-lg border bg-muted overflow-hidden grid place-items-center shrink-0">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Upload className="size-3.5 mr-1" />}
              {imagePath ? "Replace image" : "Upload image"}
            </Button>
            {imagePath && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setImagePath(null)}>
                <X className="size-3.5 mr-1" /> Remove
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Barcode</Label>
            <div className="flex gap-1">
              <Input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void runLookup(form.barcode);
                }}
                placeholder="Scan or type a barcode"
                autoComplete="off"
              />
              <Button type="button" size="icon" variant="outline" onClick={() => setScanning(true)} title="Scan with camera" aria-label="Scan barcode with camera">
                <Camera className="size-4" aria-hidden="true" />
              </Button>
              <Button type="button" size="icon" variant="outline" onClick={() => runLookup(form.barcode)} disabled={looking} title="Auto-fill from barcode database" aria-label="Look up product by barcode">
                {looking ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" aria-hidden="true" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">A USB/Bluetooth scanner that sends Enter will look up the item automatically.</p>
          </div>
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
        <div className="rounded-md border p-3 space-y-3 bg-surface/40">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="age_restricted" className="font-medium">Age restricted</Label>
              <p className="text-xs text-muted-foreground">Requires ID verification at checkout.</p>
            </div>
            <Switch id="age_restricted" checked={form.age_restricted} onCheckedChange={(v) => setForm({ ...form, age_restricted: v })} />
          </div>
          {form.age_restricted && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Minimum age</Label>
                <Input type="number" min={13} max={99} value={form.min_age} onChange={(e) => setForm({ ...form, min_age: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={form.age_category}
                  onChange={(e) => setForm({ ...form, age_category: e.target.value })}
                >
                  {["alcohol","beer","wine","spirits","tobacco","cigarettes","cigars","vape","nicotine","lottery","other"].map((c) => (
                    <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin mr-2" />}Create</Button>
        </DialogFooter>
      </form>

      <BarcodeScanner
        open={scanning}
        onOpenChange={setScanning}
        onDetected={(code) => {
          setForm((f) => ({ ...f, barcode: code }));
          toast.success(`Scanned ${code}`);
          void runLookup(code);
        }}
      />
    </DialogContent>
  );
}

