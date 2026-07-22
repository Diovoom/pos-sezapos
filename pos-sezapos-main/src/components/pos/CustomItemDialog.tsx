import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtCurrency } from "@/lib/format";
import { Delete } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currency: string;
  onAdd: (item: { name: string; price: number; taxable: boolean }) => void;
};

export function CustomItemDialog({ open, onOpenChange, currency, onAdd }: Props) {
  const [raw, setRaw] = useState(""); // digits only, cents
  const [name, setName] = useState("");
  const [taxable, setTaxable] = useState(true);

  useEffect(() => {
    if (!open) { setRaw(""); setName(""); setTaxable(true); }
  }, [open]);

  const cents = raw === "" ? 0 : parseInt(raw, 10);
  const price = cents / 100;
  const priceValid = price > 0;

  const push = (d: string) => {
    if (raw.length >= 9) return;
    if (d === "." || d === "00") {
      // ignore — we always accumulate as cents; "00" convenience
      if (d === "00") setRaw((r) => (r === "" ? "" : r + "00"));
      return;
    }
    setRaw((r) => (r === "" && d === "0" ? "" : r + d));
  };
  const back = () => setRaw((r) => r.slice(0, -1));
  const clear = () => setRaw("");

  const submit = () => {
    if (!priceValid) return;
    onAdd({ name: name.trim() || "Custom item", price, taxable });
    onOpenChange(false);
  };

  const Key = ({ label, onClick, variant = "outline", className = "" }: {
    label: React.ReactNode; onClick: () => void; variant?: "outline" | "default" | "destructive" | "secondary"; className?: string;
  }) => (
    <Button
      type="button"
      variant={variant}
      onClick={onClick}
      className={`h-14 text-xl font-semibold ${className}`}
    >
      {label}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add custom item</DialogTitle>
          <DialogDescription>Enter a price (required) and an optional name.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/40 p-4 text-right">
            <div className="text-[10px] uppercase text-muted-foreground">Price</div>
            <div className="font-mono text-3xl font-bold">{fmtCurrency(price, currency)}</div>
          </div>

          <div className="space-y-1">
            <Label>Item name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Custom item" maxLength={80} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {["1","2","3","4","5","6","7","8","9"].map((n) => (
              <Key key={n} label={n} onClick={() => push(n)} />
            ))}
            <Key label="00" onClick={() => push("00")} />
            <Key label="0" onClick={() => push("0")} />
            <Key label={<Delete className="size-5" />} onClick={back} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
            Taxable
          </label>

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={clear}>Clear</Button>
            <Button className="flex-[2] h-12" disabled={!priceValid} onClick={submit}>
              Add to cart
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
