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
import { cn } from "@/lib/utils";
import {
  Loader2,
  CreditCard,
  Banknote,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wifi,
} from "lucide-react";
import {
  getProvider,
  type PaymentEvent,
  type PaymentResult,
  type PaymentStatus,
} from "@/lib/pos/payment-terminal";

export type PaymentMethod =
  | "cash"
  | "card"
  | "tap"
  | "apple_pay"
  | "google_pay"
  | "gift_card";

export type CompletedPayment = {
  method: PaymentMethod;
  amountTendered: number;
  changeDue: number;
  reference?: string;
  cardBrand?: string;
  last4?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  method: PaymentMethod;
  total: number;
  currency: string;
  onComplete: (p: CompletedPayment) => void;
};

export function PaymentDialog({ open, onOpenChange, method, total, currency, onComplete }: Props) {
  const isCash = method === "cash";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {isCash ? (
          <CashPanel total={total} currency={currency} onComplete={onComplete} onCancel={() => onOpenChange(false)} />
        ) : (
          <TerminalPanel
            key={String(open)}
            method={method}
            total={total}
            currency={currency}
            onComplete={onComplete}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------- Cash -------- */

const QUICK = [1, 5, 10, 20, 50, 100];

function CashPanel({
  total,
  currency,
  onComplete,
  onCancel,
}: {
  total: number;
  currency: string;
  onComplete: (p: CompletedPayment) => void;
  onCancel: () => void;
}) {
  const [tenderedStr, setTenderedStr] = useState("");
  const tendered = Number(tenderedStr) || 0;
  const change = Math.max(0, Math.round((tendered - total) * 100) / 100);
  const short = Math.max(0, Math.round((total - tendered) * 100) / 100);
  const ok = tendered >= total && total > 0;

  return (
    <div>
      <DialogHeader className="p-6 pb-4 border-b">
        <DialogTitle className="flex items-center gap-2">
          <Banknote className="size-5 text-primary" /> Cash payment
        </DialogTitle>
        <DialogDescription>
          Total due <span className="font-mono font-semibold text-foreground">{fmtCurrency(total, currency)}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="p-6 space-y-4">
        <div className="space-y-2">
          <Label>Amount received</Label>
          <Input
            autoFocus
            type="number"
            inputMode="decimal"
            step="0.01"
            value={tenderedStr}
            onChange={(e) => setTenderedStr(e.target.value)}
            placeholder="0.00"
            className="h-14 text-2xl font-mono text-right"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {QUICK.map((v) => (
            <Button
              key={v}
              variant="outline"
              onClick={() => setTenderedStr(String(Math.max(v, Math.ceil(total / v) * v)))}
            >
              {fmtCurrency(v, currency)}
            </Button>
          ))}
          <Button variant="outline" onClick={() => setTenderedStr(total.toFixed(2))}>
            Exact
          </Button>
          <Button variant="outline" onClick={() => setTenderedStr(String(Math.ceil(total / 5) * 5))}>
            Next $5
          </Button>
          <Button variant="outline" onClick={() => setTenderedStr(String(Math.ceil(total / 10) * 10))}>
            Next $10
          </Button>
        </div>

        <div className="rounded-lg border bg-surface/40 p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {ok ? "Change due" : "Amount short"}
            </div>
            <div className={cn("text-3xl font-mono font-bold", ok ? "text-success" : "text-destructive")}>
              {fmtCurrency(ok ? change : short, currency)}
            </div>
          </div>
          {ok ? <CheckCircle2 className="size-8 text-success" /> : <AlertTriangle className="size-8 text-muted-foreground" />}
        </div>
      </div>

      <div className="p-4 border-t bg-surface/40 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!ok}
          onClick={() =>
            onComplete({ method: "cash", amountTendered: tendered, changeDue: change })
          }
        >
          Complete sale
        </Button>
      </div>
    </div>
  );
}

/* -------- Terminal -------- */

function TerminalPanel({
  method,
  total,
  currency,
  onComplete,
  onCancel,
}: {
  method: PaymentMethod;
  total: number;
  currency: string;
  onComplete: (p: CompletedPayment) => void;
  onCancel: () => void;
}) {
  const [event, setEvent] = useState<PaymentEvent>({ status: "idle", message: "Ready" });
  const [result, setResult] = useState<PaymentResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = () => {
    setResult(null);
    const ac = new AbortController();
    abortRef.current = ac;
    const provider = getProvider("simulated");
    void provider
      .charge(
        {
          amount: total,
          currency,
          method: method === "cash" ? "card" : (method as Exclude<PaymentMethod, "cash">),
        },
        setEvent,
        ac.signal,
      )
      .then(setResult);
  };

  useEffect(() => {
    start();
    return () => abortRef.current?.abort();
    // run once per dialog open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status: PaymentStatus = result?.finalStatus ?? event.status;
  const isTerminal =
    status === "approved" ||
    status === "declined" ||
    status === "timeout" ||
    status === "cancelled" ||
    status === "error";

  return (
    <div>
      <DialogHeader className="p-6 pb-4 border-b">
        <DialogTitle className="flex items-center gap-2">
          <CreditCard className="size-5 text-primary" /> Card payment
        </DialogTitle>
        <DialogDescription>
          Charging <span className="font-mono font-semibold text-foreground">{fmtCurrency(total, currency)}</span> via {method.replace("_", " ")}
        </DialogDescription>
      </DialogHeader>

      <div className="p-8 flex flex-col items-center justify-center gap-4 min-h-[240px]">
        <StatusIcon status={status} />
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            {statusLabel(status)}
          </div>
          <div className="text-lg font-semibold">{event.message}</div>
          {event.reference && (
            <div className="mt-2 text-[11px] font-mono text-muted-foreground">
              Ref: {event.reference}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t bg-surface/40 flex gap-2">
        {!isTerminal && (
          <Button variant="outline" className="flex-1" onClick={() => abortRef.current?.abort()}>
            Cancel payment
          </Button>
        )}
        {isTerminal && status !== "approved" && (
          <>
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Close
            </Button>
            <Button className="flex-1" onClick={start}>
              Retry
            </Button>
          </>
        )}
        {status === "approved" && result && (
          <Button
            className="flex-1"
            onClick={() =>
              onComplete({
                method,
                amountTendered: total,
                changeDue: 0,
                reference: result.reference,
                cardBrand: result.cardBrand,
                last4: result.last4,
              })
            }
          >
            Complete sale
          </Button>
        )}
      </div>
    </div>
  );
}

function statusLabel(s: PaymentStatus) {
  switch (s) {
    case "connecting": return "Connecting";
    case "waiting_for_card": return "Waiting for card";
    case "authorizing": return "Authorizing";
    case "approved": return "Approved";
    case "declined": return "Declined";
    case "timeout": return "Timeout";
    case "cancelled": return "Cancelled";
    case "error": return "Error";
    default: return "Ready";
  }
}

function StatusIcon({ status }: { status: PaymentStatus }) {
  const base = "size-16 rounded-full grid place-items-center";
  switch (status) {
    case "approved":
      return (
        <div className={cn(base, "bg-success/10 text-success")}>
          <CheckCircle2 className="size-10" />
        </div>
      );
    case "declined":
    case "error":
      return (
        <div className={cn(base, "bg-destructive/10 text-destructive")}>
          <XCircle className="size-10" />
        </div>
      );
    case "timeout":
    case "cancelled":
      return (
        <div className={cn(base, "bg-muted text-muted-foreground")}>
          <AlertTriangle className="size-10" />
        </div>
      );
    case "waiting_for_card":
      return (
        <div className={cn(base, "bg-primary/10 text-primary animate-pulse")}>
          <CreditCard className="size-10" />
        </div>
      );
    default:
      return (
        <div className={cn(base, "bg-primary/10 text-primary")}>
          {status === "connecting" ? <Wifi className="size-10 animate-pulse" /> : <Loader2 className="size-10 animate-spin" />}
        </div>
      );
  }
}
