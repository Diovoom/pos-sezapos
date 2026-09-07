import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtCurrency } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currency: string;
  onAdd: (item: { name: string; price: number; taxable: boolean }) => void;
};

export function CustomItemDialog({ open, onOpenChange, currency, onAdd }: Props) {
  const [name, setName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [taxable, setTaxable] = useState(true);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setPriceText("");
      setTaxable(true);
    }
  }, [open]);

  const price = Number(priceText) || 0;
  const priceValid = price > 0;

  const updatePrice = (value: string) => {
    const normalized = value.replace(/[^0-9.]/g, "");
    const [whole = "", ...rest] = normalized.split(".");
    const decimal = rest.join("").slice(0, 2);
    const safeWhole = whole.replace(/^0+(?=\d)/, "").slice(0, 7);

    setPriceText(
      normalized.includes(".")
        ? `${safeWhole || "0"}.${decimal}`
        : safeWhole,
    );
  };

  const submit = () => {
    if (!priceValid) return;
    onAdd({ name: name.trim() || "Custom item", price, taxable });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Open item</DialogTitle>
          <DialogDescription>Enter an item name and price.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Item name</Label>
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
              placeholder="Custom item"
              maxLength={80}
            />
          </div>

          <div className="space-y-1">
            <Label>Price</Label>
            <Input
              ref={priceRef}
              type="number"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              min="0"
              step="0.01"
              value={priceText}
              onChange={(e) => updatePrice(e.target.value)}
              placeholder="0.00"
              aria-label="Item price"
              className="h-12 text-right text-xl font-mono"
            />
            <div className="text-right text-sm text-muted-foreground">
              {fmtCurrency(price, currency)}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={taxable}
              onChange={(e) => setTaxable(e.target.checked)}
            />
            Taxable
          </label>

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-[2] h-12" disabled={!priceValid} onClick={submit}>
              Add to cart
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
