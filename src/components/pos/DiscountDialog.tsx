import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtCurrency } from "@/lib/format";

export type DiscountValue = { mode: "percent" | "amount"; value: number };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subtotal: number;
  currency: string;
  current: DiscountValue | null;
  onApply: (d: DiscountValue | null) => void;
};

export function DiscountDialog({ open, onOpenChange, subtotal, currency, current, onApply }: Props) {
  const [mode, setMode] = useState<"percent" | "amount">(current?.mode ?? "percent");
  const [value, setValue] = useState<string>(current ? String(current.value) : "");

  useEffect(() => {
    if (open) {
      setMode(current?.mode ?? "percent");
      setValue(current ? String(current.value) : "");
    }
  }, [open, current]);

  const num = Number(value) || 0;
  const preview = mode === "percent"
    ? Math.min(subtotal, (subtotal * num) / 100)
    : Math.min(subtotal, num);

  const apply = () => {
    if (num <= 0) { onApply(null); onOpenChange(false); return; }
    onApply({ mode, value: num });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Apply discount</DialogTitle>
          <DialogDescription>Applies to the entire cart subtotal.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button variant={mode === "percent" ? "default" : "outline"} onClick={() => setMode("percent")}>Percentage %</Button>
          <Button variant={mode === "amount" ? "default" : "outline"} onClick={() => setMode("amount")}>Amount $</Button>
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

        <div className="rounded-md bg-muted/50 p-3 flex justify-between text-sm">
          <span className="text-muted-foreground">Discount preview</span>
          <span className="font-mono font-semibold">− {fmtCurrency(preview, currency)}</span>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {current && (
            <Button variant="ghost" onClick={() => { onApply(null); onOpenChange(false); }}>Remove discount</Button>
          )}
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
