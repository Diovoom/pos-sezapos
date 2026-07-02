import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fmtCurrency } from "@/lib/format";
import { Printer } from "lucide-react";
import { ReceiptDialog } from "@/components/pos/ReceiptDialog";
import type { ReceiptData } from "@/components/pos/Receipt";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({ meta: [{ title: "Sales — SEZA POS" }, { name: "description", content: "Recent sales transactions, receipts, and payment details." }] }),
  component: SalesPage,
});

type Row = {
  id: string;
  receipt_number: number | null;
  total: number;
  subtotal: number;
  tax: number;
  refunded_amount: number;
  refund_status: string;
  payment_method: string;
  status: string;
  created_at: string;
  amount_tendered: number | null;
  change_due: number | null;
  terminal_ref: string | null;
  sale_items: Array<{ product_name: string; quantity: number; unit_price: number; line_total: number }>;
};

function SalesPage() {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () => (await supabase.from("stores").select("*").limit(1).maybeSingle()).data,
  });
  const cur = store?.currency ?? "USD";

  const { data: sales = [] } = useQuery<Row[]>({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id,receipt_number,total,subtotal,tax,refunded_amount,refund_status,payment_method,status,created_at,amount_tendered,change_due,terminal_ref,sale_items(product_name,quantity,unit_price,line_total)")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data as unknown as Row[]) ?? [];
    },
  });

  const openReceipt = (s: Row) => {
    setReceipt({
      store: store ?? {},
      receiptNumber: s.receipt_number ?? s.id.slice(0, 8),
      transactionId: s.id,
      createdAt: s.created_at,
      lines: s.sale_items.map((i) => ({
        name: i.product_name,
        qty: Number(i.quantity),
        unit_price: Number(i.unit_price),
        line_total: Number(i.line_total),
      })),
      subtotal: Number(s.subtotal),
      tax: Number(s.tax),
      total: Number(s.total),
      paymentMethod: s.payment_method,
      amountTendered: s.amount_tendered != null ? Number(s.amount_tendered) : null,
      changeDue: s.change_due != null ? Number(s.change_due) : null,
      reference: s.terminal_ref,
    });
  };

  return (
    <>
      <PageHeader title="Sales" subtitle={`${sales.length} recent transactions`} />
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No sales yet.</TableCell></TableRow>
              ) : sales.map((s) => {
                const itemCount = s.sale_items?.reduce((a, i) => a + Number(i.quantity), 0) ?? 0;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono">#{s.receipt_number ?? s.id.slice(0, 6)}</TableCell>
                    <TableCell className="text-sm">{new Date(s.created_at).toLocaleString()}</TableCell>
                    <TableCell>{itemCount}</TableCell>
                    <TableCell className="capitalize">{String(s.payment_method).replace("_", " ")}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        s.status === "voided" ? "bg-destructive/10 text-destructive" :
                        s.refund_status === "full" ? "bg-destructive/10 text-destructive" :
                        s.refund_status === "partial" ? "bg-amber-500/10 text-amber-600" :
                        "bg-success/10 text-success"
                      }`}>
                        {s.status === "voided" ? "voided" : s.refund_status === "none" ? s.status : s.refund_status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmtCurrency(Number(s.total), cur)}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      {Number(s.refunded_amount) > 0 ? `-${fmtCurrency(Number(s.refunded_amount), cur)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openReceipt(s)} aria-label="Reprint receipt">
                        <Printer className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
      <ReceiptDialog open={!!receipt} onOpenChange={(v) => !v && setReceipt(null)} data={receipt} />
    </>
  );
}
