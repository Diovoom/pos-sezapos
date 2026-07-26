// Restricted Cashier Quick-Add Product dialog.
//
// Native-only surface (gated by callers via isNativeMode). Uses the existing
// products table via RLS — the server enforces store scope and the
// products.create / products.quick_add permission. On success, returns the
// created product to the caller (typically added to the current cart line).
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-log";

export type QuickAddedProduct = {
  id: string;
  name: string;
  price: number;
  cost: number | null;
  sku: string | null;
  barcode: string | null;
  stock: number;
  taxable: boolean;
  category_id: string | null;
  is_favorite: boolean;
  store_id: string | null;
  image_url: string | null;
  age_restricted: boolean;
  min_age: number | null;
  age_category: string | null;
};

export function QuickAddProductDialog({
  open,
  onOpenChange,
  storeId,
  initialBarcode,
  defaultTaxable,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string | null;
  initialBarcode?: string;
  defaultTaxable?: boolean;
  onCreated: (p: QuickAddedProduct) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setPrice("");
      setBarcode(initialBarcode ?? "");
      setTaxable(defaultTaxable ?? true);
      setBusy(false);
    }
  }, [open, initialBarcode, defaultTaxable]);

  const submit = async () => {
    const trimmed = name.trim();
    const p = Number(price);
    if (!trimmed) return toast.error("Enter a product name");
    if (!Number.isFinite(p) || p < 0 || p > 1_000_000) return toast.error("Enter a valid price");
    if (!storeId) return toast.error("Store isn't loaded yet — try again in a moment.");
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)("products")
        .insert({
          store_id: storeId,
          name: trimmed,
          price: p,
          cost: 0,
          barcode: barcode.trim() || null,
          stock: 0,
          taxable,
          status: "active",
          is_favorite: false,
        })
        .select(
          "id,name,price,cost,sku,barcode,stock,taxable,category_id,is_favorite,store_id,image_url,age_restricted,min_age,age_category",
        )
        .single();
      if (error || !data) {
        const msg =
          error?.code === "42501"
            ? "You don't have permission to add products. Ask a manager to enable Quick Add for cashiers."
            : error?.message || "Could not create product";
        toast.error(msg);
        return;
      }
      void logAudit({
        action: "products.quick_add",
        entity: "product",
        entity_id: data.id,
        details: {
          name: trimmed,
          price: p,
          barcode: barcode.trim() || null,
          source: "pos_quick_add",
        },
      }).catch(() => {
        /* audit failure never blocks */
      });
      toast.success(`Added ${trimmed}`);
      onCreated(data as QuickAddedProduct);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick add product</DialogTitle>
          <DialogDescription>
            Create a product on the fly. It is saved to your catalog and can be edited later from
            the dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Iced Coffee"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Price</Label>
              <Input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
            <div className="space-y-1">
              <Label>Barcode</Label>
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.trim())}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label>Taxable</Label>
            <Switch checked={taxable} onCheckedChange={setTaxable} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim() || !price}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add to cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
