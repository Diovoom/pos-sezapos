import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  WifiOff,
  SplitSquareHorizontal,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  getActiveProvider,
  logPaymentAttempt,
  type PaymentEvent,
  type PaymentResult,
  type PaymentStatus,
} from "@/lib/pos/payment-terminal";
import { isOnlineNow } from "@/lib/offline/useOnline";
import { ManagerOverrideDialog } from "@/components/pos/ManagerOverrideDialog";
import { isNativeMode } from "@/lib/native";
import { userFacingError } from "@/lib/errors/user-facing";

export type PaymentMethod =
  "cash" | "card" | "tap" | "apple_pay" | "google_pay" | "gift_card" | "split";

export type PaymentAllocation = {
  method: Exclude<PaymentMethod, "split">;
  amount: number;
  reference?: string;
  provider?: string;
  cardBrand?: string;
  last4?: string;
};

export type CompletedPayment = {
  method: PaymentMethod;
  amountTendered: number;
  changeDue: number;
  reference?: string;
  cardBrand?: string;
  last4?: string;
  allocations?: PaymentAllocation[];
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  method: PaymentMethod;
  total: number;
  currency: string;
  onComplete: (p: CompletedPayment) => void;
  onPaymentEvent?: (event: PaymentEvent) => void;
  // When true (owner / admin / manager or holder of an equivalent
  // permission), backing out of an uncommitted tender does NOT require a
  // second manager PIN. No payment has been captured at this point, so
  // asking the already-authorized user for another manager PIN is
  // friction rather than security.
  bypassCancelApproval?: boolean;
};

/**
 * The active payment provider is persisted in localStorage, but the Stripe
 * terminal selection is restored asynchronously when the Android register
 * starts. Reading getActiveProvider() only once therefore leaves checkout
 * stuck on "No payment terminal" even after Stripe has been restored.
 *
 * Keep the checkout state subscribed to provider changes and, on Android,
 * finish restoring the Stripe selection before deciding that no terminal is
 * configured.
 */
function useActivePaymentProvider() {
  const [provider, setProvider] = useState(() => getActiveProvider());

  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      if (!disposed) setProvider(getActiveProvider());
    };

    window.addEventListener("seza:payment-provider-changed", refresh);

    if (isNativeMode()) {
      void import("@/lib/hardware/terminal-stripe")
        .then(({ restoreStripeTerminalSelection }) => restoreStripeTerminalSelection())
        .catch(() => false)
        .finally(refresh);
    } else {
      refresh();
    }

    return () => {
      disposed = true;
      window.removeEventListener("seza:payment-provider-changed", refresh);
    };
  }, []);

  return provider;
}

// Once cash or card is selected we lock the payment flow  -  cashiers cannot
// silently back out. A manager PIN is required to cancel. Cash panel handles
// its own gate; TerminalPanel gates cancel unless the provider is missing.
export function PaymentDialog({
  open,
  onOpenChange,
  method,
  total,
  currency,
  onComplete,
  onPaymentEvent,
  bypassCancelApproval = false,
}: Props) {
  const isCash = method === "cash";
  const isSplit = method === "split";
  const [managerOpen, setManagerOpen] = useState(false);
  const requestCancel = () => {
    if (bypassCancelApproval) {
      onOpenChange(false);
      return;
    }
    setManagerOpen(true);
  };
  const approveCancel = () => {
    setManagerOpen(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (v) return;
          requestCancel();
        }}
      >
        <DialogContent
          // Full-height flex column so children can carve out a scrollable
          // body between a fixed header and action footer. Cash entry uses an
          // in-app keypad, so Android's oversized system keyboard stays closed.
          className={cn(
            "p-0 gap-0 overflow-hidden",
            "flex flex-col",
            "h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none",
            "sm:h-auto sm:max-h-[92dvh] sm:max-w-md sm:rounded-lg sm:w-full",
          )}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {isCash ? (
            <CashPanel
              total={total}
              currency={currency}
              onComplete={onComplete}
              onCancel={requestCancel}
            />
          ) : isSplit ? (
            <SplitPanel
              total={total}
              currency={currency}
              onComplete={onComplete}
              onCancel={requestCancel}
            />
          ) : (
            <TerminalPanel
              key={String(open)}
              method={method}
              total={total}
              currency={currency}
              onComplete={onComplete}
              onPaymentEvent={onPaymentEvent}
              onCancel={requestCancel}
              onCancelNoApproval={() => onOpenChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      <ManagerOverrideDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        action="payment.cancel"
        description="A manager PIN is required to cancel this payment after tender selection."
        details={{ method, amount: total, currency }}
        onApprove={approveCancel}
      />
    </>
  );
}

/* -------- Cash -------- */

function moneyDigits(value: string) {
  if (!value) return "";
  const cents = Math.max(0, Math.round((Number(value) || 0) * 100));
  return cents > 0 ? String(cents) : "";
}

function formatMoneyDigits(digits: string) {
  if (!digits) return "";
  return (Number(digits) / 100).toFixed(2);
}

function appendMoneyKey(value: string, key: string) {
  const current = moneyDigits(value);
  const next = `${current}${key}`.replace(/^0+(?=\d)/, "");
  if (next.length > 9) return value;
  return formatMoneyDigits(next);
}

function deleteMoneyKey(value: string) {
  const current = moneyDigits(value);
  return formatMoneyDigits(current.slice(0, -1));
}

function MoneyKeypad({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"];

  return (
    <div className="space-y-2" aria-label={label}>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <Button
            key={key}
            type="button"
            variant="outline"
            className="h-11 text-lg font-semibold"
            onClick={() => onChange(appendMoneyKey(value, key))}
          >
            {key}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          className="h-11 text-lg font-semibold"
          aria-label="Delete last digit"
          onClick={() => onChange(deleteMoneyKey(value))}
        >
          ⌫
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-9 w-full text-sm text-muted-foreground"
        onClick={() => onChange("")}
      >
        Clear amount
      </Button>
    </div>
  );
}

function suggestedTenders(total: number) {
  if (total <= 0) return [] as number[];

  const nearestDollar = Math.floor(total) + 1;
  const commonBills = [5, 10, 20, 50, 100, 200, 500];
  const nextBill =
    commonBills.find((amount) => amount > nearestDollar) ??
    Math.ceil((nearestDollar + 1) / 100) * 100;

  return [nearestDollar, nextBill].filter(
    (amount, index, values) =>
      amount > total + 0.004 && values.indexOf(amount) === index,
  );
}

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
    <div className="flex flex-col min-h-0 flex-1">
      <DialogHeader className="p-6 pb-4 border-b shrink-0">
        <DialogTitle className="flex items-center gap-2">
          <Banknote className="size-5 text-primary" /> Cash payment
        </DialogTitle>
        <DialogDescription>
          Total due{" "}
          <span className="font-mono font-semibold text-foreground">
            {fmtCurrency(total, currency)}
          </span>
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-4">
        <div className="space-y-2">
          <Label>Amount received</Label>
          <div
            role="textbox"
            aria-readonly="true"
            aria-label="Amount received"
            className="flex h-14 items-center justify-end rounded-md border bg-background px-3 text-2xl font-mono"
          >
            {tenderedStr || "0.00"}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button type="button" variant="outline" onClick={() => setTenderedStr(total.toFixed(2))}>
            Exact
          </Button>
          {suggestedTenders(total).map((amount) => (
            <Button
              key={amount}
              type="button"
              variant="outline"
              onClick={() => setTenderedStr(amount.toFixed(2))}
            >
              {fmtCurrency(amount, currency)}
            </Button>
          ))}
        </div>

        <MoneyKeypad value={tenderedStr} onChange={setTenderedStr} label="Cash amount keypad" />

        <div className="rounded-lg border bg-surface/40 p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {ok ? "Change due" : "Amount short"}
            </div>
            <div
              className={cn(
                "text-3xl font-mono font-bold",
                ok ? "text-success" : "text-destructive",
              )}
            >
              {fmtCurrency(ok ? change : short, currency)}
            </div>
          </div>
          {ok && <CheckCircle2 className="size-8 text-success" />}
        </div>
      </div>

      <div className="p-4 border-t bg-surface/40 flex gap-2 shrink-0 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!ok}
          onClick={() => {
            void logPaymentAttempt({
              provider: null,
              method: "cash",
              amount: total,
              currency,
              status: "completed",
              message: `Tendered ${tendered.toFixed(2)}, change ${change.toFixed(2)}`,
            });
            onComplete({ method: "cash", amountTendered: tendered, changeDue: change });
          }}
        >
          Complete sale
        </Button>
      </div>
    </div>
  );
}

/* -------- Split cash + card -------- */

function SplitPanel({
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
  const provider = useActivePaymentProvider();
  const [cashText, setCashText] = useState("");
  const [event, setEvent] = useState<PaymentEvent>({
    status: "idle",
    message: "Choose the cash amount",
  });
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [charging, setCharging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cash = Math.min(total, Math.max(0, Math.round((Number(cashText) || 0) * 100) / 100));
  const remaining = Math.max(0, Math.round((total - cash) * 100) / 100);
  const approved = remaining === 0 || result?.finalStatus === "approved";

  useEffect(() => () => abortRef.current?.abort(), []);

  const chargeRemaining = async () => {
    if (remaining <= 0 || !provider || charging) return;
    if (!isOnlineNow()) {
      setEvent({
        status: "network_error",
        message: "Card portion requires an internet connection",
      });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setCharging(true);
    setResult(null);
    try {
      const paymentResult = await provider.charge(
        { amount: remaining, currency, method: "card" },
        (next) => setEvent(next),
        controller.signal,
      );
      setResult(paymentResult);
    } finally {
      setCharging(false);
    }
  };

  const finish = () => {
    if (!approved) return;
    const allocations: PaymentAllocation[] = [];
    if (cash > 0) allocations.push({ method: "cash", amount: cash });
    if (remaining > 0 && result)
      allocations.push({
        method: "card",
        amount: remaining,
        provider: provider?.id,
        reference: result.reference,
        cardBrand: result.cardBrand,
        last4: result.last4,
      });
    onComplete({
      method: "split",
      amountTendered: total,
      changeDue: 0,
      reference: result?.reference,
      cardBrand: result?.cardBrand,
      last4: result?.last4,
      allocations,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="shrink-0 border-b p-6 pb-4">
        <DialogTitle className="flex items-center gap-2">
          <SplitSquareHorizontal className="size-5 text-primary" /> Split payment
        </DialogTitle>
        <DialogDescription>
          Take part in cash, then charge the exact remaining balance to card.
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/30 p-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total due</div>
            <div className="mt-1 text-2xl font-bold font-mono">{fmtCurrency(total, currency)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Card balance
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-primary">
              {fmtCurrency(remaining, currency)}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Cash amount</Label>
          <div
            role="textbox"
            aria-readonly="true"
            aria-label="Cash amount"
            className="flex h-14 items-center justify-end rounded-md border bg-background px-3 text-2xl font-mono"
          >
            {cashText || "0.00"}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[0.25, 0.5, 0.75].map((portion) => (
              <Button
                key={portion}
                type="button"
                variant="outline"
                onClick={() => {
                  setCashText((total * portion).toFixed(2));
                  setResult(null);
                  setEvent({ status: "idle", message: "Ready" });
                }}
              >
                {portion * 100}%
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCashText(total.toFixed(2));
                setResult(null);
                setEvent({ status: "idle", message: "Ready" });
              }}
            >
              All cash
            </Button>
          </div>
          <MoneyKeypad
            value={cashText}
            label="Split payment cash keypad"
            onChange={(value) => {
              setCashText(value);
              setResult(null);
              setEvent({ status: "idle", message: "Ready" });
            }}
          />
        </div>
        {remaining > 0 && (
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Card portion</div>
                <div className="text-sm text-muted-foreground">
                  {provider
                    ? `Ready through ${provider.name}`
                    : "Connect Stripe Terminal or another provider in Settings"}
                </div>
              </div>
              <CreditCard className="size-6 text-primary" />
            </div>
            <div className="mt-3 text-sm font-medium">{event.message}</div>
            {result?.finalStatus === "declined" && (
              <p className="mt-1 text-sm text-destructive">
                Card declined. Retry or change the cash amount.
              </p>
            )}
            <Button
              className="mt-4 w-full"
              onClick={chargeRemaining}
              disabled={!provider || charging || result?.finalStatus === "approved"}
            >
              {charging && <Loader2 className="mr-2 size-4 animate-spin" />}
              {result?.finalStatus === "approved"
                ? "Card approved"
                : `Charge ${fmtCurrency(remaining, currency)}`}
            </Button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-2 border-t bg-surface/40 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" disabled={!approved || total <= 0} onClick={finish}>
          Complete split sale
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
  onPaymentEvent,
  onCancel,
  onCancelNoApproval,
}: {
  method: PaymentMethod;
  total: number;
  currency: string;
  onComplete: (p: CompletedPayment) => void;
  onPaymentEvent?: (event: PaymentEvent) => void;
  onCancel: () => void;
  // Bypass manager approval only when the flow can't actually charge
  // (e.g. no terminal connected). Approved sales and mid-charge cancels
  // still go through onCancel.
  onCancelNoApproval: () => void;
}) {
  const provider = useActivePaymentProvider();
  const navigate = useNavigate();
  const [event, setEvent] = useState<PaymentEvent>({ status: "idle", message: "Ready" });
  const [result, setResult] = useState<PaymentResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const attemptIdRef = useRef<string>(crypto.randomUUID());

  const start = () => {
    if (!provider) return;
    setResult(null);
    const ac = new AbortController();
    abortRef.current = ac;

    void logPaymentAttempt({
      provider: provider.id,
      method: method as Exclude<PaymentMethod, "cash" | "split">,
      amount: total,
      currency,
      status: "initiated",
      message: "Payment requested",
    });

    void provider
      .charge(
        {
          amount: total,
          currency,
          method: method as Exclude<PaymentMethod, "cash" | "split">,
          idempotencyId: attemptIdRef.current,
        },
        (e) => {
          const safeEvent = {
            ...e,
            message: userFacingError(e.message, "The card reader could not complete this step. Please try again."),
          };
          setEvent(safeEvent);
          onPaymentEvent?.(safeEvent);
          void logPaymentAttempt({
            provider: provider.id,
            method: method as Exclude<PaymentMethod, "cash" | "split">,
            amount: total,
            currency,
            status: safeEvent.status,
            message: safeEvent.message,
            reference: safeEvent.reference ?? null,
          });
        },
        ac.signal,
      )
      .then((r) => {
        const safeResult = {
          ...r,
          message: userFacingError(r.message, "The card payment could not be completed. Please try again."),
        };
        setResult(safeResult);
        void logPaymentAttempt({
          provider: provider.id,
          method: method as Exclude<PaymentMethod, "cash" | "split">,
          amount: total,
          currency,
          status: safeResult.finalStatus,
          message: safeResult.message,
          reference: safeResult.reference ?? null,
        });
      });
  };

  const startedProviderRef = useRef<string | null>(null);
  useEffect(() => {
    if (provider && startedProviderRef.current !== provider.id) {
      startedProviderRef.current = provider.id;
      start();
    }
    return () => abortRef.current?.abort();
  }, [provider?.id]);

  // ---- No provider connected: block card payments entirely. ----
  if (!provider) {
    return (
      <div className="flex flex-col min-h-0 flex-1">
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <WifiOff className="size-5 text-destructive" /> No payment terminal
          </DialogTitle>
          <DialogDescription>
            Card, tap, and mobile-wallet payments are unavailable.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-8 flex flex-col items-center justify-center gap-4 text-center">
          <div className="size-16 rounded-full grid place-items-center bg-destructive/10 text-destructive">
            <WifiOff className="size-10" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Terminal not connected
            </div>
            <p className="text-base font-semibold max-w-xs">
              No payment terminal is connected. Please connect a payment terminal in Settings before
              accepting card payments.
            </p>
          </div>
        </div>
        <div className="p-4 border-t bg-surface/40 flex gap-2 shrink-0 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <Button variant="outline" className="flex-1" onClick={onCancelNoApproval}>
            Back to cart
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onCancelNoApproval();
              void navigate({ to: "/payment-terminal" as any });
            }}
          >
            Open payment terminal
          </Button>
        </div>
      </div>
    );
  }

  const status: PaymentStatus = result?.finalStatus ?? event.status;
  const isTerminal =
    status === "approved" ||
    status === "declined" ||
    status === "timeout" ||
    status === "cancelled" ||
    status === "error" ||
    status === "network_error";

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <DialogHeader className="p-6 pb-4 border-b shrink-0">
        <DialogTitle className="flex items-center gap-2">
          <CreditCard className="size-5 text-primary" /> Card payment
        </DialogTitle>
        <DialogDescription>
          Charging{" "}
          <span className="font-mono font-semibold text-foreground">
            {fmtCurrency(total, currency)}
          </span>{" "}
          via {method.replace("_", " ")}
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-8 flex flex-col items-center justify-center gap-4">
        <StatusIcon status={status} />
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            {statusLabel(status)}
          </div>
          <div className="text-lg font-semibold">{event.message}</div>
          {status === "waiting_for_customer" && (
            <p className="text-sm text-muted-foreground mt-2 max-w-xs">
              Please tap, insert, or swipe your card on the payment terminal.
            </p>
          )}
        </div>
      </div>

      <div className="p-4 border-t bg-surface/40 flex gap-2 shrink-0 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {!isTerminal && (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              provider.cancel?.();
              abortRef.current?.abort();
            }}
          >
            Cancel payment
          </Button>
        )}
        {isTerminal && status !== "approved" && (
          <>
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Back to cart
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (status !== "network_error") attemptIdRef.current = crypto.randomUUID();
                start();
              }}
            >
              Retry
            </Button>
          </>
        )}
        {/* Complete Sale is disabled until a real Approved response arrives. */}
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
        {!isTerminal && (
          <Button className="flex-1" disabled>
            Waiting for payment…
          </Button>
        )}
      </div>
    </div>
  );
}

function statusLabel(s: PaymentStatus) {
  switch (s) {
    case "payment_requested":
      return "Payment requested";
    case "connecting":
      return "Connecting to terminal";
    case "waiting_for_customer":
      return "Waiting for customer";
    case "card_presented":
      return "Card presented";
    case "processing":
      return "Processing payment";
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
    case "timeout":
      return "Timeout";
    case "cancelled":
      return "Cancelled";
    case "network_error":
      return "Network error";
    case "error":
      return "Error";
    default:
      return "Ready";
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
    case "network_error":
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
    case "waiting_for_customer":
    case "card_presented":
      return (
        <div className={cn(base, "bg-primary/10 text-primary animate-pulse")}>
          <CreditCard className="size-10" />
        </div>
      );
    default:
      return (
        <div className={cn(base, "bg-primary/10 text-primary")}>
          {status === "connecting" ? (
            <Wifi className="size-10 animate-pulse" />
          ) : (
            <Loader2 className="size-10 animate-spin" />
          )}
        </div>
      );
  }
}
