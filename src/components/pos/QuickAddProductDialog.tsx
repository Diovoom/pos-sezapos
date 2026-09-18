// Restricted Cashier Quick-Add Product dialog.
//
// Native-only surface (gated by callers via isNativeMode). Uses the existing
// products table via RLS  -  the server enforces store scope and the
// products.create / products.quick_add permission. On success, returns the
// created product to the caller (typically added to the current cart line).
import { useEffect, useRef, useState } from "react";
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
import { saveInventoryDraft } from "@/lib/inventory-drafts";
import { isOnlineNow } from "@/lib/offline/useOnline";
import { userFacingError } from "@/lib/errors/user-facing";

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
  const priceRef = useRef<HTMLInputElement>(null);

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
    if (!storeId) return toast.error("Store isn't loaded yet  -  try again in a moment.");
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const localProduct: QuickAddedProduct = {
        id,
        name: trimmed,
        price: p,
        cost: 0,
        sku: null,
        barcode: barcode.trim() || null,
        stock: 0,
        taxable,
        category_id: null,
        is_favorite: false,
        store_id: storeId,
        image_url: null,
        age_restricted: false,
        min_age: null,
        age_category: null,
      };

      // Always commit to the local catalog first. saveInventoryDraft also
      // writes the IndexedDB product cache and durable cloud-sync queue, so a
      // Wi-Fi drop between tapping Add and the server response cannot lose the
      // product. When online, the sync worker starts immediately.
      saveInventoryDraft(storeId, {
        id: crypto.randomUUID(),
        operation: "create",
        productId: id,
        changes: {
          name: trimmed,
          price: p,
          cost: 0,
          sku: null,
          barcode: barcode.trim() || null,
          stock: 0,
          taxable,
          category_id: null,
          is_favorite: false,
          store_id: storeId,
          image_url: null,
          age_restricted: false,
          min_age: null,
          age_category: null,
          status: "active",
        },
        createdAt: new Date().toISOString(),
      });

      void logAudit({
        action: "products.quick_add",
        entity: "product",
        entity_id: id,
        details: {
          name: trimmed,
          price: p,
          barcode: barcode.trim() || null,
          source: "pos_quick_add",
          local_first: true,
        },
      }).catch(() => {
        /* audit failure never blocks */
      });
      toast.success(
        isOnlineNow()
          ? `Added ${trimmed} · syncing automatically`
          : `Added ${trimmed} offline · will sync automatically`,
      );
      onCreated(localProduct);
      onOpenChange(false);
    } catch (error) {
      toast.error(userFacingError(error, "Could not save this product. Please try again."));
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
              type="text"
              inputMode="text"
              enterKeyHint="next"
              autoCapitalize="words"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  priceRef.current?.focus();
                }
              }}
              placeholder="e.g. Iced Coffee"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Price</Label>
              <Input
                ref={priceRef}
                type="number"
                inputMode="decimal"
                enterKeyHint="next"
                autoComplete="off"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => {
                  const normalized = e.target.value.replace(/[^0-9.]/g, "");
                  const [whole = "", ...rest] = normalized.split(".");
                  const decimal = rest.join("").slice(0, 2);
                  setPrice(
                    normalized.includes(".")
                      ? `${whole || "0"}.${decimal}`
                      : whole,
                  );
                }}
                placeholder="0.00"
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
