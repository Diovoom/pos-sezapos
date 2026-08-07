import { forwardRef } from "react";
import { fmtCurrency } from "@/lib/format";

export type ReceiptLine = {
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type ReceiptPaymentAllocation = {
  method: string;
  amount: number;
  cardBrand?: string;
  last4?: string;
};

export function compactReceiptCashierName(value?: string | null): string {
  const cleaned = (value ?? "").trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const lastInitial = parts[parts.length - 1]?.[0]?.toUpperCase();
  return lastInitial ? `${parts[0]} ${lastInitial}.` : parts[0];
}


function sanitizeReceiptBlock(value?: string | null): string {
  return String(value ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:ref|reference|transaction\s*(?:ref|reference|id)|payment\s*(?:ref|reference|id))\s*:/i.test(line))
    .join("\n")
    .trim();
}

export type ReceiptData = {
  store: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    receipt_header?: string | null;
    receipt_footer?: string | null;
    return_policy?: string | null;
    currency?: string | null;
  };
  receiptNumber: number | string;
  transactionId: string;
  cashierName?: string | null;
  employeeId?: string | null;
  customerName?: string | null;
  createdAt: string | Date;
  lines: ReceiptLine[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  paymentMethod: string;
  amountTendered?: number | null;
  changeDue?: number | null;
  cardBrand?: string | null;
  last4?: string | null;
  reference?: string | null;
  paymentAllocations?: ReceiptPaymentAllocation[];
  refund?: boolean;
  pendingSync?: boolean;
};

/** 80mm thermal receipt  -  monospace, printer-friendly. */
export const Receipt = forwardRef<HTMLDivElement, { data: ReceiptData }>(function Receipt(
  { data },
  ref,
) {
  const cur = data.store.currency ?? "USD";
  const dt = new Date(data.createdAt);

  return (
    <div
      ref={ref}
      className="receipt-print bg-white text-black mx-auto font-mono text-[11px] leading-[1.2]"
      style={{ width: "80mm", maxWidth: "80mm", padding: "3mm 4mm 2mm" }}
    >
      <div className="text-center">
        <div className="text-[16px] font-bold uppercase">{data.store.name ?? "Store"}</div>
        {data.store.address && <div>{data.store.address}</div>}
        {data.store.phone && <div>{data.store.phone}</div>}
        {data.store.email && <div>{data.store.email}</div>}
        {data.store.receipt_header && <div className="mt-1">{data.store.receipt_header}</div>}
      </div>

      <Divider />

      {data.refund && <div className="text-center font-bold text-[14px] mb-1">*** REFUND ***</div>}
      <Row l="Receipt #" r={String(data.receiptNumber)} />
      <Row l="Date" r={dt.toLocaleDateString()} />
      <Row l="Time" r={dt.toLocaleTimeString()} />
      {data.cashierName && (
        <Row
          l="Cashier"
          r={compactReceiptCashierName(data.cashierName)}
        />
      )}
      {data.customerName && <Row l="Customer" r={data.customerName} />}

      <Divider />

      {data.lines.map((l, i) => (
        <div key={i} className="mb-1">
          <div className="break-words whitespace-normal">{l.name}</div>
          <div className="flex justify-between">
            <span>
              {l.qty} × {fmtCurrency(l.unit_price, cur)}
            </span>
            <span>{fmtCurrency(l.line_total, cur)}</span>
          </div>
        </div>
      ))}

      <Divider />

      <Row l="Subtotal" r={fmtCurrency(data.subtotal, cur)} />
      {!!data.discount && <Row l="Discount" r={`-${fmtCurrency(data.discount, cur)}`} />}
      <Row l="Tax" r={fmtCurrency(data.tax, cur)} />
      <div className="flex justify-between font-bold text-[14px] mt-1">
        <span>TOTAL</span>
        <span>{fmtCurrency(data.total, cur)}</span>
      </div>

      <Divider />

      <Row l="Method" r={data.paymentMethod.replaceAll("_", " ").toUpperCase()} />
      {data.paymentAllocations?.map((allocation, index) => (
        <Row
          key={`${allocation.method}-${index}`}
          l={allocation.method.replaceAll("_", " ").toUpperCase()}
          r={`${fmtCurrency(allocation.amount, cur)}${allocation.cardBrand && allocation.last4 ? ` · ${allocation.cardBrand} ••${allocation.last4}` : ""}`}
        />
      ))}
      {data.cardBrand && data.last4 && !data.paymentAllocations?.length && (
        <Row l="Card" r={`${data.cardBrand} ••${data.last4}`} />
      )}
      {data.amountTendered != null && (
        <Row l="Tendered" r={fmtCurrency(data.amountTendered, cur)} />
      )}
      {data.changeDue != null && data.changeDue > 0 && (
        <Row l="Change" r={fmtCurrency(data.changeDue, cur)} />
      )}

      <Divider />

      {sanitizeReceiptBlock(data.store.return_policy) && (
        <>
          <Divider />
          <div className="text-center text-[10px] whitespace-pre-line">{sanitizeReceiptBlock(data.store.return_policy)}</div>
        </>
      )}

      {sanitizeReceiptBlock(data.store.receipt_footer) && (
        <div className="text-center mt-2 font-semibold whitespace-pre-line">{sanitizeReceiptBlock(data.store.receipt_footer)}</div>
      )}

      <div className="text-center text-[10px] mt-2 opacity-70">
        © SEZA POS - All rights reserved.
      </div>
    </div>
  );
});

function Row({ l, r }: { l: string; r: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start">
      <span className="min-w-0">{l}</span>
      <span className="text-right break-words max-w-[48mm]">{r}</span>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-dashed border-black" />;
}
