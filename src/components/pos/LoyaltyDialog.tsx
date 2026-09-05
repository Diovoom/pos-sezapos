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
import { Badge } from "@/components/ui/badge";
import { fmtCurrency } from "@/lib/format";
import { Gift, Sparkles } from "lucide-react";

export type LoyaltyCustomer = {
  identifier: string; // phone or email
  points: number;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subtotal: number;
  currency: string;
  pointsPerDollar?: number;
  redemptionRate?: number; // dollars per 100 points; default $1 / 100 pts
  current: LoyaltyCustomer | null;
  redemption: number; // $ off already applied
  onApply: (customer: LoyaltyCustomer | null, redemptionAmount: number) => void;
};

const LS_KEY = "pos.loyalty.customers.v1";

function loadCustomers(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function saveCustomers(map: Record<string, number>) {
  localStorage.setItem(LS_KEY, JSON.stringify(map));
}

export function LoyaltyDialog({
  open,
  onOpenChange,
  subtotal,
  currency,
  pointsPerDollar = 1,
  redemptionRate = 1,
  current,
  redemption,
  onApply,
}: Props) {
  const [identifier, setIdentifier] = useState(current?.identifier ?? "");
  const [points, setPoints] = useState<number>(current?.points ?? 0);
  const [redeem, setRedeem] = useState<string>(redemption > 0 ? String(redemption) : "");

  useEffect(() => {
    if (!open) return;
    setIdentifier(current?.identifier ?? "");
    setPoints(current?.points ?? 0);
    setRedeem(redemption > 0 ? String(redemption) : "");
  }, [open, current, redemption]);

  const lookup = () => {
    const key = identifier.trim().toLowerCase();
    if (!key) return;
    const map = loadCustomers();
    const pts = map[key] ?? 0;
    if (!(key in map)) {
      map[key] = 0;
      saveCustomers(map);
    }
    setPoints(pts);
  };

  const maxRedemption = Math.min(subtotal, (points * redemptionRate) / 100);
  const redeemNum = Math.min(maxRedemption, Number(redeem) || 0);
  const earnPreview = Math.floor((subtotal - redeemNum) * pointsPerDollar);

  const apply = () => {
    const key = identifier.trim().toLowerCase();
    if (!key) {
      onApply(null, 0);
      onOpenChange(false);
      return;
    }
    onApply({ identifier: key, points }, redeemNum);
    onOpenChange(false);
  };

  const remove = () => {
    onApply(null, 0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="size-5 text-primary" /> Loyalty
          </DialogTitle>
          <DialogDescription>
            Look up a customer to earn or redeem loyalty points on this sale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Phone or email</Label>
          <div className="flex gap-2">
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="(555) 123-4567 or name@example.com"
              className="text-base h-11"
            />
            <Button variant="outline" onClick={lookup}>
              Look up
            </Button>
          </div>
        </div>

        {identifier && (
          <div className="rounded-md bg-muted/50 p-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span className="text-muted-foreground">Available points</span>
            </div>
            <Badge variant="outline" className="font-mono">
              {points.toLocaleString()}
            </Badge>
          </div>
        )}

        <div className="space-y-2">
          <Label>Redeem for discount</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            max={maxRedemption}
            value={redeem}
            onChange={(e) => setRedeem(e.target.value)}
            placeholder={`Up to ${fmtCurrency(maxRedemption, currency)}`}
            className="text-lg h-11"
            disabled={!identifier || points <= 0}
          />
          <p className="text-[11px] text-muted-foreground">
            {redemptionRate * 100} points = {fmtCurrency(redemptionRate, currency)}. Earning:{" "}
            {earnPreview.toLocaleString()} pts on this sale.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {current && (
            <Button variant="ghost" onClick={remove}>
              Remove
            </Button>
          )}
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Persist earning after a completed sale. Fire-and-forget. */
export function accrueLoyaltyPoints(identifier: string, points: number) {
  const key = identifier.trim().toLowerCase();
  if (!key || points <= 0) return;
  const map = loadCustomers();
  map[key] = (map[key] ?? 0) + points;
  saveCustomers(map);
}

/** Deduct redeemed points. */
export function spendLoyaltyPoints(identifier: string, points: number) {
  const key = identifier.trim().toLowerCase();
  if (!key || points <= 0) return;
  const map = loadCustomers();
  map[key] = Math.max(0, (map[key] ?? 0) - points);
  saveCustomers(map);
}
