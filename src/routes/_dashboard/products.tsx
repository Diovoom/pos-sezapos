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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Star, Loader2, Camera, Wand2, Upload, X, ImageIcon, Pencil, Trash2, Power } from "lucide-react";
import { toast } from "sonner";
import { fmtCurrency } from "@/lib/format";
import { loadInventoryDrafts, saveInventoryDraft, applyInventoryDrafts } from "@/lib/inventory-drafts";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";
import { lookupBarcode } from "@/lib/barcode-lookup.functions";
import {
  uploadProductImage,
  importRemoteProductImage,
  useProductImageUrl,
} from "@/lib/pos/product-images";

export const Route = createFileRoute("/_dashboard/products")({
  head: () => ({
    meta: [
      { title: "Products  -  SEZA POS" },
      {
        name: "description",
        content: "Manage your product catalog, categories, pricing, and barcodes.",
      },
    ],
  }),
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
  status?: string | null;
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
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", sku: "", barcode: "", cost: "", price: "", stock: "" });
  const [draftTick, setDraftTick] = useState(0);

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
        .select(
          "id,name,sku,barcode,price,cost,stock,taxable,is_favorite,image_url,age_restricted,min_age,age_category,status",
        )
        .order("created_at", { ascending: false });
      return (data as ProductRow[]) ?? [];
    },
  });

  void draftTick;
  const draftedProducts = store?.id ? applyInventoryDrafts(products, loadInventoryDrafts(store.id)) : products;

  const filtered = draftedProducts.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q)
    );
  });

  const toggleFav = useMutation({
    mutationFn: async (p: ProductRow) => {
      const { error } = await supabase
        .from("products")
        .update({ is_favorite: !p.is_favorite })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  const startEdit = (product: ProductRow) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      sku: product.sku ?? "",
      barcode: product.barcode ?? "",
      cost: String(product.cost ?? 0),
      price: String(product.price ?? 0),
      stock: String(product.stock ?? 0),
    });
  };

  const updateProduct = useMutation({
    mutationFn: async () => {
      if (!editingProduct || !store?.id) throw new Error("No product selected");
      const price = Number(editForm.price), cost = Number(editForm.cost), stock = Number(editForm.stock);
      if (!editForm.name.trim()) throw new Error("Product name is required");
      if (![price, cost, stock].every(Number.isFinite) || price < 0 || cost < 0 || stock < 0) throw new Error("Enter valid non-negative numbers");
      const sku = editForm.sku.trim() || null;
      const barcode = editForm.barcode.trim() || null;
      const duplicate = draftedProducts.find((p) => p.id !== editingProduct.id && ((sku && p.sku?.toLowerCase() === sku.toLowerCase()) || (barcode && p.barcode === barcode)));
      if (duplicate) throw new Error(sku && duplicate.sku?.toLowerCase() === sku.toLowerCase() ? `SKU already belongs to ${duplicate.name}` : `Barcode already belongs to ${duplicate.name}`);
      saveInventoryDraft(store.id, { id: crypto.randomUUID(), operation: "update", productId: editingProduct.id, original: editingProduct as any, changes: { name: editForm.name.trim(), sku, barcode, cost, price, stock }, createdAt: new Date().toISOString() });
    },
    onSuccess: () => { toast.success("Saved as unpublished change"); setEditingProduct(null); setDraftTick((v) => v + 1); },
    onError: (error: Error) => toast.error(error.message || "Could not save product"),
  });

  const stageDelete = (product: ProductRow) => {
    if (!store?.id) return;
    saveInventoryDraft(store.id, { id: crypto.randomUUID(), operation: "delete", productId: product.id, original: product as any, createdAt: new Date().toISOString() });
    toast.success("Delete staged. Publish to remove it from POS.");
    setDraftTick((v) => v + 1);
  };

  const stageStatus = (product: ProductRow) => {
    if (!store?.id) return;
    const status = product.status === "inactive" ? "active" : "inactive";
    saveInventoryDraft(store.id, { id: crypto.randomUUID(), operation: "update", productId: product.id, original: product as any, changes: { status }, createdAt: new Date().toISOString() });
    toast.success(`${product.name} will be ${status} after publishing`);
    setDraftTick((v) => v + 1);
  };

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={`${draftedProducts.length} items${store?.id ? ` · ${loadInventoryDrafts(store.id).length} unpublished` : ""}`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-1" /> New product
              </Button>
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
          <Search
            className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search products by name, SKU, or barcode"
            placeholder="Search name, SKU, barcode"
            className="pl-9"
          />
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
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10">
                    <Loader2 className="size-5 animate-spin inline" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                    No products yet - click "New product" to add one.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const margin =
                    Number(p.price) > 0
                      ? ((Number(p.price) - Number(p.cost)) / Number(p.price)) * 100
                      : 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <button onClick={() => toggleFav.mutate(p)} aria-label="Toggle favorite">
                          <Star
                            className={`size-4 ${p.is_favorite ? "fill-warning text-warning" : "text-muted-foreground"}`}
                          />
                        </button>
                      </TableCell>
                      <TableCell>
                        <ProductThumb path={p.image_url} />
                      </TableCell>
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
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {p.sku ?? " - "}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {p.barcode ?? " - "}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtCurrency(Number(p.cost), cur)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtCurrency(Number(p.price), cur)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{margin.toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-mono">{Number(p.stock)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => startEdit(p)}><Pencil className="mr-1.5 size-3.5" /> Edit</Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => stageStatus(p)}><Power className="mr-1.5 size-3.5" />{p.status === "inactive" ? "Activate" : "Deactivate"}</Button>
                          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => stageDelete(p)}><Trash2 className="mr-1.5 size-3.5" /> Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog
        open={Boolean(editingProduct)}
        onOpenChange={(next) => {
          if (!next && !updateProduct.isPending) setEditingProduct(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="product-edit-name">Product name</Label>
              <Input id="product-edit-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="product-edit-sku">SKU</Label>
                <Input id="product-edit-sku" value={editForm.sku} onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-edit-barcode">Barcode</Label>
                <Input id="product-edit-barcode" value={editForm.barcode} onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="product-edit-cost">Cost</Label>
                <Input id="product-edit-cost" type="number" min="0" step="0.01" value={editForm.cost} onChange={(e) => setEditForm({ ...editForm, cost: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-edit-price">Price</Label>
                <Input id="product-edit-price" type="number" min="0" step="0.01" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-edit-stock">Stock</Label>
                <Input id="product-edit-stock" type="number" min="0" step="1" value={editForm.stock} onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProduct(null)} disabled={updateProduct.isPending}>Cancel</Button>
            <Button onClick={() => updateProduct.mutate()} disabled={updateProduct.isPending}>
              {updateProduct.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewProductDialog({ onCreated, storeId }: { onCreated: () => void; storeId?: string }) {
  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    price: "",
    cost: "",
    stock: "0",
    taxable: true,
    is_favorite: false,
    age_restricted: false,
    min_age: "21",
    age_category: "alcohol",
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
      toast.success(
        `Loaded from ${result.source === "openfoodfacts" ? "Open Food Facts" : "UPC database"}`,
      );
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
    if (!storeId) { setBusy(false); return toast.error("Store not found"); }
    const sku = form.sku.trim() || null, barcode = form.barcode.trim() || null;
    const { data: duplicates } = await supabase.from("products").select("id,name,sku,barcode").eq("store_id", storeId);
    const allDrafts = loadInventoryDrafts(storeId);
    const duplicate = (duplicates ?? []).find((p: any) => (sku && p.sku?.toLowerCase() === sku.toLowerCase()) || (barcode && p.barcode === barcode)) || allDrafts.find((d) => (sku && String(d.changes?.sku ?? "").toLowerCase() === sku.toLowerCase()) || (barcode && d.changes?.barcode === barcode));
    if (duplicate) { setBusy(false); return toast.error("That SKU or barcode already exists"); }
    const id = crypto.randomUUID();
    saveInventoryDraft(storeId, { id: crypto.randomUUID(), operation: "create", productId: id, changes: { name: form.name.trim(), sku, barcode, price: Number(form.price) || 0, cost: Number(form.cost) || 0, stock: Number(form.stock) || 0, taxable: form.taxable, is_favorite: form.is_favorite, image_url: imagePath, age_restricted: form.age_restricted, min_age: form.age_restricted ? Number(form.min_age) || 21 : null, age_category: form.age_restricted ? form.age_category : null, status: "active" }, createdAt: new Date().toISOString() });
    setBusy(false);
    toast.success("Product saved as draft. Press Publish when ready.");
    onCreated();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New product</DialogTitle>
      </DialogHeader>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin mr-1" />
              ) : (
                <Upload className="size-3.5 mr-1" />
              )}
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
          <Input
            id="name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
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
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setScanning(true)}
                title="Scan with camera"
                aria-label="Scan barcode with camera"
              >
                <Camera className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => runLookup(form.barcode)}
                disabled={looking}
                title="Auto-fill from barcode database"
                aria-label="Look up product by barcode"
              >
                {looking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A USB/Bluetooth scanner that sends Enter will look up the item automatically.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Cost</Label>
            <Input
              type="number"
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Price</Label>
            <Input
              type="number"
              step="0.01"
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Stock</Label>
            <Input
              type="number"
              step="1"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="taxable">Taxable</Label>
          <Switch
            id="taxable"
            checked={form.taxable}
            onCheckedChange={(v) => setForm({ ...form, taxable: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="fav">Show on checkout favorites</Label>
          <Switch
            id="fav"
            checked={form.is_favorite}
            onCheckedChange={(v) => setForm({ ...form, is_favorite: v })}
          />
        </div>
        <div className="rounded-md border p-3 space-y-3 bg-surface/40">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="age_restricted" className="font-medium">
                Age restricted
              </Label>
              <p className="text-xs text-muted-foreground">Requires ID verification at checkout.</p>
            </div>
            <Switch
              id="age_restricted"
              checked={form.age_restricted}
              onCheckedChange={(v) => setForm({ ...form, age_restricted: v })}
            />
          </div>
          {form.age_restricted && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Minimum age</Label>
                <Input
                  type="number"
                  min={13}
                  max={99}
                  value={form.min_age}
                  onChange={(e) => setForm({ ...form, min_age: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={form.age_category}
                  onChange={(e) => setForm({ ...form, age_category: e.target.value })}
                >
                  {[
                    "alcohol",
                    "beer",
                    "wine",
                    "spirits",
                    "tobacco",
                    "cigarettes",
                    "cigars",
                    "vape",
                    "nicotine",
                    "lottery",
                    "other",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c[0].toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin mr-2" />}Create
          </Button>
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
