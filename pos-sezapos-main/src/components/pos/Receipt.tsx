import { forwardRef } from "react";
import { fmtCurrency } from "@/lib/format";

export type ReceiptLine = {
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

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
  refund?: boolean;
  pendingSync?: boolean;
};

/** 80mm thermal receipt — monospace, printer-friendly. */
export const Receipt = forwardRef<HTMLDivElement, { data: ReceiptData }>(function Receipt(
  { data },
  ref,
) {
  const cur = data.store.currency ?? "USD";
  const dt = new Date(data.createdAt);

  return (
    <div
      ref={ref}
      className="receipt-print bg-white text-black mx-auto p-4 font-mono text-[12px] leading-tight"
      style={{ width: "80mm", maxWidth: "80mm" }}
    >
      <div className="text-center">
        <div className="text-[16px] font-bold uppercase">{data.store.name ?? "Store"}</div>
        {data.store.address && <div>{data.store.address}</div>}
        {data.store.phone && <div>{data.store.phone}</div>}
        {data.store.email && <div>{data.store.email}</div>}
        {data.store.receipt_header && <div className="mt-1">{data.store.receipt_header}</div>}
      </div>

      <Divider />

      {data.refund && (
        <div className="text-center font-bold text-[14px] mb-1">*** REFUND ***</div>
      )}
      {data.pendingSync && (
        <div className="text-center font-bold text-[13px] mb-1">*** PENDING SYNCHRONIZATION ***</div>
      )}

      <Row l="Receipt #" r={String(data.receiptNumber)} />
      <Row l="Txn" r={data.transactionId.slice(0, 8).toUpperCase()} />
      <Row l="Date" r={dt.toLocaleDateString()} />
      <Row l="Time" r={dt.toLocaleTimeString()} />
      {data.cashierName && <Row l="Cashier" r={`${data.cashierName}${data.employeeId ? ` (#${data.employeeId})` : ""}`} />}
      {data.customerName && <Row l="Customer" r={data.customerName} />}

      <Divider />

      {data.lines.map((l, i) => (
        <div key={i} className="mb-1">
          <div className="truncate">{l.name}</div>
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

      <Row l="Method" r={data.paymentMethod.replace("_", " ").toUpperCase()} />
      {data.cardBrand && data.last4 && <Row l="Card" r={`${data.cardBrand} ••${data.last4}`} />}
      {data.reference && <Row l="Ref" r={data.reference} />}
      {data.amountTendered != null && <Row l="Tendered" r={fmtCurrency(data.amountTendered, cur)} />}
      {data.changeDue != null && data.changeDue > 0 && (
        <Row l="Change" r={fmtCurrency(data.changeDue, cur)} />
      )}

      <Divider />

      <div className="text-center">
        <div className="my-2 tracking-[0.3em]">
          {"|| ||| || || ||||| || |||"}
        </div>
        <div className="text-[10px]">{data.transactionId}</div>
      </div>

      {data.store.return_policy && (
        <>
          <Divider />
          <div className="text-center text-[10px]">{data.store.return_policy}</div>
        </>
      )}

      {data.store.receipt_footer && (
        <div className="text-center mt-2 font-semibold">{data.store.receipt_footer}</div>
      )}

      <div className="text-center text-[10px] mt-2 opacity-70">
        © SEZA POS — All rights reserved.
      </div>
    </div>
  );
});

function Row({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between">
      <span>{l}</span>
      <span>{r}</span>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-dashed border-black" />;
}
