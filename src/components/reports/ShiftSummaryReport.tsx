// Full end-of-shift report. Reusable in the register close flow and in the
// Shifts route under Reports. Uses print CSS for PDF export via the browser.
import { useQuery } from "@tanstack/react-query";
import { fetchShiftSummary, type ShiftSummary } from "@/lib/shift-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, FileDown, Loader2, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const fmt = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const fmtInt = (n: number) => Number(n || 0).toLocaleString();

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", card: "Credit Card", tap: "Debit / Tap", apple_pay: "Apple Pay",
  google_pay: "Google Pay", gift_card: "Gift Card", split: "Split", store_credit: "Store Credit",
};
const PIE_COLORS = ["#4f46e5", "#0ea5e9", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f43f5e"];

export function ShiftSummaryReport({ sessionId }: { sessionId: string }) {
  const q = useQuery({
    queryKey: ["shift-summary", sessionId],
    queryFn: () => fetchShiftSummary(sessionId),
  });

  if (q.isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground p-6"><Loader2 className="size-4 animate-spin" /> Building report…</div>;
  }
  if (q.error || !q.data) {
    return <div className="p-6 text-destructive">Failed to load shift report.</div>;
  }

  const d = q.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-2xl font-bold">Register Shift Summary</h2>
          <p className="text-sm text-muted-foreground">Complete end-of-shift report</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="size-4 mr-2" /> Print / PDF</Button>
          <Button variant="outline" onClick={() => downloadCsv(d)}><FileDown className="size-4 mr-2" /> Export CSV</Button>
        </div>
      </div>

      <div id="shift-report" className="space-y-4">
        <ShiftHeader d={d} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CashReconciliation d={d} />
          <SalesSummary d={d} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PaymentSummary d={d} />
          <TaxDiscountSummary d={d} />
        </div>
        <RefundList d={d} />
        <DrawerEvents d={d} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopProducts d={d} />
          <EmployeePerformance d={d} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:break-before-page">
          <SalesByHourChart d={d} />
          <PaymentBreakdownChart d={d} />
        </div>
        <FinancialSummary d={d} />
        <FooterNote />
      </div>
    </div>
  );
}

/* ---------- sections ---------- */

function ShiftHeader({ d }: { d: ShiftSummary }) {
  const { session, store, cashier, terminal, durationMin } = d;
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{store?.name}</div>
            <h1 className="text-2xl font-bold">Shift #{shortId(session.id)}</h1>
            <div className="text-sm text-muted-foreground">{store?.address ?? ""}{store?.city ? ` · ${store.city}` : ""}</div>
          </div>
          <Badge variant="outline" className={session.status === "closed" ? "text-muted-foreground" : "text-success border-success/30"}>
            {session.status === "closed" ? "Closed" : "Open"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Info label="Employee" value={cashier?.full_name ?? cashier?.email ?? "—"} />
          <Info label="Employee ID" value={cashier?.employee_id ?? "—"} />
          <Info label="Register" value={terminal?.label ?? "Default"} />
          <Info label="Terminal" value={terminal?.serial ?? terminal?.id?.slice(0, 8) ?? "—"} />
          <Info label="Date" value={new Date(session.opened_at).toLocaleDateString()} />
          <Info label="Shift start" value={new Date(session.opened_at).toLocaleTimeString()} />
          <Info label="Shift end" value={session.closed_at ? new Date(session.closed_at).toLocaleTimeString() : "In progress"} />
          <Info label="Duration" value={`${Math.floor(durationMin / 60)}h ${durationMin % 60}m`} />
        </div>
      </CardContent>
    </Card>
  );
}

function CashReconciliation({ d }: { d: ShiftSummary }) {
  const { session, approver, safeDropTotal } = d;
  const expected = Number(session.expected_cash ?? 0);
  const actual = Number(session.closing_cash ?? 0);
  const variance = session.closing_cash != null ? actual - expected : null;
  const varianceClass = variance == null ? "" : variance === 0 ? "text-success" : Math.abs(variance) > 5 ? "text-destructive" : "text-warning";
  const remaining = actual - Number(session.safe_drop_amount ?? 0);
  return (
    <Card>
      <CardHeader><CardTitle>Cash Reconciliation</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <Row label="Opening cash" value={fmt(session.opening_cash)} />
        <Row label="Cash sales" value={fmt(session.cash_sales)} />
        <Row label="Cash refunds" value={`-${fmt(session.cash_refunds)}`} />
        <Row label="Safe drops" value={`-${fmt(safeDropTotal)}`} />
        <div className="border-t pt-2"><Row label="Expected in drawer" value={fmt(expected)} bold /></div>
        <Row label="Actual counted" value={session.closing_cash != null ? fmt(actual) : "—"} bold />
        {variance !== null && (
          <div className={`flex items-center justify-between rounded-md border p-2 ${Math.abs(variance) > 5 ? "border-destructive/50 bg-destructive/5" : ""}`}>
            <span className="flex items-center gap-2 font-medium">
              {Math.abs(variance) > 0 && <AlertTriangle className="size-4" />}
              {variance === 0 ? "Balanced" : variance > 0 ? "Overage" : "Shortage"}
            </span>
            <span className={`font-bold tabular-nums ${varianceClass}`}>{variance > 0 ? "+" : ""}{fmt(variance)}</span>
          </div>
        )}
        {session.safe_drop_amount != null && Number(session.safe_drop_amount) > 0 && (
          <>
            <Row label="Safe drop at close" value={fmt(Number(session.safe_drop_amount))} />
            <Row label="Cash remaining for next shift" value={fmt(remaining)} bold />
          </>
        )}
        {approver && (
          <Row label="Approved by" value={approver.full_name ?? approver.email ?? "—"} />
        )}
        {session.close_notes && (
          <div className="text-xs text-muted-foreground border-t pt-2">Note: {session.close_notes}</div>
        )}
      </CardContent>
    </Card>
  );
}

function DrawerEvents({ d }: { d: ShiftSummary }) {
  const events = d.noSaleEvents;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Cash Drawer Openings (no-sale)</span>
          <span className="text-sm font-normal text-muted-foreground">{events.length} events</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No no-sale drawer openings for this shift.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b">
              <tr>
                <th className="py-2">Time</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Approver</th>
                <th>Note</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const det = (e.details ?? {}) as Record<string, unknown>;
                return (
                  <tr key={e.id} className="border-b last:border-0 align-top">
                    <td className="py-2">{new Date(e.created_at).toLocaleTimeString()}</td>
                    <td className="capitalize">{String(det.reason ?? "—").replace(/_/g, " ")}</td>
                    <td className="capitalize">{String(det.status ?? "—")}</td>
                    <td className="text-xs text-muted-foreground">{String(det.approver_name ?? "—")}</td>
                    <td className="text-xs">{String(det.note ?? "")}</td>
                    <td className="text-right tabular-nums">
                      {det.safe_drop_amount != null ? fmt(Number(det.safe_drop_amount)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function SalesSummary({ d }: { d: ShiftSummary }) {
  const s = d.salesSummary;
  return (
    <Card>
      <CardHeader><CardTitle>Sales Summary</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 text-sm">
        <Row label="Transactions" value={fmtInt(s.totalTx)} />
        <Row label="Items sold" value={fmtInt(s.totalItems)} />
        <Row label="Total quantity" value={s.totalQty.toFixed(2)} />
        <Row label="Avg items / txn" value={s.avgItems.toFixed(2)} />
        <Row label="Avg transaction" value={fmt(s.avgTx)} />
        <Row label="Highest sale" value={fmt(s.highestSale)} />
        <Row label="Lowest sale" value={fmt(s.lowestSale)} />
        <Row label="Gross sales" value={fmt(s.grossSales)} />
        <Row label="Net sales" value={fmt(s.netSales)} bold />
      </CardContent>
    </Card>
  );
}

function PaymentSummary({ d }: { d: ShiftSummary }) {
  const p = d.paymentSummary;
  return (
    <Card>
      <CardHeader><CardTitle>Payment Summary</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {Object.entries(p.byMethod).map(([k, v]) => (
          <Row key={k} label={METHOD_LABELS[k] ?? k} value={fmt(v)} />
        ))}
        <div className="border-t mt-2 pt-2 space-y-1">
          <Row label="Total cash received" value={fmt(p.totalCashReceived)} />
          <Row label="Total change given" value={fmt(p.totalChangeGiven)} />
          <Row label="Total card sales" value={fmt(p.totalCardSales)} />
          <Row label="Grand total collected" value={fmt(p.grandTotal)} bold />
        </div>
      </CardContent>
    </Card>
  );
}

function TaxDiscountSummary({ d }: { d: ShiftSummary }) {
  const s = d.salesSummary;
  const taxable = d.sales.filter((x) => Number(x.tax) > 0).reduce((a, x) => a + Number(x.subtotal || 0), 0);
  const nonTaxable = s.grossSales - taxable;
  const rate = d.store?.tax_rate ? `${(Number(d.store.tax_rate) * 100).toFixed(2)}%` : "—";
  return (
    <Card>
      <CardHeader><CardTitle>Tax & Discounts</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 text-sm">
        <Row label="Total tax collected" value={fmt(s.totalTax)} bold />
        <Row label="Store rate" value={rate} />
        <Row label="Taxable sales" value={fmt(taxable)} />
        <Row label="Non-taxable sales" value={fmt(nonTaxable)} />
        <div className="col-span-2 border-t my-2" />
        <Row label="Total discounts" value={fmt(s.totalDiscount)} bold />
        <Row label="Voided sales" value={fmtInt(d.voidedSales.length)} />
      </CardContent>
    </Card>
  );
}

function RefundList({ d }: { d: ShiftSummary }) {
  const rs = d.refundSummary;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Refunds & Voids</span>
          <span className="text-sm font-normal text-muted-foreground">
            {rs.refundCount} refunds · {rs.voidCount} voids · {fmt(rs.refundAmount)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {d.refunds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No refunds or voids for this shift.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b">
              <tr>
                <th className="py-2">Receipt</th>
                <th>Type</th>
                <th>Reason</th>
                <th>Manager</th>
                <th>Method</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {d.refunds.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">#{r.sales?.receipt_number ?? "—"}</td>
                  <td className="capitalize">{r.refund_type}</td>
                  <td>{r.reason}</td>
                  <td className="text-muted-foreground">{r.approver_id ? shortId(r.approver_id) : "—"}</td>
                  <td className="capitalize">{METHOD_LABELS[r.payment_method] ?? r.payment_method}</td>
                  <td className="text-right tabular-nums">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function TopProducts({ d }: { d: ShiftSummary }) {
  return (
    <Card>
      <CardHeader><CardTitle>Top Products ({d.products.total} unique)</CardTitle></CardHeader>
      <CardContent>
        {d.products.top.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products sold.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b">
              <tr><th className="py-2">Product</th><th className="text-right">Qty</th><th className="text-right">Revenue</th></tr>
            </thead>
            <tbody>
              {d.products.top.map((p, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5">{p.name}</td>
                  <td className="text-right tabular-nums">{p.qty.toFixed(2)}</td>
                  <td className="text-right tabular-nums">{fmt(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeePerformance({ d }: { d: ShiftSummary }) {
  const { cashier, timeEntry, salesSummary, refundSummary } = d;
  return (
    <Card>
      <CardHeader><CardTitle>Employee Performance</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        <Row label="Cashier" value={cashier?.full_name ?? "—"} />
        <Row label="Transactions" value={fmtInt(salesSummary.totalTx)} />
        <Row label="Items sold" value={fmtInt(salesSummary.totalItems)} />
        <Row label="Sales total" value={fmt(salesSummary.grossSales)} />
        <Row label="Refunds" value={fmtInt(refundSummary.refundCount)} />
        <Row label="Avg sale" value={fmt(salesSummary.avgTx)} />
        <Row label="Clock in" value={timeEntry?.clock_in ? new Date(timeEntry.clock_in).toLocaleTimeString() : "—"} />
        <Row label="Clock out" value={timeEntry?.clock_out ? new Date(timeEntry.clock_out).toLocaleTimeString() : "—"} />
      </CardContent>
    </Card>
  );
}

function SalesByHourChart({ d }: { d: ShiftSummary }) {
  const data = d.hourly.filter((h) => h.count > 0);
  return (
    <Card>
      <CardHeader><CardTitle>Sales by Hour</CardTitle></CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <div className="text-sm text-muted-foreground">No sales.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(h) => `${h}:00`} />
              <Bar dataKey="sales" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentBreakdownChart({ d }: { d: ShiftSummary }) {
  const data = Object.entries(d.paymentSummary.byMethod)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: METHOD_LABELS[k] ?? k, value: v }));
  return (
    <Card>
      <CardHeader><CardTitle>Payment Method Breakdown</CardTitle></CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <div className="text-sm text-muted-foreground">No payments.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" outerRadius={85} label={(e) => `${e.name}: ${fmt(e.value)}`}>
                {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Legend />
              <Tooltip formatter={(v: number) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function FinancialSummary({ d }: { d: ShiftSummary }) {
  const s = d.salesSummary;
  const p = d.paymentSummary;
  const rs = d.refundSummary;
  const expectedDeposit = Number(d.session.expected_cash ?? 0);
  return (
    <Card>
      <CardHeader><CardTitle>Financial Summary</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Gross sales" value={fmt(s.grossSales)} />
        <Stat label="Net sales" value={fmt(s.netSales)} />
        <Stat label="Taxes" value={fmt(s.totalTax)} />
        <Stat label="Discounts" value={fmt(s.totalDiscount)} />
        <Stat label="Refunds" value={fmt(rs.refundAmount)} />
        <Stat label="Total collected" value={fmt(p.grandTotal)} highlight />
        <Stat label="Card sales" value={fmt(p.totalCardSales)} />
        <Stat label="Cash in drawer" value={fmt(d.session.closing_cash ?? expectedDeposit)} highlight />
      </CardContent>
    </Card>
  );
}

function FooterNote() {
  return (
    <div className="text-xs text-muted-foreground text-center py-4 print:pt-8">
      Generated {new Date().toLocaleString()} · This report is a snapshot of the register session at time of viewing.
    </div>
  );
}

/* ---------- helpers ---------- */

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
function shortId(id: string) { return id.slice(0, 8).toUpperCase(); }

function downloadCsv(d: ShiftSummary) {
  const s = d.salesSummary;
  const p = d.paymentSummary;
  const rows: (string | number)[][] = [
    ["Register Shift Summary"],
    ["Shift", shortId(d.session.id)],
    ["Store", d.store?.name ?? ""],
    ["Employee", d.cashier?.full_name ?? ""],
    ["Employee ID", d.cashier?.employee_id ?? ""],
    ["Opened", new Date(d.session.opened_at).toLocaleString()],
    ["Closed", d.session.closed_at ? new Date(d.session.closed_at).toLocaleString() : "Open"],
    [],
    ["Cash Reconciliation"],
    ["Opening cash", d.session.opening_cash],
    ["Cash sales", d.session.cash_sales],
    ["Cash refunds", d.session.cash_refunds],
    ["Expected cash", d.session.expected_cash ?? ""],
    ["Actual cash", d.session.closing_cash ?? ""],
    ["Variance", d.session.variance ?? ""],
    [],
    ["Sales Summary"],
    ["Transactions", s.totalTx],
    ["Items sold", s.totalItems],
    ["Gross sales", s.grossSales.toFixed(2)],
    ["Net sales", s.netSales.toFixed(2)],
    ["Average transaction", s.avgTx.toFixed(2)],
    ["Highest sale", s.highestSale.toFixed(2)],
    ["Lowest sale", s.lowestSale.toFixed(2)],
    [],
    ["Payment Methods"],
    ...Object.entries(p.byMethod).map(([k, v]) => [METHOD_LABELS[k] ?? k, Number(v).toFixed(2)]),
    ["Grand total", p.grandTotal.toFixed(2)],
    [],
    ["Top Products"],
    ["Product", "Qty", "Revenue"],
    ...d.products.top.map((p) => [p.name, p.qty, p.revenue.toFixed(2)]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shift-${shortId(d.session.id)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
