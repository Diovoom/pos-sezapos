import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

function SalesPage() {
  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () => (await supabase.from("stores").select("currency").limit(1).maybeSingle()).data,
  });
  const cur = store?.currency ?? "USD";

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id,total,subtotal,tax,payment_method,status,created_at,sale_items(quantity)")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader title="Sales" subtitle={`${sales.length} recent transactions`} />
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No sales yet.</TableCell></TableRow>
              ) : sales.map((s) => {
                const itemCount = (s.sale_items as Array<{ quantity: number }> | null)?.reduce((acc, i) => acc + Number(i.quantity), 0) ?? 0;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{new Date(s.created_at).toLocaleString()}</TableCell>
                    <TableCell>{itemCount}</TableCell>
                    <TableCell className="capitalize">{String(s.payment_method).replace("_", " ")}</TableCell>
                    <TableCell><span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium capitalize">{s.status}</span></TableCell>
                    <TableCell className="text-right font-mono">{fmtCurrency(Number(s.subtotal), cur)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtCurrency(Number(s.tax), cur)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmtCurrency(Number(s.total), cur)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
