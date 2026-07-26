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
import { fmtCurrency } from "@/lib/format";
import { toast } from "sonner";

export type DiscountValue = {
  mode: "percent" | "amount";
  value: number;
  code?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subtotal: number;
  currency: string;
  current: DiscountValue | null;
  onApply: (d: DiscountValue | null) => void;
};

// Simple built-in coupon table. Real stores would fetch from the DB.
const COUPONS: Record<string, { mode: "percent" | "amount"; value: number; label: string }> = {
  WELCOME10: { mode: "percent", value: 10, label: "10% off (WELCOME10)" },
  SAVE5: { mode: "amount", value: 5, label: "$5 off (SAVE5)" },
  VIP20: { mode: "percent", value: 20, label: "20% off (VIP20)" },
};

export function DiscountDialog({
  open,
  onOpenChange,
  subtotal,
  currency,
  current,
  onApply,
}: Props) {
  const [mode, setMode] = useState<"percent" | "amount">(current?.mode ?? "percent");
  const [value, setValue] = useState<string>(current ? String(current.value) : "");
  const [code, setCode] = useState<string>(current?.code ?? "");

  useEffect(() => {
    if (open) {
      setMode(current?.mode ?? "percent");
      setValue(current ? String(current.value) : "");
      setCode(current?.code ?? "");
    }
  }, [open, current]);

  const num = Number(value) || 0;
  const preview =
    mode === "percent" ? Math.min(subtotal, (subtotal * num) / 100) : Math.min(subtotal, num);

  const applyCoupon = () => {
    const key = code.trim().toUpperCase();
    if (!key) return;
    const c = COUPONS[key];
    if (!c) {
      toast.error("Invalid coupon code");
      return;
    }
    setMode(c.mode);
    setValue(String(c.value));
    toast.success(`Applied ${c.label}`);
  };

  const apply = () => {
    if (num <= 0) {
      onApply(null);
      onOpenChange(false);
      return;
    }
    onApply({ mode, value: num, code: code.trim().toUpperCase() || null });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Apply discount</DialogTitle>
          <DialogDescription>
            Percentage, amount, or coupon code. Applies to the cart subtotal.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={mode === "percent" ? "default" : "outline"}
            onClick={() => setMode("percent")}
          >
            Percentage %
          </Button>
          <Button
            variant={mode === "amount" ? "default" : "outline"}
            onClick={() => setMode("amount")}
          >
            Amount $
          </Button>
        </div>

        <div className="space-y-1">
          <Label>{mode === "percent" ? "Percent off" : "Amount off"}</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step={mode === "percent" ? "1" : "0.01"}
            max={mode === "percent" ? "100" : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={mode === "percent" ? "10" : "5.00"}
            className="text-xl h-12"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {(mode === "percent" ? [5, 10, 15, 20] : [1, 5, 10, 20]).map((n) => (
            <Button key={n} variant="outline" onClick={() => setValue(String(n))}>
              {mode === "percent" ? `${n}%` : `$${n}`}
            </Button>
          ))}
        </div>

        <div className="space-y-1 pt-1 border-t">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Coupon code
          </Label>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. WELCOME10"
              className="uppercase"
              onKeyDown={(e) => {
                if (e.key === "Enter") applyCoupon();
              }}
            />
            <Button variant="outline" onClick={applyCoupon}>
              Apply
            </Button>
          </div>
        </div>

        <div className="rounded-md bg-muted/50 p-3 flex justify-between text-sm">
          <span className="text-muted-foreground">Discount preview</span>
          <span className="font-mono font-semibold">− {fmtCurrency(preview, currency)}</span>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {current && (
            <Button
              variant="ghost"
              onClick={() => {
                onApply(null);
                onOpenChange(false);
              }}
            >
              Remove discount
            </Button>
          )}
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
