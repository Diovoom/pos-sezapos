import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { getPublicReceipt } from "@/lib/receipts/public.functions";
import { fmtCurrency } from "@/lib/format";

const receiptQuery = (id: string) =>
  queryOptions({
    queryKey: ["public-receipt", id],
    queryFn: async () => {
      const r = await getPublicReceipt({ data: { id } });
      if (!r) throw notFound();
      return r;
    },
    staleTime: 60_000,
  });

export const Route = createFileRoute("/r/$id")({
  head: ({ loaderData }) => {
    const r = loaderData as
      | { receiptNumber: string | number; store: { name: string | null } }
      | undefined;
    return {
      meta: [
        { title: r ? `Receipt #${r.receiptNumber} — ${r.store.name ?? "Store"}` : "Receipt" },
        { name: "description", content: "Your digital receipt." },
        { name: "robots", content: "noindex, nofollow" },
      ],
    };
  },
  loader: async ({ context, params }) =>
    context.queryClient.ensureQueryData(receiptQuery(params.id)),
  component: PublicReceiptPage,
  errorComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold mb-2">Receipt unavailable</h1>
        <p className="text-muted-foreground">This receipt link is invalid or has expired.</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold mb-2">Receipt not found</h1>
        <p className="text-muted-foreground">We couldn't find this receipt.</p>
      </div>
    </div>
  ),
});

function PublicReceiptPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(receiptQuery(id));
  const cur = data.store.currency ?? "USD";
  const d = new Date(data.createdAt);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    typeof window !== "undefined" ? window.location.href : `https://sezapos.com/r/${data.id}`,
  )}`;

  return (
    <div className="min-h-screen bg-muted/30 py-6 print:bg-white print:py-0">
      <div className="mx-auto max-w-md bg-white text-black shadow-lg rounded-lg print:shadow-none print:rounded-none">
        <div className="p-6 text-center border-b">
          {data.store.logo_url && (
            <img
              src={data.store.logo_url}
              alt={data.store.name ?? "Store logo"}
              className="mx-auto mb-3 h-16 w-auto object-contain"
            />
          )}
          <h1 className="text-xl font-bold uppercase tracking-wide">
            {data.store.name ?? "Store"}
          </h1>
          {data.store.address && (
            <p className="text-sm text-neutral-600 mt-1">{data.store.address}</p>
          )}
          {data.store.phone && <p className="text-sm text-neutral-600">{data.store.phone}</p>}
          {data.store.email && <p className="text-sm text-neutral-600">{data.store.email}</p>}
          {data.store.receipt_header && (
            <p className="text-sm mt-2 italic">{data.store.receipt_header}</p>
          )}
        </div>

        <div className="p-6 space-y-4 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>Receipt #</span>
            <span className="font-medium text-black">{data.receiptNumber}</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span>Date</span>
            <span className="text-black">{d.toLocaleString()}</span>
          </div>
          {data.cashierName && (
            <div className="flex justify-between text-neutral-600">
              <span>Cashier</span>
              <span className="text-black">{data.cashierName}</span>
            </div>
          )}
          {data.customerName && (
            <div className="flex justify-between text-neutral-600">
              <span>Customer</span>
              <span className="text-black">{data.customerName}</span>
            </div>
          )}

          <div className="border-t pt-3 space-y-2">
            {data.lines.map((l, i) => (
              <div key={i} className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-neutral-500">
                    {l.qty} × {fmtCurrency(l.unit_price, cur)}
                  </div>
                </div>
                <div className="font-medium">{fmtCurrency(l.line_total, cur)}</div>
              </div>
            ))}
          </div>

          <div className="border-t pt-3 space-y-1">
            <Row l="Subtotal" r={fmtCurrency(data.subtotal, cur)} />
            {data.discount > 0 && <Row l="Discount" r={`-${fmtCurrency(data.discount, cur)}`} />}
            <Row l="Tax" r={fmtCurrency(data.tax, cur)} />
            <div className="flex justify-between text-base font-bold pt-2">
              <span>TOTAL</span>
              <span>{fmtCurrency(data.total, cur)}</span>
            </div>
          </div>

          <div className="border-t pt-3 space-y-1 text-neutral-600">
            <Row l="Payment method" r={data.paymentMethod.replace("_", " ").toUpperCase()} bold />
            {data.amountTendered != null && (
              <Row l="Amount tendered" r={fmtCurrency(data.amountTendered, cur)} />
            )}
            {data.changeDue != null && data.changeDue > 0 && (
              <Row l="Change" r={fmtCurrency(data.changeDue, cur)} />
            )}
          </div>

          <div className="flex flex-col items-center pt-4 border-t">
            <img src={qrSrc} alt="Receipt QR code" className="h-40 w-40" />
            <span className="text-[10px] text-neutral-500 mt-2 font-mono">{data.id}</span>
          </div>

          {data.store.return_policy && (
            <div className="text-xs text-center text-neutral-600 border-t pt-3">
              {data.store.return_policy}
            </div>
          )}
          {data.store.receipt_footer && (
            <div className="text-center font-semibold pt-2">{data.store.receipt_footer}</div>
          )}
        </div>

        <div className="p-4 border-t flex justify-center print:hidden">
          <Button onClick={() => window.print()} variant="outline">
            <Printer className="size-4 mr-2" /> Print receipt
          </Button>
        </div>
      </div>
      <p className="text-center text-xs text-neutral-500 mt-4 print:hidden">Powered by SEZA POS</p>
    </div>
  );
}

function Row({ l, r, bold }: { l: string; r: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span>{l}</span>
      <span className={bold ? "font-medium text-black" : "text-black"}>{r}</span>
    </div>
  );
}
