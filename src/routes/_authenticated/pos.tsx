import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/pos/AppShell";
import { fmtCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Plus, Minus, Trash2, Search, Banknote, CreditCard, Smartphone, Wallet, Gift, SplitSquareHorizontal, Loader2, Camera } from "lucide-react";
import { toast } from "sonner";
import { PaymentDialog, type CompletedPayment, type PaymentMethod } from "@/components/pos/PaymentDialog";
import { ReceiptDialog } from "@/components/pos/ReceiptDialog";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";
import { useProductImageUrl } from "@/lib/pos/product-images";
import type { ReceiptData } from "@/components/pos/Receipt";


export const Route = createFileRoute("/_authenticated/pos")({
  component: PosPage,
});

type Product = {
  id: string;
  name: string;
  price: number;
  cost: number;
  sku: string | null;
  barcode: string | null;
  stock: number;
  taxable: boolean;
  category_id: string | null;
  is_favorite: boolean;
  store_id: string | null;
  image_url: string | null;

};

type Category = { id: string; name: string };
type CartLine = { product: Product; qty: number };

const TENDER: Array<{ id: PaymentMethod; label: string; icon: typeof Banknote }> = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "tap", label: "Tap", icon: Smartphone },
  { id: "apple_pay", label: "Apple", icon: Wallet },
  { id: "gift_card", label: "Gift", icon: Gift },
  { id: "google_pay", label: "Google", icon: SplitSquareHorizontal },
];

function PosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | "fav" | "all">("fav");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tender, setTender] = useState<PaymentMethod>("card");
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () => (await supabase.from("stores").select("*").limit(1).maybeSingle()).data,
  });

  const { data: profile } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      return data;
    },
  });

  const taxRate = Number(store?.tax_rate ?? 0.0825);
  const currency = store?.currency ?? "USD";

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id,name").order("sort_order")).data ?? [],
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,price,cost,sku,barcode,stock,taxable,category_id,is_favorite,store_id")
        .eq("status", "active")
        .order("name");
      return (data as Product[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategory === "fav" && !q && !p.is_favorite) return false;
      if (activeCategory !== "fav" && activeCategory !== "all" && p.category_id !== activeCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
      );
    });
  }, [products, activeCategory, search]);

  const tryAddByCode = (code: string) => {
    const norm = code.trim().toLowerCase();
    if (!norm) return false;
    const hit = products.find(
      (p) => p.barcode?.toLowerCase() === norm || p.sku?.toLowerCase() === norm,
    );
    if (hit) {
      addToCart(hit);
      setSearch("");
      return true;
    }
    return false;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addToCart = (p: Product) => {
    setCart((cur) => {
      const idx = cur.findIndex((l) => l.product.id === p.id);
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...cur, { product: p, qty: 1 }];
    });
  };

  const setQty = (id: string, qty: number) => {
    if (qty <= 0) return removeLine(id);
    setCart((cur) => cur.map((l) => (l.product.id === id ? { ...l, qty } : l)));
  };
  const removeLine = (id: string) => setCart((cur) => cur.filter((l) => l.product.id !== id));
  const clearCart = () => setCart([]);

  const subtotal = Math.round(cart.reduce((s, l) => s + l.product.price * l.qty, 0) * 100) / 100;
  const taxable = cart.reduce((s, l) => s + (l.product.taxable ? l.product.price * l.qty : 0), 0);
  const tax = Math.round(taxable * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  // Sale is written ONLY after payment is confirmed.
  const finalize = useMutation({
    mutationFn: async (payment: CompletedPayment) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      const terminalRef =
        payment.reference ||
        (payment.cardBrand && payment.last4 ? `${payment.cardBrand} ••${payment.last4}` : null);

      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          store_id: store?.id ?? null,
          cashier_id: u.user.id,
          subtotal,
          tax,
          discount: 0,
          total,
          payment_method: payment.method,
          amount_tendered: payment.amountTendered,
          change_due: payment.changeDue,
          terminal_ref: terminalRef,
          status: "completed",
        })
        .select()
        .single();
      if (saleErr) throw saleErr;

      const items = cart.map((l) => ({
        sale_id: sale.id,
        product_id: l.product.id,
        product_name: l.product.name,
        quantity: l.qty,
        unit_price: l.product.price,
        line_total: Math.round(l.product.price * l.qty * 100) / 100,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;
      return { sale, payment };
    },
    onSuccess: ({ sale, payment }) => {
      const rd: ReceiptData = {
        store: store ?? {},
        receiptNumber: sale.receipt_number ?? sale.id.slice(0, 8),
        transactionId: sale.id,
        cashierName: profile?.full_name ?? profile?.email ?? null,
        employeeId: null,
        createdAt: sale.created_at,
        lines: cart.map((l) => ({
          name: l.product.name,
          qty: l.qty,
          unit_price: l.product.price,
          line_total: Math.round(l.product.price * l.qty * 100) / 100,
        })),
        subtotal,
        tax,
        total,
        paymentMethod: payment.method,
        amountTendered: payment.amountTendered,
        changeDue: payment.changeDue,
        cardBrand: payment.cardBrand,
        last4: payment.last4,
        reference: payment.reference,
      };
      setReceipt(rd);
      setReceiptOpen(true);
      toast.success(`Sale completed · ${fmtCurrency(total, currency)}`);
      clearCart();
      setPayOpen(false);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to record sale"),
  });

  const openPayment = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setPayOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Checkout"
        subtitle={`${store?.name ?? "Store"} · Terminal 01`}
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-success animate-pulse" /> Shift active
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        <section className="flex-[7] flex flex-col border-r bg-surface/40 min-w-0">
          <div className="p-4 flex flex-col gap-3">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (tryAddByCode(search)) return;
                    if (filtered.length === 1) {
                      addToCart(filtered[0]);
                      setSearch("");
                    }
                  }
                }}
                placeholder="Search products or scan barcode... (⌘K)"
                className="h-12 pl-10 pr-20 bg-card text-sm"
              />
              <kbd className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 border rounded text-[10px] font-mono text-muted-foreground">
                ⌘K
              </kbd>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              <CategoryChip active={activeCategory === "fav"} onClick={() => setActiveCategory("fav")}>Favorites</CategoryChip>
              <CategoryChip active={activeCategory === "all"} onClick={() => setActiveCategory("all")}>All</CategoryChip>
              {categories.map((c) => (
                <CategoryChip key={c.id} active={activeCategory === c.id} onClick={() => setActiveCategory(c.id)}>
                  {c.name}
                </CategoryChip>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-0">
            {productsLoading ? (
              <div className="grid place-items-center h-full text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="grid place-items-center h-full text-center text-sm text-muted-foreground">
                <div>
                  <p className="mb-2">No products yet.</p>
                  <a href="/products" className="text-primary font-medium">Add your first product →</a>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="aspect-square bg-card border rounded-xl p-3 flex flex-col justify-between text-left hover:border-primary/60 hover:shadow-md transition-all active:scale-[0.97] group"
                  >
                    <div className="text-[10px] font-mono text-muted-foreground group-hover:text-primary">
                      {fmtCurrency(Number(p.price), currency)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">Stock: {Number(p.stock)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="w-[420px] flex-none flex flex-col bg-card">
          <div className="p-6 pb-3 flex items-center justify-between">
            <h2 className="font-semibold">Current Sale</h2>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-destructive font-medium hover:bg-destructive/10 px-2 py-1 rounded">
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Cart is empty</div>
            ) : (
              cart.map((line) => (
                <div key={line.product.id} className="flex items-start gap-3 group">
                  <div className="size-10 rounded-md bg-muted grid place-items-center text-xs font-mono font-bold shrink-0">
                    {line.qty}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{line.product.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {fmtCurrency(Number(line.product.price), currency)} ea
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Button size="icon" variant="outline" className="size-6" onClick={() => setQty(line.product.id, line.qty - 1)}>
                        <Minus className="size-3" />
                      </Button>
                      <Button size="icon" variant="outline" className="size-6" onClick={() => setQty(line.product.id, line.qty + 1)}>
                        <Plus className="size-3" />
                      </Button>
                      <button
                        onClick={() => removeLine(line.product.id)}
                        className="size-6 ml-1 grid place-items-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-mono font-semibold">
                    {fmtCurrency(line.product.price * line.qty, currency)}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="p-6 border-t bg-surface/40">
            <div className="space-y-1.5 mb-4">
              <Row label="Subtotal" value={fmtCurrency(subtotal, currency)} />
              <Row label={`Tax (${(taxRate * 100).toFixed(2)}%)`} value={fmtCurrency(tax, currency)} />
              <div className="flex justify-between text-2xl font-bold pt-2 border-t border-dashed">
                <span>Total</span>
                <span className="font-mono">{fmtCurrency(total, currency)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {TENDER.map((t) => {
                const Icon = t.icon;
                const active = tender === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTender(t.id)}
                    className={cn(
                      "h-12 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors",
                      active ? "border-primary bg-primary/5 text-primary" : "bg-card hover:bg-accent",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <Button
              onClick={openPayment}
              disabled={cart.length === 0 || finalize.isPending}
              className="w-full h-16 text-lg font-bold rounded-xl shadow-[var(--shadow-charge)]"
            >
              {finalize.isPending ? <Loader2 className="size-5 animate-spin" /> : <>Charge {fmtCurrency(total, currency)}</>}
            </Button>
          </div>
        </section>
      </div>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        method={tender}
        total={total}
        currency={currency}
        onComplete={(p) => finalize.mutate(p)}
      />

      <ReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} data={receipt} />
    </>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-full text-xs font-medium shrink-0 border transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
