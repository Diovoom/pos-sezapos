import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/pos/AppShell";
import { fmtCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Plus, Minus, Trash2, Search, Banknote, CreditCard, Smartphone, Wallet, Gift, SplitSquareHorizontal, Loader2, Camera, Calculator, Percent, Heart, RotateCcw, ShoppingCart } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { PaymentDialog, type CompletedPayment, type PaymentMethod } from "@/components/pos/PaymentDialog";
import { ReceiptDialog } from "@/components/pos/ReceiptDialog";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";
import { AgeVerificationDialog, type RestrictedItem, type SuccessfulVerification } from "@/components/pos/AgeVerificationDialog";
import { loadAgeSettings } from "@/lib/age-verification";
import { useProductImageUrl } from "@/lib/pos/product-images";
import { CustomItemDialog } from "@/components/pos/CustomItemDialog";
import { DiscountDialog, type DiscountValue } from "@/components/pos/DiscountDialog";
import { LoyaltyDialog, accrueLoyaltyPoints, spendLoyaltyPoints, type LoyaltyCustomer } from "@/components/pos/LoyaltyDialog";
import type { ReceiptData } from "@/components/pos/Receipt";
import { useMe } from "@/hooks/useMe";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { logAudit } from "@/lib/audit-log";
import { useOnline, isOnlineNow } from "@/lib/offline/useOnline";
import {
  cacheProducts,
  loadCachedProducts,
  saveOfflineSale,
  nextSeq,
  getDeviceId,
  purgeIfStoreChanged,
  cacheMeta,
  readMeta,
  OFFLINE_PAYLOAD_VERSION,
  type CachedProduct,
} from "@/lib/offline/db";
import { syncNow } from "@/lib/offline/sync";
import { useNativeActivitySignal } from "@/lib/native-activity";

type SaleStep = "auth" | "sale_insert" | "sale_items_insert" | "inventory";
class SaleError extends Error {
  step: SaleStep;
  cause?: unknown;
  constructor(step: SaleStep, message: string, cause?: unknown) {
    super(message);
    this.name = "SaleError";
    this.step = step;
    this.cause = cause;
  }
}
function friendlyDbMessage(err: unknown, fallback: string): string {
  const e = err as { code?: string; message?: string } | null | undefined;
  if (!e) return fallback;
  switch (e.code) {
    case "42501": return "You don't have permission to record sales. Contact your manager.";
    case "23505": return "Duplicate sale detected. Please refresh and try again.";
    case "23503": return "Referenced product or record was not found.";
    case "23502": return "Sale is missing required information.";
    case "23514": return "Sale contains invalid values.";
    case "PGRST301":
    case "PGRST302": return "Your session has expired. Please sign in again.";
    default:
      if (e.message && /network|fetch|failed to fetch/i.test(e.message)) {
        return "Network error. Check your connection and try again.";
      }
      return fallback;
  }
}




export const Route = createFileRoute("/_pos/pos")({
  head: () => ({ meta: [{ title: "Checkout — SEZA POS" }, { name: "description", content: "Fast POS checkout with barcode scanning, custom items, discounts, and card + cash." }] }),
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
  age_restricted?: boolean | null;
  min_age?: number | null;
  age_category?: string | null;
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

export function PosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | "fav" | "all">("fav");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discount, setDiscount] = useState<DiscountValue | null>(null);
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [loyalty, setLoyalty] = useState<LoyaltyCustomer | null>(null);
  const [loyaltyRedemption, setLoyaltyRedemption] = useState(0);

  const [tender, setTender] = useState<PaymentMethod>("card");
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [ageOpen, setAgeOpen] = useState(false);
  const [ageVerification, setAgeVerification] = useState<SuccessfulVerification | null>(null);
  const [voidLine, setVoidLine] = useState<CartLine | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const ageSettings = useMemo(() => loadAgeSettings(), []);
  const searchRef = useRef<HTMLInputElement>(null);
  const me = useMe();
  const canManage = (me.data?.roles ?? []).some((r) => r === "owner" || r === "admin" || r === "manager");
  const isMobile = useIsMobile();
  const online = useOnline();
  const [cartOpen, setCartOpen] = useState(false);
  const [hasCameraCap, setHasCameraCap] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Android APK ships without the camera scanner — the WebView cannot
    // reliably request camera permission for POS scanning, so the button
    // must not appear. Detection still runs for the mobile web POS.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (isNative) { setHasCameraCap(false); return; }
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setHasCameraCap(coarse && hasMedia);
  }, []);
  const showMobileCamera = isMobile && hasCameraCap;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: store } = useQuery<any>({
    queryKey: ["store"],
    queryFn: async () => {
      if (!navigator.onLine) return (await readMeta("store")) ?? null;
      const { data } = await supabase.from("stores").select("*").limit(1).maybeSingle();
      if (data) await cacheMeta("store", data);
      return data;
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = useQuery<any>({
    queryKey: ["me-profile"],
    queryFn: async () => {
      if (!navigator.onLine) return (await readMeta("profile")) ?? null;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) await cacheMeta("profile", data);
      return data;
    },
  });

  const taxRate = Number(store?.tax_rate ?? 0.0825);
  const currency = store?.currency ?? "USD";

  // Scope offline cache to this store — never leak another store's cache.
  useEffect(() => { if (store?.id) void purgeIfStoreChanged(store.id); }, [store?.id]);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      if (!navigator.onLine) return (await readMeta<Category[]>("categories")) ?? [];
      const { data } = await supabase.from("categories").select("id,name").order("sort_order");
      const rows = data ?? [];
      await cacheMeta("categories", rows);
      return rows;
    },
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: async () => {
      if (!navigator.onLine) {
        const cached = await loadCachedProducts();
        return cached as unknown as Product[];
      }
      const { data } = await supabase
        .from("products")
        .select("id,name,price,cost,sku,barcode,stock,taxable,category_id,is_favorite,store_id,image_url,age_restricted,min_age,age_category")
        .eq("status", "active")
        .order("name");
      const rows = (data as Product[]) ?? [];
      // Cache for offline reuse on this register.
      void cacheProducts(rows as unknown as CachedProduct[]);
      return rows;
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
  const clearCart = () => { setCart([]); setAgeVerification(null); setDiscount(null); setLoyalty(null); setLoyaltyRedemption(0); setCartOpen(false); };

  const addCustomItem = (item: { name: string; price: number; taxable: boolean }) => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const p: Product = {
      id,
      name: item.name,
      price: item.price,
      cost: 0,
      sku: null,
      barcode: null,
      stock: 0,
      taxable: item.taxable,
      category_id: null,
      is_favorite: false,
      store_id: store?.id ?? null,
      image_url: null,
      age_restricted: false,
      min_age: null,
      age_category: null,
    };
    setCart((cur) => [...cur, { product: p, qty: 1 }]);
    toast.success(`Added ${item.name} · ${fmtCurrency(item.price, currency)}`);
  };

  const restrictedItems: RestrictedItem[] = useMemo(
    () =>
      cart
        .filter((l) => l.product.age_restricted)
        .map((l) => ({
          product_id: l.product.id,
          name: l.product.name,
          min_age: Number(l.product.min_age ?? 21) || 21,
          category: l.product.age_category ?? null,
        })),
    [cart],
  );
  const needsAgeVerification =
    ageSettings.enabled && restrictedItems.length > 0 && !ageVerification;

  const removeAllRestricted = () => {
    setCart((cur) => cur.filter((l) => !l.product.age_restricted));
  };

  const subtotal = Math.round(cart.reduce((s, l) => s + l.product.price * l.qty, 0) * 100) / 100;
  const manualDiscount = !discount
    ? 0
    : discount.mode === "percent"
      ? Math.min(subtotal, Math.round(subtotal * discount.value) / 100)
      : Math.min(subtotal, Math.round(discount.value * 100) / 100);
  const effectiveLoyaltyRedemption = Math.min(Math.max(0, subtotal - manualDiscount), loyaltyRedemption);
  const discountAmount = Math.round((manualDiscount + effectiveLoyaltyRedemption) * 100) / 100;
  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxableBase = cart.reduce((s, l) => s + (l.product.taxable ? l.product.price * l.qty : 0), 0);
  const taxableAfterDiscount = Math.max(0, taxableBase * (1 - discountRatio));
  const tax = Math.round(taxableAfterDiscount * taxRate * 100) / 100;
  const total = Math.max(0, Math.round((subtotal - discountAmount + tax) * 100) / 100);
  const loyaltyEarn = loyalty ? Math.floor(Math.max(0, subtotal - discountAmount)) : 0;

  // Sale is written ONLY after payment is confirmed.
  const finalize = useMutation({
    mutationFn: async (payment: CompletedPayment) => {
      // ---- OFFLINE CASH PATH ---------------------------------------------
      // When offline, only cash is allowed. Save to IndexedDB, mark
      // Pending sync, and produce a local receipt. Never call the network.
      if (!isOnlineNow() && payment.method === "cash") {
        // getSession() reads from local storage (no network). getUser()
        // hits /auth/v1/user and stalls / fails while offline, which
        // previously prevented the sale from ever persisting.
        const { data: sess } = await supabase.auth.getSession();
        const cachedProfile = await readMeta<{ id?: string } | null>("profile");
        const uid = sess.session?.user?.id ?? cachedProfile?.id ?? profile?.id ?? null;
        if (!uid) throw new SaleError("auth", "You are signed out. Sign in while online, then try again.");
        const storeId = store?.id ?? (await readMeta<{ id?: string } | null>("store"))?.id ?? null;
        if (!storeId) {
          throw new SaleError(
            "auth",
            "Store information hasn't synced to this device yet. Connect to the internet once to prepare offline mode.",
          );
        }
        const localId = crypto.randomUUID();
        const seq = await nextSeq();
        // Best-effort register session from cache (never fatal offline).
        let registerSessionId: string | null = null;
        try {
          const rs = await readMeta<{ id: string } | null>("open_register_session");
          registerSessionId = rs?.id ?? null;
        } catch { /* noop */ }
        await saveOfflineSale({
          id: localId,
          idempotency_key: localId,
          correlation_id: crypto.randomUUID(),
          payload_version: OFFLINE_PAYLOAD_VERSION,
          store_id: storeId,
          register_session_id: registerSessionId,
          cashier_id: uid,
          device_id: getDeviceId(),
          local_seq: seq,
          local_created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: "pending",
          attempts: 0,
          subtotal, tax, discount: discountAmount, total,
          amount_tendered: payment.amountTendered,
          change_due: payment.changeDue,
          currency,
          items: cart.map((l) => ({
            product_id: l.product.id.startsWith("custom-") ? null : l.product.id,
            product_name: l.product.name,
            quantity: l.qty,
            unit_price: l.product.price,
            line_total: Math.round(l.product.price * l.qty * 100) / 100,
          })),
        });
        return {
          sale: {
            id: localId,
            receipt_number: `LOCAL-${seq}`,
            created_at: new Date().toISOString(),
            _offline: true,
          },
          payment,
        };
      }


      // 1. Auth
      const { data: u, error: authErr } = await supabase.auth.getUser();
      if (authErr || !u.user) {
        throw new SaleError("auth", "Your session has expired. Please sign in again.", authErr);
      }

      const terminalRef =
        payment.reference ||
        (payment.cardBrand && payment.last4 ? `${payment.cardBrand} ••${payment.last4}` : null);

      // 2. Register session lookup (non-fatal)
      let registerSessionId: string | null = null;
      if (store?.id) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: rs } = await (supabase.from as any)("register_sessions")
            .select("id")
            .eq("store_id", store.id)
            .eq("status", "open")
            .order("opened_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          registerSessionId = rs?.id ?? null;
        } catch (err) {
          console.warn("[sale] register session lookup failed (non-fatal):", err);
        }
      }

      // 3. Insert sale header
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sale, error: saleErr } = await (supabase.from as any)("sales")
        .insert({
          store_id: store?.id ?? null,
          cashier_id: u.user.id,
          subtotal,
          tax,
          discount: discountAmount,
          total,
          payment_method: payment.method,
          amount_tendered: payment.amountTendered,
          change_due: payment.changeDue,
          terminal_ref: terminalRef,
          register_session_id: registerSessionId,
          status: "completed",
        })
        .select()
        .single();
      if (saleErr || !sale) {
        throw new SaleError(
          "sale_insert",
          friendlyDbMessage(saleErr, "Unable to save sale. Please try again."),
          saleErr,
        );
      }

      // 4. Insert sale items — DB trigger decrements stock
      const items = cart.map((l) => ({
        sale_id: sale.id,
        product_id: l.product.id.startsWith("custom-") ? null : l.product.id,
        product_name: l.product.name,
        quantity: l.qty,
        unit_price: l.product.price,
        line_total: Math.round(l.product.price * l.qty * 100) / 100,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) {
        // Roll back the sale header so we don't leave an orphan
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from as any)("sales").delete().eq("id", sale.id);
        } catch (rollbackErr) {
          console.error("[sale] rollback of sale header failed:", rollbackErr);
        }
        const isStock = /stock|inventory|negative/i.test(itemsErr.message ?? "");
        throw new SaleError(
          isStock ? "inventory" : "sale_items_insert",
          isStock
            ? "Inventory update failed. Please check stock levels and try again."
            : friendlyDbMessage(itemsErr, "Unable to save sale items. Please try again."),
          itemsErr,
        );
      }
      return { sale, payment };
    },
    onSuccess: ({ sale, payment }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isOffline = (sale as any)._offline === true;
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
        discount: discountAmount,
        total,
        paymentMethod: payment.method,
        amountTendered: payment.amountTendered,
        changeDue: payment.changeDue,
        cardBrand: payment.cardBrand,
        last4: payment.last4,
        reference: isOffline ? null : payment.reference,
        pendingSync: isOffline,
      };
      setReceipt(rd);
      setReceiptOpen(true);
      toast.success(
        isOffline
          ? `Offline sale saved · ${fmtCurrency(total, currency)} — will sync when online`
          : `Sale completed · ${fmtCurrency(total, currency)}`,
      );
      if (loyalty) {
        if (effectiveLoyaltyRedemption > 0) {
          spendLoyaltyPoints(loyalty.identifier, Math.round(effectiveLoyaltyRedemption * 100));
        }
        if (loyaltyEarn > 0) {
          accrueLoyaltyPoints(loyalty.identifier, loyaltyEarn);
          toast.info(`+${loyaltyEarn} loyalty points earned`);
        }
      }
      if (!isOffline) {
        // Fire-and-forget: audit log failure must NOT cancel the sale.
        void import("@/lib/audit-log")
          .then((m) => m.logAudit({
            action: "sale.create", entity: "sale", entity_id: rd.transactionId,
            details: { total, method: payment.method, items: cart.length },
          }))
          .catch((err) => console.warn("[sale] audit log failed (non-fatal):", err));
      }
      clearCart();
      setPayOpen(false);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      // If we came back online in the meantime, drain the queue.
      if (navigator.onLine) void syncNow();
    },
    onError: (e) => {
      // Always log the real error for developers
      console.error("[sale] finalize failed:", e);
      const friendly = e instanceof SaleError
        ? e.message
        : "Unable to complete sale. Please try again.";
      const detail = import.meta.env.DEV && e instanceof Error
        ? (e instanceof SaleError && e.cause instanceof Error ? e.cause.message : e.message)
        : undefined;
      toast.error(friendly, detail ? { description: detail } : undefined);
    },
  });

  // Android shell: broadcast cart + payment activity so the hardware back
  // button, backgrounding, and resume flows can protect the transaction.
  // No-op on web (no shell listener registered).
  useNativeActivitySignal({ hasCart: cart.length > 0, paymentBusy: finalize.isPending });




  // Force cash tender while offline (card, tap, wallets need connectivity).
  useEffect(() => {
    if (!online && tender !== "cash") setTender("cash");
  }, [online, tender]);

  const openPayment = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (!online && tender !== "cash") {
      toast.error("Card payments require an internet connection.");
      return;
    }
    if (needsAgeVerification) {
      setAgeOpen(true);
      return;
    }
    setPayOpen(true);
  };

  // Auto-open verification whenever restricted items enter an unverified cart
  useEffect(() => {
    if (needsAgeVerification && !ageOpen) setAgeOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictedItems.length]);

  const cartPanel = (
    <>
      <div className="p-4 md:p-6 pb-3 flex items-center justify-between">
        <h2 className="font-semibold">Current Sale</h2>
        {cart.length > 0 && (
          <button onClick={clearCart} className="text-xs text-destructive font-medium hover:bg-destructive/10 px-2 py-1 rounded">
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 space-y-3">
        {cart.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground py-10">Cart is empty</div>
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 ml-1 text-destructive hover:bg-destructive/10 text-[11px] font-semibold"
                    onClick={() => { setVoidReason(""); setVoidLine(line); }}
                    aria-label="Void item"
                  >
                    <Trash2 className="size-3 mr-1" /> Void
                  </Button>
                </div>
              </div>
              <p className="text-sm font-mono font-semibold">
                {fmtCurrency(line.product.price * line.qty, currency)}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="p-4 md:p-6 border-t bg-surface/40" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="space-y-1.5 mb-4">
          <Row label="Subtotal" value={fmtCurrency(subtotal, currency)} />
          {discount && (
            <div className="flex justify-between text-sm text-success">
              <button className="underline underline-offset-2" onClick={() => setDiscountOpen(true)}>
                Discount{discount.code ? ` (${discount.code})` : ""} ({discount.mode === "percent" ? `${discount.value}%` : fmtCurrency(discount.value, currency)})
              </button>
              <span className="font-mono">− {fmtCurrency(manualDiscount, currency)}</span>
            </div>
          )}
          {effectiveLoyaltyRedemption > 0 && (
            <div className="flex justify-between text-sm text-success">
              <button className="underline underline-offset-2" onClick={() => setLoyaltyOpen(true)}>
                Loyalty redeem
              </button>
              <span className="font-mono">− {fmtCurrency(effectiveLoyaltyRedemption, currency)}</span>
            </div>
          )}
          <Row label={`Tax (${(taxRate * 100).toFixed(2)}%)`} value={fmtCurrency(tax, currency)} />
          <div className="flex justify-between text-2xl font-bold pt-2 border-t border-dashed">
            <span>Total</span>
            <span className="font-mono">{fmtCurrency(total, currency)}</span>
          </div>
          {loyalty && loyaltyEarn > 0 && (
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Loyalty · {loyalty.identifier}</span>
              <span>+{loyaltyEarn} pts</span>
            </div>
          )}
        </div>

        {!online && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            Offline mode — cash sales will be saved on this register and synced when connection returns. Card payments require an internet connection.
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {TENDER.map((t) => {
            const Icon = t.icon;
            const active = tender === t.id;
            const disabled = !online && t.id !== "cash";
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (disabled) {
                    toast.error("Card payments require an internet connection.");
                    return;
                  }
                  setTender(t.id);
                }}
                disabled={disabled}
                aria-disabled={disabled}
                title={disabled ? "Card payments require an internet connection." : undefined}
                className={cn(
                  "h-12 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors",
                  active ? "border-primary bg-primary/5 text-primary" : "bg-card hover:bg-accent",
                  disabled && "opacity-40 cursor-not-allowed hover:bg-card",
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {restrictedItems.length > 0 && (
          <div
            className={cn(
              "mb-2 px-3 py-2 rounded-md text-xs font-medium flex items-center justify-between border",
              ageVerification
                ? "bg-success/10 border-success/30 text-success"
                : "bg-warning/10 border-warning/40 text-warning",
            )}
          >
            <span>
              {ageVerification
                ? `Age verified (${ageVerification.ageYears}+ · ${ageVerification.method === "override" ? "manager override" : ageVerification.method === "manual" ? "manual" : "ID scan"})`
                : `${restrictedItems.length} age-restricted item${restrictedItems.length > 1 ? "s" : ""} — ID required`}
            </span>
            {!ageVerification && (
              <button className="underline" onClick={() => setAgeOpen(true)}>
                Verify now
              </button>
            )}
          </div>
        )}
        <Button
          onClick={openPayment}
          disabled={cart.length === 0 || finalize.isPending}
          className="w-full h-16 text-lg font-bold rounded-xl shadow-[var(--shadow-charge)]"
        >
          {finalize.isPending
            ? <Loader2 className="size-5 animate-spin" />
            : needsAgeVerification
              ? <>Verify Age to Charge {fmtCurrency(total, currency)}</>
              : <>Charge {fmtCurrency(total, currency)}</>}
        </Button>
      </div>
    </>
  );

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

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

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <section className="flex-1 md:flex-[7] flex flex-col md:border-r bg-surface/40 min-w-0 pb-36 md:pb-0">

          <div className="p-4 flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search products or scan barcode"
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
                  className="h-12 pl-10 pr-14 bg-card text-sm"
                />
                <kbd className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 border rounded text-[10px] font-mono text-muted-foreground">
                  ⌘K
                </kbd>
              </div>
              {showMobileCamera && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setScannerOpen(true)}
                  className="h-12 w-12 shrink-0"
                  title="Scan product barcode with camera"
                  aria-label="Scan product barcode"
                >
                  <Camera className="size-5" />
                </Button>
              )}
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Button
                variant="outline"
                className="h-10"
                onClick={() => setCustomOpen(true)}
                disabled={!canManage}
                title={canManage ? "Add a custom item" : "Owner or manager approval required"}
              >
                <Plus className="size-4 mr-2" />Add item
              </Button>
              <Button variant="outline" className="h-10" onClick={() => setDiscountOpen(true)}>
                <Percent className="size-4 mr-2" />
                {discount ? "Edit discount" : "Discount"}
              </Button>
              <Button variant="outline" className="h-10" onClick={() => setLoyaltyOpen(true)}>
                <Heart className="size-4 mr-2" />
                {loyalty ? "Loyalty ✓" : "Loyalty"}
              </Button>
              <Button variant="outline" className="h-10" asChild>
                <Link to="/refunds"><RotateCcw className="size-4 mr-2" />Refund</Link>
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-0">
            <h2 className="sr-only">Product catalog</h2>
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
                  <ProductTile key={p.id} product={p} currency={currency} onAdd={addToCart} />
                ))}
              </div>

            )}
          </div>
        </section>

        <section className="hidden md:flex w-[420px] flex-none flex-col bg-card">
          {cartPanel}
        </section>
      </div>

      {/* Mobile cart FAB */}
      {cart.length > 0 && (
        <div
          className="md:hidden fixed inset-x-0 bottom-14 z-30 p-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <Button
            onClick={() => setCartOpen(true)}
            className="w-full h-14 text-base font-bold rounded-xl shadow-lg flex items-center justify-between px-4"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="size-5" />
              View cart · {cartCount} item{cartCount === 1 ? "" : "s"}
            </span>
            <span className="font-mono">{fmtCurrency(total, currency)}</span>
          </Button>
        </div>
      )}

      {/* Mobile cart sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-4 pb-0">
            <SheetTitle>Current sale</SheetTitle>
          </SheetHeader>
          <div className="flex-1 flex flex-col min-h-0">
            {cartPanel}
          </div>
        </SheetContent>
      </Sheet>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        method={tender}
        total={total}
        currency={currency}
        onComplete={(p) => finalize.mutate(p)}
      />

      <ReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} data={receipt} />

      <AgeVerificationDialog
        open={ageOpen}
        onOpenChange={setAgeOpen}
        items={restrictedItems}
        settings={ageSettings}
        storeId={store?.id ?? null}
        onVerified={(v) => {
          setAgeVerification(v);
          toast.success("Age verified — checkout may continue");
        }}
        onRemoveRestricted={() => {
          removeAllRestricted();
          toast.info("Age-restricted items removed from cart");
        }}
        onCancelSale={() => {
          clearCart();
          setAgeOpen(false);
          toast.info("Sale canceled");
        }}
      />

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => {
          if (!tryAddByCode(code)) {
            toast.error(`No product found for ${code}`);
          }
        }}
      />

      <CustomItemDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        currency={currency}
        onAdd={addCustomItem}
      />

      <DiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        subtotal={subtotal}
        currency={currency}
        current={discount}
        onApply={setDiscount}
      />

      <LoyaltyDialog
        open={loyaltyOpen}
        onOpenChange={setLoyaltyOpen}
        subtotal={Math.max(0, subtotal - manualDiscount)}
        currency={currency}
        current={loyalty}
        redemption={loyaltyRedemption}
        onApply={(cust, amt) => { setLoyalty(cust); setLoyaltyRedemption(amt); }}
      />

      <Dialog open={!!voidLine} onOpenChange={(v) => { if (!v) setVoidLine(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Void item</DialogTitle>
            <DialogDescription>
              Remove <span className="font-semibold text-foreground">{voidLine?.product.name}</span> from the current sale. This is recorded in the shift audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason (optional)</Label>
            <Input
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. customer changed mind, wrong scan"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidLine(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!voidLine) return;
                const l = voidLine;
                removeLine(l.product.id);
                void logAudit({
                  action: "sale.item.void",
                  entity: "cart_line",
                  entity_id: l.product.id,
                  details: {
                    product_name: l.product.name,
                    qty: l.qty,
                    unit_price: l.product.price,
                    line_total: Math.round(l.product.price * l.qty * 100) / 100,
                    reason: voidReason || null,
                  },
                });
                toast.info(`Voided ${l.product.name}`);
                setVoidLine(null);
                setVoidReason("");
              }}
            >
              Void item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>


  );
}

function ProductTile({ product, currency, onAdd }: { product: Product; currency: string; onAdd: (p: Product) => void }) {
  const url = useProductImageUrl(product.image_url);
  return (
    <button
      onClick={() => onAdd(product)}
      className="aspect-square bg-card border rounded-xl p-3 flex flex-col justify-between text-left hover:border-primary/60 hover:shadow-md transition-all active:scale-[0.97] group relative overflow-hidden"
    >
      {url && (
        <img
          src={url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
        />
      )}
      {url && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />}
      <div className={cn("text-[10px] font-mono relative", url ? "text-white/90" : "text-muted-foreground group-hover:text-primary")}>
        {fmtCurrency(Number(product.price), currency)}
      </div>
      <div className="relative">
        <div className={cn("text-sm font-semibold leading-tight line-clamp-2", url && "text-white")}>{product.name}</div>
        <div className={cn("text-[10px] mt-1", url ? "text-white/70" : "text-muted-foreground")}>Stock: {Number(product.stock)}</div>
      </div>
    </button>
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
