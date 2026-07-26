import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicReadRateLimit } from "@/lib/security/rate-limit";

export type PublicReceiptLine = {
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type PublicReceipt = {
  id: string;
  receiptNumber: number | string;
  createdAt: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  amountTendered: number | null;
  changeDue: number | null;
  customerName: string | null;
  cashierName: string | null;
  lines: PublicReceiptLine[];
  store: {
    name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    currency: string | null;
    return_policy: string | null;
    receipt_footer: string | null;
    receipt_header: string | null;
    logo_url: string | null;
  };
};

export const getPublicReceipt = createServerFn({ method: "GET" })
  .middleware([publicReadRateLimit])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<PublicReceipt | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sale, error } = await supabaseAdmin
      .from("sales")
      .select(
        "id, receipt_number, created_at, status, subtotal, tax, discount, total, payment_method, amount_tendered, change_due, customer_name, store_id, cashier_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error || !sale) return null;

    const [{ data: items }, { data: store }, { data: cashier }] = await Promise.all([
      supabaseAdmin
        .from("sale_items")
        .select("product_name, quantity, unit_price, line_total")
        .eq("sale_id", sale.id)
        .order("product_name"),
      supabaseAdmin
        .from("stores")
        .select(
          "name, address, phone, email, currency, return_policy, receipt_footer, receipt_header, logo_url",
        )
        .eq("id", sale.store_id!)
        .maybeSingle(),
      sale.cashier_id
        ? supabaseAdmin
            .from("profiles")
            .select("full_name, email")
            .eq("id", sale.cashier_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    return {
      id: sale.id,
      receiptNumber: sale.receipt_number ?? sale.id.slice(0, 8).toUpperCase(),
      createdAt: sale.created_at,
      status: sale.status,
      subtotal: Number(sale.subtotal),
      tax: Number(sale.tax),
      discount: Number(sale.discount),
      total: Number(sale.total),
      paymentMethod: sale.payment_method,
      amountTendered: sale.amount_tendered != null ? Number(sale.amount_tendered) : null,
      changeDue: sale.change_due != null ? Number(sale.change_due) : null,
      customerName: sale.customer_name ?? null,
      cashierName: (cashier as any)?.full_name ?? (cashier as any)?.email ?? null,
      lines: (items ?? []).map((i: any) => ({
        name: i.product_name,
        qty: Number(i.quantity),
        unit_price: Number(i.unit_price),
        line_total: Number(i.line_total),
      })),
      store: {
        name: (store as any)?.name ?? null,
        address: (store as any)?.address ?? null,
        phone: (store as any)?.phone ?? null,
        email: (store as any)?.email ?? null,
        currency: (store as any)?.currency ?? "USD",
        return_policy: (store as any)?.return_policy ?? null,
        receipt_footer: (store as any)?.receipt_footer ?? null,
        receipt_header: (store as any)?.receipt_header ?? null,
        logo_url: (store as any)?.logo_url ?? null,
      },
    };
  });
