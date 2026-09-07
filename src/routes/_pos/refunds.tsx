import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtCurrency } from "@/lib/format";
import { toast } from "sonner";
import { RotateCcw, Search, Loader2, Printer, RefreshCw } from "lucide-react";
import { ReceiptDialog } from "@/components/pos/ReceiptDialog";
import type { ReceiptData } from "@/components/pos/Receipt";
import {
  ManagerOverrideDialog,
  type ManagerOverrideResult,
} from "@/components/pos/ManagerOverrideDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { userFacingError } from "@/lib/user-error";
import { getAllOfflineSales, type OfflineSale } from "@/lib/offline/db";
import { useOnline, useSyncEvents } from "@/lib/offline/useOnline";
import { refundStripeSale } from "@/lib/hardware/terminal-stripe";
import { ManagerSupportFooter } from "@/components/pos/ManagerSupportFooter";

export const Route = createFileRoute("/_pos/refunds")({
  head: () => ({
    meta: [
      { title: "Refunds  -  SEZA POS" },
      {
        name: "description",
        content: "Search sales by receipt number to refund, exchange, void, or reprint.",
      },
    ],
  }),
  component: RefundsPage,
});

type SaleRow = {
  id: string;
  receipt_number: number | string | null;
  total: number;
  subtotal: number;
  tax: number;
  discount?: number | null;
  amount_tendered?: number | null;
  change_due?: number | null;
  refunded_amount: number;
  refund_status: string;
  status: string;
  payment_method: string;
  created_at: string;
  customer_name: string | null;
  terminal_ref?: string | null;
  localOnly?: boolean;
  sale_items: Array<{
    id: string;
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

const SALE_SELECT =
  "id,receipt_number,total,subtotal,tax,discount,amount_tendered,change_due,refunded_amount,refund_status,status,payment_method,created_at,customer_name,terminal_ref,sale_items(id,product_id,product_name,quantity,unit_price,line_total)";

const REASONS = [
  { v: "damaged", l: "Damaged" },
  { v: "wrong_item", l: "Wrong Item" },
  { v: "changed_mind", l: "Customer Changed Mind" },
  { v: "duplicate", l: "Duplicate Charge" },
  { v: "other", l: "Other" },
];

const TYPES = [
  { v: "partial", l: "Partial Refund" },
  { v: "full", l: "Full Refund" },
  { v: "exchange", l: "Exchange" },
  { v: "store_credit", l: "Store Credit" },
  { v: "void", l: "Void Sale" },
];

function offlineToSaleRow(sale: OfflineSale): SaleRow {
  const synced = sale.status === "synced" && Boolean(sale.server_id);
  return {
    id: sale.server_id || sale.id,
    receipt_number:
      sale.local_receipt_number || sale.server_receipt_number || String(sale.local_seq),
    total: Number(sale.total || 0),
    subtotal: Number(sale.subtotal || 0),
    tax: Number(sale.tax || 0),
    discount: Number(sale.discount || 0),
    amount_tendered: Number(sale.amount_tendered || 0),
    change_due: Number(sale.change_due || 0),
    refunded_amount: 0,
    refund_status: "none",
    status: synced ? "completed" : "pending sync",
    payment_method: "cash",
    created_at: sale.local_created_at,
    customer_name: sale.customer_name ?? null,
    terminal_ref: null,
    localOnly: !synced,
    sale_items: sale.items.map((item, index) => ({
      id: `offline:${sale.id}:${index}`,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
    })),
  };
}

function receiptDataFromSale(
  sale: SaleRow,
  store: Record<string, unknown> | null | undefined,
): ReceiptData {
  return {
    store: (store as ReceiptData["store"]) ?? {},
    receiptNumber: sale.receipt_number ?? sale.id.slice(0, 8).toUpperCase(),
    transactionId: sale.id,
    cashierName: null,
    customerName: sale.customer_name,
    createdAt: sale.created_at,
    lines: sale.sale_items.map((item) => ({
      name: item.product_name,
      qty: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
    })),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    discount: Number(sale.discount || 0),
    total: Number(sale.total),
    paymentMethod: sale.payment_method,
    amountTendered: sale.amount_tendered ?? null,
    changeDue: sale.change_due ?? null,
  };
}

export function RefundsPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SaleRow | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const online = useOnline();
  const syncEvent = useSyncEvents();
  const qc = useQueryClient();

  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () => (await supabase.from("stores").select("*").limit(1).maybeSingle()).data,
  });
  const cur = store?.currency ?? "USD";

  const salesQuery = useQuery<SaleRow[]>({
    queryKey: ["refund-sales", query, online],
    queryFn: async () => {
      const search = query.trim().replace(/^#/, "");
      let cloudRows: SaleRow[] = [];

      if (online) {
        try {
          let q = supabase
            .from("sales")
            .select(SALE_SELECT)
            .order("created_at", { ascending: false })
            .limit(50);
          const num = Number(search);
          if (search) {
            if (Number.isFinite(num)) q = q.eq("receipt_number", num);
            else q = q.eq("id", search);
          }
          const { data, error } = await q;
          if (error) throw error;
          cloudRows = (data as unknown as SaleRow[]) ?? [];
        } catch (error) {
          console.warn("[refunds] cloud receipt lookup failed; showing local receipts", error);
        }
      }

      const offline = await getAllOfflineSales();
      const matchingOffline = offline
        .filter((sale) => {
          if (!search) return sale.status !== "synced";
          const customerNumber = String(
            sale.local_receipt_number || sale.server_receipt_number || sale.local_seq,
          );
          return (
            customerNumber === search ||
            sale.id === search ||
            sale.server_id === search ||
            String(sale.server_receipt_number ?? "") === search
          );
        })
        .sort((a, b) => Date.parse(b.local_created_at) - Date.parse(a.local_created_at));

      // When a locally-created sale has synchronized, resolve the real server
      // row so refund controls work without requiring the cashier to leave and
      // reopen this screen.
      const missingServerIds = matchingOffline
        .filter(
          (sale) =>
            online &&
            sale.status === "synced" &&
            sale.server_id &&
            !cloudRows.some((row) => row.id === sale.server_id),
        )
        .map((sale) => sale.server_id as string);
      if (missingServerIds.length) {
        const { data } = await supabase.from("sales").select(SALE_SELECT).in("id", missingServerIds);
        cloudRows = [...cloudRows, ...(((data as unknown as SaleRow[]) ?? []))];
      }

      const represented = new Set(cloudRows.map((row) => row.id));
      const localRows = matchingOffline
        .filter((sale) => !sale.server_id || !represented.has(sale.server_id))
        .map(offlineToSaleRow);

      return [...cloudRows, ...localRows]
        .filter((row, index, all) => all.findIndex((other) => other.id === row.id) === index)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    },
    refetchOnWindowFocus: true,
    refetchInterval: online ? 15_000 : false,
  });

  useEffect(() => {
    if (online || syncEvent?.type === "done" || syncEvent?.type === "progress") {
      void qc.invalidateQueries({ queryKey: ["refund-sales"] });
    }
  }, [online, syncEvent, qc]);

  const sales = salesQuery.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Refunds & receipts"
        subtitle="Search, reprint, refund, exchange, or void a receipt."
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 space-y-4 md:p-6 md:pb-10">
        <div className="flex max-w-2xl items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Receipt number"
              className="h-11 pl-10"
            />
          </div>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => salesQuery.refetch()}
            disabled={salesQuery.isFetching}
          >
            <RefreshCw className={`size-4 ${salesQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesQuery.isFetching && sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center">
                    <Loader2 className="size-4 animate-spin inline" />
                  </TableCell>
                </TableRow>
              ) : sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    {query ? "No receipt matches that number." : "No recent receipts are available yet."}
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => (
                  <TableRow key={`${sale.id}:${sale.receipt_number}`}>
                    <TableCell className="font-mono">#{sale.receipt_number ?? sale.id.slice(0, 6)}</TableCell>
                    <TableCell className="text-sm">{new Date(sale.created_at).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{String(sale.payment_method).replace("_", " ")}</TableCell>
                    <TableCell>
                      <StatusPill
                        status={sale.refund_status === "none" ? sale.status : `refund: ${sale.refund_status}`}
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtCurrency(Number(sale.total), cur)}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      {Number(sale.refunded_amount) > 0
                        ? `-${fmtCurrency(Number(sale.refunded_amount), cur)}`
                        : " - "}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReceipt(receiptDataFromSale(sale, store))}
                        >
                          <Printer className="size-3.5" /> Reprint
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            sale.localOnly ||
                            sale.refund_status === "full" ||
                            sale.status === "voided"
                          }
                          title={sale.localOnly ? "Refund becomes available after this sale synchronizes" : undefined}
                          onClick={() => setSelected(sale)}
                        >
                          <RotateCcw className="size-3.5" /> Refund
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
        <ManagerSupportFooter />
      </div>

      <RefundDialog
        sale={selected}
        currency={cur}
        onClose={() => setSelected(null)}
        onIssued={(rd) => {
          setSelected(null);
          setReceipt(rd);
        }}
        store={store}
      />

      <ReceiptDialog
        open={!!receipt}
        onOpenChange={(value) => !value && setReceipt(null)}
        data={receipt}
        autoPrint={false}
      />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone =
    s.includes("full") || s === "voided"
      ? "bg-destructive/10 text-destructive"
      : s.includes("partial") || s.includes("pending") || s.includes("sync")
        ? "bg-amber-500/10 text-amber-700"
        : "bg-success/10 text-success";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${tone}`}>
      {status}
    </span>
  );
}

function RefundDialog({
  sale,
  currency,
  onClose,
  onIssued,
  store,
}: {
  sale: SaleRow | null;
  currency: string;
  onClose: () => void;
  onIssued: (r: ReceiptData) => void;
  store: Record<string, unknown> | null | undefined;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState("partial");
  const [reason, setReason] = useState("damaged");
  const [notes, setNotes] = useState("");
  const [restock, setRestock] = useState(true);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [override, setOverride] = useState<ManagerOverrideResult | null>(null);
  const [refundAttemptId, setRefundAttemptId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    setRefundAttemptId(crypto.randomUUID());
  }, [sale?.id]);

  const { has, isSuper } = usePermissions();
  const canCreate = isSuper || has("refunds.create");
  const canApprove = isSuper || has("refunds.approve");
  const requireApproval = (() => {
    try {
      const raw = localStorage.getItem("pos.pref.refunds");
      if (!raw) return true;
      const p = JSON.parse(raw) as Record<string, string>;
      return p.manager_approval !== "false";
    } catch {
      return true;
    }
  })();
  const needsOverride = (!canCreate || (requireApproval && !canApprove)) && !override;
  const authorizedToCreate = canCreate || Boolean(override);

  const itemsToRefund = sale
    ? sale.sale_items.map((i) => ({
        item: i,
        qty: Math.min(qtyMap[i.id] ?? 0, Number(i.quantity)),
      }))
    : [];

  const refundSubtotal = itemsToRefund.reduce(
    (s, { item, qty }) => s + qty * Number(item.unit_price),
    0,
  );
  const taxRatio = sale && Number(sale.subtotal) > 0 ? Number(sale.tax) / Number(sale.subtotal) : 0;
  const refundTax = Math.round(refundSubtotal * taxRatio * 100) / 100;
  const refundTotal =
    type === "full" || type === "void"
      ? Number(sale?.total ?? 0) - Number(sale?.refunded_amount ?? 0)
      : Math.round((refundSubtotal + refundTax) * 100) / 100;

  const submit = useMutation({
    mutationFn: async () => {
      if (!authorizedToCreate) throw new Error("Manager approval is required to issue this refund");
      if (!sale) return null;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      const effectiveItems =
        type === "full" || type === "void"
          ? sale.sale_items.map((i) => ({
              item: i,
              qty:
                Number(i.quantity) -
                // best-effort: don't try to reduce by prior partial refund lines here;
                // full-refund is intended when nothing was previously refunded.
                0,
            }))
          : itemsToRefund.filter((x) => x.qty > 0);

      if (effectiveItems.length === 0) throw new Error("Select at least one item and quantity");

      const processorRefund =
        ["card", "tap", "apple_pay", "google_pay"].includes(String(sale.payment_method)) &&
        type !== "store_credit" &&
        type !== "exchange";
      if (processorRefund) {
        if (!String(sale.terminal_ref || "").startsWith("pi_")) {
          throw new Error("This card sale is not linked to a Stripe payment. Refund it through the original processor.");
        }
        await refundStripeSale({
          saleId: sale.id,
          amountCents: Math.round(refundTotal * 100),
          idempotencyId: refundAttemptId,
        });
      }

      const { data: refund, error } = await supabase
        .from("refunds")
        .insert({
          sale_id: sale.id,
          store_id: (store as { id?: string } | null)?.id ?? null,
          cashier_id: u.user.id,
          refund_type: type,
          reason,
          notes: notes || null,
          subtotal: type === "full" || type === "void" ? Number(sale.subtotal) : refundSubtotal,
          tax: type === "full" || type === "void" ? Number(sale.tax) : refundTax,
          total: refundTotal,
          payment_method: sale.payment_method as
            | "cash"
            | "card"
            | "tap"
            | "apple_pay"
            | "google_pay"
            | "gift_card"
            | "split"
            | "store_credit",
          status: "completed",
        })
        .select()
        .single();
      if (error) throw error;

      const rows = effectiveItems.map(({ item, qty }) => ({
        refund_id: refund.id,
        sale_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: qty,
        unit_price: Number(item.unit_price),
        line_total: Math.round(qty * Number(item.unit_price) * 100) / 100,
        restock,
      }));
      const { error: ie } = await supabase.from("refund_items").insert(rows);
      if (ie) throw ie;

      return { refund, effectiveItems };
    },
    onSuccess: (payload) => {
      if (!payload || !sale) return;
      toast.success(`Refund issued · ${fmtCurrency(refundTotal, currency)}`);
      void import("@/lib/audit-log").then((m) =>
        m.logAudit({
          action: "refund.create",
          entity: "refund",
          entity_id: payload.refund.id,
          details: { amount: refundTotal, sale_id: sale?.id },
        }),
      );
      qc.invalidateQueries({ queryKey: ["refund-sales"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });

      const rd: ReceiptData = {
        store: (store as ReceiptData["store"]) ?? {},
        receiptNumber: `R-${payload.refund.id.slice(0, 6).toUpperCase()}`,
        transactionId: payload.refund.id,
        cashierName: null,
        createdAt: payload.refund.created_at,
        lines: payload.effectiveItems.map(({ item, qty }) => ({
          name: item.product_name,
          qty,
          unit_price: Number(item.unit_price),
          line_total: Math.round(qty * Number(item.unit_price) * 100) / 100,
        })),
        subtotal: -Math.abs(refundSubtotal || Number(sale.subtotal)),
        tax: -Math.abs(refundTax || Number(sale.tax)),
        total: -Math.abs(refundTotal),
        paymentMethod: sale.payment_method,
        refund: true,
      };
      onIssued(rd);
    },
    onError: (e) =>
      toast.error(userFacingError(e, "The refund could not be completed. Try again.")),
  });

  return (
    <Dialog open={!!sale} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Refund receipt #{sale?.receipt_number}</DialogTitle>
          <DialogDescription>
            Sale total {sale && fmtCurrency(Number(sale.total), currency)} · Already refunded{" "}
            {sale && fmtCurrency(Number(sale.refunded_amount), currency)}
          </DialogDescription>
        </DialogHeader>

        {sale && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">Refund type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.v} value={t.v}>
                        {t.l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r.v} value={r.v}>
                        {r.l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-md divide-y">
              {sale.sale_items.map((item) => {
                const max = Number(item.quantity);
                const qty = qtyMap[item.id] ?? (type === "full" || type === "void" ? max : 0);
                return (
                  <div key={item.id} className="p-3 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{item.product_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {max} × {fmtCurrency(Number(item.unit_price), currency)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setQtyMap((m) => ({
                            ...m,
                            [item.id]: Math.max(0, (m[item.id] ?? 0) - 1),
                          }))
                        }
                      >
                        -
                      </Button>
                      <span className="w-8 text-center font-mono">{qty}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setQtyMap((m) => ({
                            ...m,
                            [item.id]: Math.min(max, (m[item.id] ?? 0) + 1),
                          }))
                        }
                      >
                        +
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setQtyMap((m) => ({ ...m, [item.id]: max }))}
                      >
                        All
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="restock" checked={restock} onCheckedChange={(v) => setRestock(!!v)} />
              <Label htmlFor="restock" className="text-sm">
                Restock refunded items to inventory
              </Label>
            </div>

            <div>
              <Label className="mb-1 block">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Manager approval, additional context..."
              />
            </div>

            {override && (
              <div className="text-xs rounded-md border border-success/40 bg-success/10 text-success px-3 py-2">
                Approved by {override.manager_name}
              </div>
            )}

            <div className="flex justify-between items-center border-t pt-3">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  Refund total
                </div>
                <div className="text-2xl font-mono font-bold text-destructive">
                  -{fmtCurrency(refundTotal, currency)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                {needsOverride ? (
                  <Button variant="destructive" onClick={() => setOverrideOpen(true)}>
                    Get manager approval
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    disabled={submit.isPending || refundTotal <= 0 || !authorizedToCreate}
                    onClick={() => submit.mutate()}
                  >
                    {submit.isPending && <Loader2 className="size-4 animate-spin" />}
                    {authorizedToCreate ? "Issue refund" : "Manager approval required"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
      <ManagerOverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        action={type === "void" ? "sales.void" : "refunds.approve"}
        description={`Approve ${type} refund of ${fmtCurrency(refundTotal, currency)} on receipt #${sale?.receipt_number ?? ""}`}
        details={{ sale_id: sale?.id, amount: refundTotal, type }}
        onApprove={(r) => {
          setOverride(r);
          setNotes((n) =>
            n ? `${n}\nApproved by ${r.manager_name}` : `Approved by ${r.manager_name}`,
          );
        }}
      />
    </Dialog>
  );
}
