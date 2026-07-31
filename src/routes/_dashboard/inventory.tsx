import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Package,
  AlertTriangle,
  XCircle,
  Tags,
  Plus,
  Upload,
  Download,
  ImageIcon,
  ArrowUpDown,
  Loader2,
  Pencil,
  Trash2,
  Power,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCurrency } from "@/lib/format";
import { useProductImageUrl } from "@/lib/pos/product-images";
import { toast } from "sonner";
import { applyInventoryDrafts, loadInventoryDrafts, saveInventoryDraft } from "@/lib/inventory-drafts";

export const Route = createFileRoute("/_dashboard/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory  -  SEZA POS" },
      {
        name: "description",
        content: "Manage products, stock levels, categories, and inventory in real time.",
      },
    ],
  }),
  component: InventoryPage,
});

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  image_url: string | null;
  category_id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  status?: string | null;
};

type CategoryRow = { id: string; name: string };

type StockFilter = "all" | "in" | "low" | "out";
type SortKey = "name" | "stock" | "price" | "updated";

const PAGE_SIZE = 25;

type InventoryEditForm = {
  name: string;
  sku: string;
  barcode: string;
  cost: string;
  price: string;
  stock: string;
  min_stock: string;
};

function productToEditForm(product: ProductRow): InventoryEditForm {
  return {
    name: product.name,
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    cost: String(product.cost ?? 0),
    price: String(product.price ?? 0),
    stock: String(product.stock ?? 0),
    min_stock: String(product.min_stock ?? 0),
  };
}

function statusOf(p: ProductRow): "in" | "low" | "out" {
  const s = Number(p.stock);
  if (s <= 0) return "out";
  if (s <= Number(p.min_stock ?? 0)) return "low";
  return "in";
}

function StatusBadge({ status }: { status: "in" | "low" | "out" }) {
  const map = {
    in: "bg-success/10 text-success border-success/30",
    low: "bg-warning/15 text-warning border-warning/30",
    out: "bg-destructive/10 text-destructive border-destructive/30",
  } as const;
  const label = status === "in" ? "In Stock" : status === "low" ? "Low Stock" : "Out of Stock";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
        map[status],
      )}
    >
      {label}
    </span>
  );
}

function Thumb({ path }: { path: string | null }) {
  const url = useProductImageUrl(path);
  if (!url) {
    return (
      <div className="size-10 rounded-lg bg-muted grid place-items-center text-muted-foreground shrink-0">
        <ImageIcon className="size-4" />
      </div>
    );
  }
  return <img src={url} alt="" className="size-10 rounded-lg object-cover shrink-0" />;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "primary" | "warning" | "destructive" | "success";
  href?: string;
}) {
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/15 text-success",
  };
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("size-12 rounded-2xl grid place-items-center", toneMap[tone])}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
            {label}
          </div>
          <div className="text-2xl font-bold mt-0.5 tabular-nums">{value}</div>
          {href && (
            <Link to={href} className="text-xs text-primary hover:underline">
              View →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InventoryPage() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<ProductRow | null>(null);
  const [editForm, setEditForm] = useState<InventoryEditForm | null>(null);
  const [draftTick, setDraftTick] = useState(0);
  const queryClient = useQueryClient();

  const refreshProducts = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inventory-products"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
    ]);
  };

  const updateProduct = useMutation({
    mutationFn: async () => {
      if (!editingProduct || !editForm || !store?.id) throw new Error("No product selected");
      const price = Number(editForm.price), cost = Number(editForm.cost), stock = Number(editForm.stock), minStock = Number(editForm.min_stock);
      if (!editForm.name.trim()) throw new Error("Product name is required");
      if (![price, cost, stock, minStock].every(Number.isFinite) || [price, cost, stock, minStock].some((n) => n < 0)) throw new Error("Enter valid non-negative numbers");
      const sku = editForm.sku.trim() || null, barcode = editForm.barcode.trim() || null;
      const duplicate = draftedProducts.find((p) => p.id !== editingProduct.id && ((sku && p.sku?.toLowerCase() === sku.toLowerCase()) || (barcode && p.barcode === barcode)));
      if (duplicate) throw new Error(sku && duplicate.sku?.toLowerCase() === sku.toLowerCase() ? `SKU already belongs to ${duplicate.name}` : `Barcode already belongs to ${duplicate.name}`);
      saveInventoryDraft(store.id, { id: crypto.randomUUID(), operation: "update", productId: editingProduct.id, original: editingProduct as any, changes: { name: editForm.name.trim(), sku, barcode, price, cost, stock, min_stock: minStock }, createdAt: new Date().toISOString() });
    },
    onSuccess: () => { toast.success("Saved as unpublished change"); setEditingProduct(null); setEditForm(null); setDraftTick((v) => v + 1); },
    onError: (error: Error) => toast.error(error.message || "Could not save product"),
  });

  const deleteProduct = useMutation({
    mutationFn: async () => {
      if (!deletingProduct || !store?.id) throw new Error("No product selected");
      saveInventoryDraft(store.id, { id: crypto.randomUUID(), operation: "delete", productId: deletingProduct.id, original: deletingProduct as any, createdAt: new Date().toISOString() });
    },
    onSuccess: () => { toast.success("Delete staged. Publish to remove it from POS."); setDeletingProduct(null); setDraftTick((v) => v + 1); },
    onError: (error: Error) => toast.error(error.message || "Could not stage deletion"),
  });

  const stageStatus = (product: ProductRow) => {
    if (!store?.id) return;
    const status = product.status === "inactive" ? "active" : "inactive";
    saveInventoryDraft(store.id, { id: crypto.randomUUID(), operation: "update", productId: product.id, original: product as any, changes: { status }, createdAt: new Date().toISOString() });
    toast.success(`${product.name} will be ${status} after publishing`);
    setDraftTick((v) => v + 1);
  };

  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () =>
      (await supabase.from("stores").select("id,currency").limit(1).maybeSingle()).data,
  });
  const currency = store?.currency ?? "USD";

  const { data: categories = [] } = useQuery<CategoryRow[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id,name").order("name");
      return (data as CategoryRow[]) ?? [];
    },
  });

  const { data: products = [], isLoading } = useQuery<ProductRow[]>({
    queryKey: ["inventory-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select(
          "id,name,sku,barcode,price,cost,stock,min_stock,image_url,category_id,updated_at,created_at,status",
        )
        .order("name");
      return (data as ProductRow[]) ?? [];
    },
  });

  void draftTick;
  const draftedProducts = store?.id ? applyInventoryDrafts(products, loadInventoryDrafts(store.id)) : products;

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const summary = useMemo(() => {
    let total = 0,
      low = 0,
      out = 0;
    for (const p of draftedProducts) {
      total++;
      const s = statusOf(p);
      if (s === "low") low++;
      else if (s === "out") out++;
    }
    return { total, low, out, categories: categories.length };
  }, [draftedProducts, categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = draftedProducts.filter((p) => {
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (stockFilter !== "all" && statusOf(p) !== stockFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku?.toLowerCase().includes(q) ?? false) ||
        (p.barcode?.toLowerCase().includes(q) ?? false)
      );
    });
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "stock":
          cmp = Number(a.stock) - Number(b.stock);
          break;
        case "price":
          cmp = Number(a.price) - Number(b.price);
          break;
        case "updated":
          cmp =
            new Date(a.updated_at ?? a.created_at ?? 0).getTime() -
            new Date(b.updated_at ?? b.created_at ?? 0).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [draftedProducts, search, categoryId, stockFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const exportCsv = () => {
    const header = [
      "Name",
      "SKU",
      "Barcode",
      "Category",
      "Cost",
      "Price",
      "Stock",
      "Min Stock",
      "Status",
    ];
    const lines = [header.join(",")];
    for (const p of filtered) {
      lines.push(
        [
          JSON.stringify(p.name),
          JSON.stringify(p.sku ?? ""),
          JSON.stringify(p.barcode ?? ""),
          JSON.stringify(p.category_id ? (categoryMap.get(p.category_id) ?? "") : ""),
          Number(p.cost).toFixed(2),
          Number(p.price).toFixed(2),
          Number(p.stock),
          Number(p.min_stock ?? 0),
          statusOf(p),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Manage your products, stock levels, and inventory in real time."
        actions={
          <>
            <Button asChild size="sm">
              <Link to="/products">
                <Plus className="size-4 mr-1.5" /> Add Product
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/products">
                <Upload className="size-4 mr-1.5" /> Import
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4 mr-1.5" /> Export
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard icon={Package} label="Total Products" value={summary.total} tone="primary" />
          <SummaryCard icon={AlertTriangle} label="Low Stock" value={summary.low} tone="warning" />
          <SummaryCard icon={XCircle} label="Out of Stock" value={summary.out} tone="destructive" />
          <SummaryCard icon={Tags} label="Categories" value={summary.categories} tone="success" />
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search products, SKU, or barcode"
              aria-label="Search products"
              className="pl-10 h-11 rounded-xl"
            />
          </div>
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-11 rounded-xl lg:w-56">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stock filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "in", "low", "out"] as StockFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => {
                setStockFilter(f);
                setPage(1);
              }}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium border transition-colors",
                stockFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:bg-accent border-border",
              )}
            >
              {f === "all"
                ? "All"
                : f === "in"
                  ? "In Stock"
                  : f === "low"
                    ? "Low Stock"
                    : "Out of Stock"}
            </button>
          ))}
          <div className="ml-auto text-xs text-muted-foreground">
            Sort by:{" "}
            <button
              onClick={() => toggleSort(sortKey)}
              className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
            >
              {sortKey === "name"
                ? "Name"
                : sortKey === "stock"
                  ? "Stock"
                  : sortKey === "price"
                    ? "Price"
                    : "Updated"}
              <ArrowUpDown className="size-3" />
            </button>
          </div>
        </div>

        {/* Table */}
        <Card className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50">
                  <TableHead className="w-14"></TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>
                    Product
                  </TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => toggleSort("price")}
                  >
                    Cost
                  </TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => toggleSort("stock")}
                  >
                    Stock
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("updated")}>
                    Updated
                  </TableHead>
                  <TableHead className="w-[150px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-16">
                      <Loader2 className="size-6 animate-spin inline text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-16 text-muted-foreground">
                      No products match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((p) => {
                    const status = statusOf(p);
                    const catName = p.category_id ? categoryMap.get(p.category_id) : null;
                    const updated = p.updated_at ?? p.created_at;
                    return (
                      <TableRow key={p.id} className="hover:bg-surface/50">
                        <TableCell>
                          <Thumb path={p.image_url} />
                        </TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {p.sku ?? " - "}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {p.barcode ?? " - "}
                        </TableCell>
                        <TableCell className="text-sm">
                          {catName ?? <span className="text-muted-foreground"> - </span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmtCurrency(Number(p.cost), currency)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {fmtCurrency(Number(p.price), currency)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono font-semibold",
                            status === "out" && "text-destructive",
                            status === "low" && "text-warning",
                          )}
                        >
                          {Number(p.stock)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={status} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {updated ? new Date(updated).toLocaleDateString() : " - "}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingProduct(p);
                                setEditForm(productToEditForm(p));
                              }}
                            >
                              <Pencil className="mr-1.5 size-3.5" /> Edit
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => stageStatus(p)}>
                              <Power className="mr-1.5 size-3.5" /> {p.status === "inactive" ? "Activate" : "Deactivate"}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeletingProduct(p)}>
                              <Trash2 className="mr-1.5 size-3.5" /> Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)}{" "}
              of {filtered.length} results
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="px-3 text-sm font-medium">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(editingProduct && editForm)}
        onOpenChange={(open) => {
          if (!open && !updateProduct.isPending) {
            setEditingProduct(null);
            setEditForm(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit inventory item</DialogTitle>
            <DialogDescription>
              Change the product details, price, or current stock without leaving inventory.
            </DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="inventory-edit-name">Product name</Label>
                <Input
                  id="inventory-edit-name"
                  value={editForm.name}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inventory-edit-sku">SKU</Label>
                  <Input
                    id="inventory-edit-sku"
                    value={editForm.sku}
                    onChange={(event) => setEditForm({ ...editForm, sku: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inventory-edit-barcode">Barcode</Label>
                  <Input
                    id="inventory-edit-barcode"
                    value={editForm.barcode}
                    onChange={(event) => setEditForm({ ...editForm, barcode: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inventory-edit-cost">Cost</Label>
                  <Input
                    id="inventory-edit-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.cost}
                    onChange={(event) => setEditForm({ ...editForm, cost: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inventory-edit-price">Selling price</Label>
                  <Input
                    id="inventory-edit-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.price}
                    onChange={(event) => setEditForm({ ...editForm, price: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inventory-edit-stock">Current stock</Label>
                  <Input
                    id="inventory-edit-stock"
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.stock}
                    onChange={(event) => setEditForm({ ...editForm, stock: event.target.value })}
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[1, 5, 10, 25].map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          setEditForm({
                            ...editForm,
                            stock: String(Math.max(0, Number(editForm.stock || 0)) + amount),
                          })
                        }
                      >
                        +{amount}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inventory-edit-min-stock">Low-stock alert</Label>
                  <Input
                    id="inventory-edit-min-stock"
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.min_stock}
                    onChange={(event) =>
                      setEditForm({ ...editForm, min_stock: event.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingProduct(null);
                setEditForm(null);
              }}
              disabled={updateProduct.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => updateProduct.mutate()} disabled={updateProduct.isPending}>
              {updateProduct.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Save
              changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletingProduct)}
        onOpenChange={(open) => !open && !deleteProduct.isPending && setDeletingProduct(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete product?</DialogTitle>
            <DialogDescription>
              {deletingProduct
                ? `This stages “${deletingProduct.name}” for deletion. It stays on the POS until you press Publish.`
                : "This permanently removes the selected product."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingProduct(null)}
              disabled={deleteProduct.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteProduct.mutate()}
              disabled={deleteProduct.isPending}
            >
              {deleteProduct.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Stage delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
