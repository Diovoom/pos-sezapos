import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2, ChevronLeft, ChevronRight, SkipForward, Check, PartyPopper, Rocket,
  Store as StoreIcon, User, Percent, Receipt, Users, Package, Printer, CreditCard,
  ShoppingCart, ClipboardCheck, LogOut, ExternalLink, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountryList } from "@/hooks/useLocale";
import { LEGAL_CONFIG } from "@/lib/legal/config";

function CountrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: countries = [] } = useCountryList();
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
      <SelectContent className="max-h-[320px]">
        {countries.map((c) => (
          <SelectItem key={c.country_code} value={c.country_code}>
            {c.country_name} ({c.country_code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const Route = createFileRoute("/_dashboard/setup")({
  head: () => ({ meta: [{ title: "Store setup — SEZA POS" }, { name: "description", content: "Configure your store details, currency, and tax rates before going live." }] }),
  component: SetupWizardPage,
});

type WizardState = {
  step: number;
  owner: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    accepted_terms: boolean;
    legal_accepted_at: string | null;
    terms_version: string | null;
    privacy_version: string | null;
  };
  store: {
    name: string; business_type: string; tax_id: string; address: string; city: string; state: string;
    zip: string; country: string; phone: string; email: string; website: string; logo_url: string;
    hours: string;
  };
  tax: { rate: number; inclusive: boolean; currency: string; currency_symbol: string; time_zone: string; date_format: string; language: string };
  receipt: { header: string; footer: string; return_policy: string; thank_you: string; qr_url: string; website: string; social: { facebook: string; instagram: string; twitter: string } };
  employee: { skip: boolean; first_name: string; last_name: string; role: "cashier" | "manager" | "admin"; email: string; phone: string };
  products: { mode: "manual" | "import" | "skip"; items: { name: string; price: number; sku: string; stock: number }[]; csv: string };
  hardware: { printer: boolean; scanner: boolean; drawer: boolean; display: boolean; terminal: boolean };
  payments: { provider: "cash_only" | "stripe" | "square" | "clover" };
  test_sale: { added: boolean; scanned: boolean; paid: boolean; printed: boolean };
};

const STEPS = [
  { id: 0, label: "Welcome", icon: Rocket },
  { id: 1, label: "Owner", icon: User },
  { id: 2, label: "Store", icon: StoreIcon },
  { id: 3, label: "Taxes & Currency", icon: Percent },
  { id: 4, label: "Receipt", icon: Receipt },
  { id: 5, label: "Employee", icon: Users },
  { id: 6, label: "Products", icon: Package },
  { id: 7, label: "Hardware", icon: Printer },
  { id: 8, label: "Payments", icon: CreditCard },
  { id: 9, label: "Test Sale", icon: ShoppingCart },
  { id: 10, label: "Review", icon: ClipboardCheck },
  { id: 11, label: "Finish", icon: PartyPopper },
];

const DEFAULT_STATE = (): WizardState => ({
  step: 0,
  owner: {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    accepted_terms: false,
    legal_accepted_at: null,
    terms_version: null,
    privacy_version: null,
  },
  store: {
    name: "", business_type: "convenience", tax_id: "", address: "", city: "", state: "",
    zip: "", country: "US", phone: "", email: "", website: "", logo_url: "",
    hours: "Mon–Sun 8:00–22:00",
  },
  tax: { rate: 8.25, inclusive: false, currency: "USD", currency_symbol: "$", time_zone: "America/New_York", date_format: "MM/DD/YYYY", language: "en" },
  receipt: { header: "", footer: "Thank you for shopping with us!", return_policy: "Returns accepted within 14 days with receipt.", thank_you: "Have a great day!", qr_url: "", website: "", social: { facebook: "", instagram: "", twitter: "" } },
  employee: { skip: true, first_name: "", last_name: "", role: "cashier", email: "", phone: "" },
  products: { mode: "skip", items: [], csv: "" },
  hardware: { printer: false, scanner: false, drawer: false, display: false, terminal: false },
  payments: { provider: "cash_only" },
  test_sale: { added: false, scanned: false, paid: false, printed: false },
});

function SetupWizardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const store = me.data?.store as { id?: string; setup_state?: WizardState | null; setup_completed_at?: string | null } | null;
  const isOwner = (me.data?.roles ?? []).includes("owner");

  useEffect(() => {
    if (!me.data || loaded) return;
    if (!isOwner) {
      toast.error("Only the Owner can run setup.");
      navigate({ to: "/pos", replace: true });
      return;
    }
    const saved = (store?.setup_state as Partial<WizardState> | undefined) ?? {};
    setState((s) => ({
      ...s,
      ...saved,
      owner: {
        ...s.owner,
        first_name: me.data?.profile?.first_name ?? saved.owner?.first_name ?? "",
        last_name: me.data?.profile?.last_name ?? saved.owner?.last_name ?? "",
        email: me.data?.user.email ?? saved.owner?.email ?? "",
        phone: me.data?.profile?.phone ?? saved.owner?.phone ?? "",
        accepted_terms: saved.owner?.accepted_terms ?? false,
        legal_accepted_at: saved.owner?.legal_accepted_at ?? null,
        terms_version: saved.owner?.terms_version ?? null,
        privacy_version: saved.owner?.privacy_version ?? null,
      },
      store: {
        ...s.store,
        ...(saved.store ?? {}),
        name: saved.store?.name ?? store?.["name" as keyof typeof store] as string ?? s.store.name,
      },
      step: saved.step ?? 0,
    }));
    setLoaded(true);
  }, [me.data, loaded, isOwner, navigate, store]);

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));
  const patchStore = (p: Partial<WizardState["store"]>) => setState((s) => ({ ...s, store: { ...s.store, ...p } }));
  const patchOwner = (p: Partial<WizardState["owner"]>) => setState((s) => ({ ...s, owner: { ...s.owner, ...p } }));
  const patchTax = (p: Partial<WizardState["tax"]>) => setState((s) => ({ ...s, tax: { ...s.tax, ...p } }));
  const patchReceipt = (p: Partial<WizardState["receipt"]>) => setState((s) => ({ ...s, receipt: { ...s.receipt, ...p } }));

  const persist = async (next: WizardState, opts?: { complete?: boolean }): Promise<boolean> => {
    if (!store?.id) return false;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { setup_state: next as unknown as Record<string, unknown> };
      // Reflect key fields into their real columns as we go so they take effect immediately.
      if (next.store.name) patch.name = next.store.name;
      Object.assign(patch, {
        address: next.store.address || null, city: next.store.city || null, state: next.store.state || null,
        zip: next.store.zip || null, country: next.store.country || null, phone: next.store.phone || null,
        email: next.store.email || null, website: next.store.website || null, tax_id: next.store.tax_id || null,
        business_type: next.store.business_type || null, logo_url: next.store.logo_url || null,
        tax_rate: next.tax.rate, tax_inclusive: next.tax.inclusive, currency: next.tax.currency,
        currency_symbol: next.tax.currency_symbol, time_zone: next.tax.time_zone,
        date_format: next.tax.date_format, language: next.tax.language,
        receipt_header: next.receipt.header || null, receipt_footer: next.receipt.footer || null,
        return_policy: next.receipt.return_policy || null,
        thank_you_message: next.receipt.thank_you || null,
        social_links: next.receipt.social as unknown as Record<string, unknown>,
        business_hours: { text: next.store.hours } as unknown as Record<string, unknown>,
      });
      if (opts?.complete) patch.setup_completed_at = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("stores") as any).update(patch).eq("id", store.id);
      if (error) throw error;
      // Owner profile
      if (me.data?.user.id) {
        await supabase.from("profiles").update({
          first_name: next.owner.first_name || null,
          last_name: next.owner.last_name || null,
          phone: next.owner.phone || null,
        }).eq("id", me.data.user.id);
      }

      if (
        next.owner.accepted_terms &&
        next.owner.legal_accepted_at &&
        next.owner.terms_version &&
        next.owner.privacy_version
      ) {
        // The RPC derives user/store from the authenticated session and is idempotent by policy version.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: legalError } = await (supabase.rpc as any)("record_legal_acceptance", {
          p_terms_version: next.owner.terms_version,
          p_privacy_version: next.owner.privacy_version,
          p_accepted_at: next.owner.legal_accepted_at,
          p_source: "setup_wizard",
        });
        if (legalError) throw legalError;
      }
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goTo = async (step: number) => {
    const nextState = { ...state, step };
    const saved = await persist(nextState);
    if (saved) setState(nextState);
  };
  const next = () => goTo(Math.min(state.step + 1, STEPS.length - 1));
  const back = () => goTo(Math.max(state.step - 1, 0));

  const canContinue = useMemo(() => {
    switch (state.step) {
      case 1: return !!state.owner.first_name && !!state.owner.last_name && !!state.owner.email && state.owner.accepted_terms;
      case 2: return !!state.store.name;
      case 3: return state.tax.rate >= 0 && !!state.tax.currency;
      default: return true;
    }
  }, [state]);

  const finish = async () => {
    setFinishing(true);
    try {
      // Add employee if provided
      if (!state.employee.skip && state.employee.first_name && state.employee.email) {
        // Create as a profile row with a random employee_id (owner can invite later)
        toast.info("Employee will be created from Employees page — settings saved.");
      }
      // Add products if manual entries provided
      if (state.products.mode === "manual" && state.products.items.length && store?.id) {
        const rows = state.products.items
          .filter((p) => p.name)
          .map((p) => ({
            store_id: store.id!,
            name: p.name,
            sku: p.sku || null,
            price: Number(p.price) || 0,
            stock: Number(p.stock) || 0,
            taxable: true,
          }));
        if (rows.length) {
          const { error } = await supabase.from("products").insert(rows);
          if (error) toast.error(`Products: ${error.message}`);
        }
      }
      const saved = await persist(state, { complete: true });
      if (!saved) return false;
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Setup complete!");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Setup could not be completed");
      return false;
    } finally {
      setFinishing(false);
    }
  };

  const uploadLogo = async (file: File, field: "logo_url" | "receipt_logo_url") => {
    if (!store?.id) return;
    try {
      const path = `${store.id}/${field}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = data?.signedUrl ?? "";
      if (field === "logo_url") patchStore({ logo_url: url });
      else await supabase.from("stores").update({ receipt_logo_url: url }).eq("id", store.id);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  if (!loaded || me.isLoading) {
    return <div className="p-10 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  const progress = ((state.step + 1) / STEPS.length) * 100;
  const StepIcon = STEPS[state.step].icon;

  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 grid place-items-center text-primary"><StepIcon className="size-5" /></div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Step {state.step + 1} of {STEPS.length}</div>
              <h1 className="text-xl font-semibold">{STEPS[state.step].label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saving ? <><Loader2 className="size-3 animate-spin" /> Saving…</> : <><Check className="size-3 text-emerald-500" /> Saved</>}
          </div>
        </div>

        <Progress value={progress} />

        <div className="hidden md:flex items-center gap-1 overflow-x-auto text-xs">
          {STEPS.map((s) => (
            <button
              key={s.id}
              onClick={() => goTo(s.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md whitespace-nowrap transition-colors",
                s.id === state.step ? "bg-primary text-primary-foreground" :
                  s.id < state.step ? "text-foreground hover:bg-accent" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {s.id < state.step ? <Check className="size-3" /> : <s.icon className="size-3" />}
              {s.label}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            {state.step === 0 && <StepWelcome onStart={() => goTo(1)} onExit={() => navigate({ to: "/pos" })} />}
            {state.step === 1 && <StepOwner state={state} patch={patchOwner} />}
            {state.step === 2 && <StepStore state={state} patch={patchStore} onLogo={(f) => uploadLogo(f, "logo_url")} />}
            {state.step === 3 && <StepTaxes state={state} patch={patchTax} />}
            {state.step === 4 && <StepReceipt state={state} patch={patchReceipt} onLogo={(f) => uploadLogo(f, "receipt_logo_url")} />}
            {state.step === 5 && <StepEmployee state={state} patch={(p) => setState((s) => ({ ...s, employee: { ...s.employee, ...p } }))} />}
            {state.step === 6 && <StepProducts state={state} patch={(p) => setState((s) => ({ ...s, products: { ...s.products, ...p } }))} />}
            {state.step === 7 && <StepHardware state={state} patch={(p) => setState((s) => ({ ...s, hardware: { ...s.hardware, ...p } }))} />}
            {state.step === 8 && <StepPayments state={state} patch={(p) => setState((s) => ({ ...s, payments: { ...s.payments, ...p } }))} />}
            {state.step === 9 && <StepTestSale state={state} patch={(p) => setState((s) => ({ ...s, test_sale: { ...s.test_sale, ...p } }))} />}
            {state.step === 10 && <StepReview state={state} goTo={goTo} />}
            {state.step === 11 && <StepFinish onDone={() => navigate({ to: "/dashboard" })} onSettings={() => navigate({ to: "/settings" })} />}
          </CardContent>
        </Card>

        {state.step > 0 && state.step < 11 && (
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={back} disabled={state.step === 0}><ChevronLeft className="size-4" /> Back</Button>
            <div className="flex items-center gap-2">
              {[5, 6, 7, 8, 9].includes(state.step) && (
                <Button variant="ghost" onClick={next}><SkipForward className="size-4" /> Skip</Button>
              )}
              {state.step < 10 && (
                <Button onClick={next} disabled={!canContinue}>Save & Continue <ChevronRight className="size-4" /></Button>
              )}
              {state.step === 10 && (
                <Button onClick={async () => { if (await finish()) await goTo(11); }} disabled={finishing}>
                  {finishing && <Loader2 className="size-4 animate-spin" />} Finish Setup
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Steps --------------------------------- */

function StepWelcome({ onStart, onExit }: { onStart: () => void; onExit: () => void }) {
  return (
    <div className="text-center py-10 space-y-6">
      <div className="size-16 rounded-2xl bg-primary/10 text-primary grid place-items-center mx-auto"><Rocket className="size-8" /></div>
      <div className="space-y-2">
        <h2 className="text-3xl font-bold">Welcome to SEZA POS</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Let's get your business up and running. This wizard walks you through everything you need — owner account,
          store details, taxes, receipts, employees, products, hardware, and payments. It takes about 5 minutes.
        </p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button size="lg" onClick={onStart}><Rocket className="size-4" /> Start Setup</Button>
        <Button size="lg" variant="ghost" onClick={onExit}><LogOut className="size-4" /> Exit</Button>
      </div>
    </div>
  );
}

function StepOwner({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState["owner"]>) => void }) {
  const o = state.owner;
  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        You are the Owner. Confirm your details — your Owner role and 6-digit Employee ID are already assigned.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="First name" required><Input value={o.first_name} onChange={(e) => patch({ first_name: e.target.value })} /></Field>
        <Field label="Last name" required><Input value={o.last_name} onChange={(e) => patch({ last_name: e.target.value })} /></Field>
        <Field label="Business email" required><Input type="email" value={o.email} disabled /></Field>
        <Field label="Phone number"><Input value={o.phone} onChange={(e) => patch({ phone: e.target.value })} /></Field>
      </div>
      <div className="flex items-start gap-2 pt-2">
        <Checkbox
          id="terms"
          checked={o.accepted_terms}
          onCheckedChange={(value) => {
            const accepted = value === true;
            patch({
              accepted_terms: accepted,
              legal_accepted_at: accepted ? new Date().toISOString() : null,
              terms_version: accepted ? LEGAL_CONFIG.termsVersion : null,
              privacy_version: accepted ? LEGAL_CONFIG.privacyVersion : null,
            });
          }}
        />
        <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight">
          I accept the{" "}
          <Link
            className="underline underline-offset-4 hover:text-foreground"
            to="/legal/$slug"
            params={{ slug: "terms" }}
            target="_blank"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            className="underline underline-offset-4 hover:text-foreground"
            to="/legal/$slug"
            params={{ slug: "privacy" }}
            target="_blank"
          >
            Privacy Policy
          </Link>
          .
        </label>
      </div>
    </div>
  );
}

function StepStore({ state, patch, onLogo }: { state: WizardState; patch: (p: Partial<WizardState["store"]>) => void; onLogo: (f: File) => void }) {
  const s = state.store;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="size-20 rounded-xl border bg-muted overflow-hidden grid place-items-center">
          {s.logo_url ? <img src={s.logo_url} alt="Logo" className="w-full h-full object-cover" /> : <StoreIcon className="size-8 text-muted-foreground" />}
        </div>
        <label className="cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
          <span className="inline-flex items-center gap-2 h-9 px-4 rounded-md border bg-background text-sm hover:bg-accent"><Upload className="size-4" /> Upload logo</span>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Store name" required><Input value={s.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
        <Field label="Business type">
          <Select value={s.business_type} onValueChange={(v) => patch({ business_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["convenience", "grocery", "liquor", "restaurant", "retail", "coffee_shop", "other"].map((t) =>
                <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tax ID (optional)"><Input value={s.tax_id} onChange={(e) => patch({ tax_id: e.target.value })} /></Field>
        <Field label="Phone"><Input value={s.phone} onChange={(e) => patch({ phone: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={s.email} onChange={(e) => patch({ email: e.target.value })} /></Field>
        <Field label="Website"><Input value={s.website} onChange={(e) => patch({ website: e.target.value })} placeholder="https://" /></Field>
        <Field label="Address" className="md:col-span-2"><Input value={s.address} onChange={(e) => patch({ address: e.target.value })} /></Field>
        <Field label="City"><Input value={s.city} onChange={(e) => patch({ city: e.target.value })} /></Field>
        <Field label="State / Province"><Input value={s.state} onChange={(e) => patch({ state: e.target.value })} /></Field>
        <Field label="Postal code"><Input value={s.zip} onChange={(e) => patch({ zip: e.target.value })} /></Field>
        <Field label="Country"><CountrySelect value={s.country} onChange={(v) => patch({ country: v })} /></Field>
        <Field label="Business hours" className="md:col-span-2"><Input value={s.hours} onChange={(e) => patch({ hours: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function StepTaxes({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState["tax"]>) => void }) {
  const t = state.tax;
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Field label="Default tax rate (%)" required>
          <Input type="number" step="0.001" value={t.rate} onChange={(e) => patch({ rate: Number(e.target.value) || 0 })} />
        </Field>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div><div className="text-sm font-medium">Tax inclusive pricing</div><div className="text-xs text-muted-foreground">Prices already include tax</div></div>
          <Switch checked={t.inclusive} onCheckedChange={(v) => patch({ inclusive: v })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency"><Input value={t.currency} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Symbol"><Input value={t.currency_symbol} onChange={(e) => patch({ currency_symbol: e.target.value })} /></Field>
        </div>
        <Field label="Time zone"><Input value={t.time_zone} onChange={(e) => patch({ time_zone: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date format"><Input value={t.date_format} onChange={(e) => patch({ date_format: e.target.value })} /></Field>
          <Field label="Language"><Input value={t.language} onChange={(e) => patch({ language: e.target.value })} /></Field>
        </div>
      </div>
      <ReceiptPreview state={state} />
    </div>
  );
}

function StepReceipt({ state, patch, onLogo }: { state: WizardState; patch: (p: Partial<WizardState["receipt"]>) => void; onLogo: (f: File) => void }) {
  const r = state.receipt;
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <label className="cursor-pointer inline-flex items-center gap-2 h-9 px-4 rounded-md border bg-background text-sm hover:bg-accent">
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
          <Upload className="size-4" /> Upload receipt logo
        </label>
        <Field label="Header message"><Textarea rows={2} value={r.header} onChange={(e) => patch({ header: e.target.value })} placeholder="e.g. Welcome to My Store" /></Field>
        <Field label="Footer message"><Textarea rows={2} value={r.footer} onChange={(e) => patch({ footer: e.target.value })} /></Field>
        <Field label="Return policy"><Textarea rows={2} value={r.return_policy} onChange={(e) => patch({ return_policy: e.target.value })} /></Field>
        <Field label="Thank-you message"><Input value={r.thank_you} onChange={(e) => patch({ thank_you: e.target.value })} /></Field>
        <Field label="QR code URL"><Input value={r.qr_url} onChange={(e) => patch({ qr_url: e.target.value })} placeholder="https://" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Facebook"><Input value={r.social.facebook} onChange={(e) => patch({ social: { ...r.social, facebook: e.target.value } })} /></Field>
          <Field label="Instagram"><Input value={r.social.instagram} onChange={(e) => patch({ social: { ...r.social, instagram: e.target.value } })} /></Field>
          <Field label="Twitter/X"><Input value={r.social.twitter} onChange={(e) => patch({ social: { ...r.social, twitter: e.target.value } })} /></Field>
        </div>
      </div>
      <ReceiptPreview state={state} />
    </div>
  );
}

function StepEmployee({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState["employee"]>) => void }) {
  const e = state.employee;
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between rounded-md border p-3">
        <div><div className="text-sm font-medium">I'll be the only user for now</div><div className="text-xs text-muted-foreground">Skip and add employees later</div></div>
        <Switch checked={e.skip} onCheckedChange={(v) => patch({ skip: v })} />
      </div>
      {!e.skip && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="First name"><Input value={e.first_name} onChange={(ev) => patch({ first_name: ev.target.value })} /></Field>
          <Field label="Last name"><Input value={e.last_name} onChange={(ev) => patch({ last_name: ev.target.value })} /></Field>
          <Field label="Role">
            <Select value={e.role} onValueChange={(v) => patch({ role: v as WizardState["employee"]["role"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cashier">Cashier</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Email"><Input type="email" value={e.email} onChange={(ev) => patch({ email: ev.target.value })} /></Field>
          <Field label="Phone"><Input value={e.phone} onChange={(ev) => patch({ phone: ev.target.value })} /></Field>
        </div>
      )}
      <p className="text-xs text-muted-foreground">A unique 6-digit Employee ID is generated automatically for every user.</p>
    </div>
  );
}

function StepProducts({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState["products"]>) => void }) {
  const p = state.products;
  const parseCsv = (csv: string) => {
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const idx = (k: string) => header.indexOf(k);
    return lines.slice(1).map((line) => {
      const c = line.split(",");
      return {
        name: (c[idx("name")] ?? "").trim(),
        price: Number(c[idx("price")] ?? 0),
        sku: (c[idx("sku")] ?? "").trim(),
        stock: Number(c[idx("stock")] ?? 0),
      };
    }).filter((r) => r.name);
  };
  const parsed = p.mode === "import" ? parseCsv(p.csv) : [];

  return (
    <div className="space-y-4">
      <Tabs value={p.mode} onValueChange={(v) => patch({ mode: v as WizardState["products"]["mode"] })}>
        <TabsList className="grid grid-cols-3">
          <TabsTrigger value="manual">Add manually</TabsTrigger>
          <TabsTrigger value="import">Import CSV</TabsTrigger>
          <TabsTrigger value="skip">Skip</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-3">
          {p.items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Input className="col-span-5" placeholder="Name" value={it.name} onChange={(e) => { const items = [...p.items]; items[i] = { ...it, name: e.target.value }; patch({ items }); }} />
              <Input className="col-span-3" placeholder="SKU" value={it.sku} onChange={(e) => { const items = [...p.items]; items[i] = { ...it, sku: e.target.value }; patch({ items }); }} />
              <Input className="col-span-2" type="number" placeholder="Price" value={it.price} onChange={(e) => { const items = [...p.items]; items[i] = { ...it, price: Number(e.target.value) }; patch({ items }); }} />
              <Input className="col-span-2" type="number" placeholder="Stock" value={it.stock} onChange={(e) => { const items = [...p.items]; items[i] = { ...it, stock: Number(e.target.value) }; patch({ items }); }} />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch({ items: [...p.items, { name: "", price: 0, sku: "", stock: 0 }] })}>+ Add row</Button>
        </TabsContent>

        <TabsContent value="import" className="space-y-3">
          <p className="text-xs text-muted-foreground">Paste CSV with headers: <code className="font-mono">name,sku,price,stock</code></p>
          <Textarea rows={8} placeholder="name,sku,price,stock&#10;Coca-Cola 12oz,COKE-12,1.99,50" value={p.csv} onChange={(e) => patch({ csv: e.target.value })} className="font-mono text-xs" />
          {parsed.length > 0 && (
            <div className="rounded-md border overflow-hidden">
              <div className="px-3 py-2 bg-muted text-xs font-medium">Preview: {parsed.length} product{parsed.length !== 1 ? "s" : ""}</div>
              <div className="max-h-48 overflow-y-auto text-xs">
                {parsed.slice(0, 20).map((r, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2 px-3 py-1.5 border-t">
                    <span>{r.name}</span><span className="text-muted-foreground">{r.sku}</span>
                    <span>${r.price.toFixed(2)}</span><span>{r.stock}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="skip"><p className="text-sm text-muted-foreground py-4">You can add products anytime from the Products page.</p></TabsContent>
      </Tabs>
    </div>
  );
}

function StepHardware({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState["hardware"]>) => void }) {
  const items: { key: keyof WizardState["hardware"]; label: string; desc: string }[] = [
    { key: "printer", label: "Receipt Printer", desc: "USB, network, or Bluetooth printer" },
    { key: "scanner", label: "Barcode Scanner", desc: "USB HID or Bluetooth HID keyboard-emulation" },
    { key: "drawer", label: "Cash Drawer", desc: "Triggered via receipt printer kick-out" },
    { key: "display", label: "Customer Display", desc: "Second monitor or tablet" },
    { key: "terminal", label: "Payment Terminal (optional)", desc: "Configured separately in Settings" },
  ];
  const detect = async (key: keyof WizardState["hardware"]) => {
    try {
      // Best-effort browser device discovery
      const nav = navigator as unknown as { usb?: { requestDevice: (o: unknown) => Promise<unknown> }; bluetooth?: { requestDevice: (o: unknown) => Promise<unknown> } };
      if (key === "scanner" || key === "printer" || key === "drawer") {
        if (nav.usb) await nav.usb.requestDevice({ filters: [] });
      } else if (nav.bluetooth) {
        await nav.bluetooth.requestDevice({ acceptAllDevices: true });
      }
      patch({ [key]: true } as Partial<WizardState["hardware"]>);
      toast.success("Device connected");
    } catch {
      toast.info("No device selected — you can configure this later.");
    }
  };
  return (
    <div className="space-y-3">
      {items.map((h) => (
        <div key={h.key} className="flex items-center gap-3 rounded-md border p-3">
          <div className="flex-1">
            <div className="text-sm font-medium flex items-center gap-2">
              {h.label}
              {state.hardware[h.key] && <Badge variant="secondary" className="text-xs"><Check className="size-3 mr-1" /> Connected</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">{h.desc}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => detect(h.key)}>Detect & Connect</Button>
          <Button size="sm" variant="ghost" onClick={() => patch({ [h.key]: false } as Partial<WizardState["hardware"]>)}>Skip</Button>
        </div>
      ))}
    </div>
  );
}

function StepPayments({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState["payments"]>) => void }) {
  const providers: { id: WizardState["payments"]["provider"]; label: string; desc: string }[] = [
    { id: "cash_only", label: "Cash only (for now)", desc: "Card payments disabled until a terminal is configured." },
    { id: "stripe", label: "Stripe Terminal", desc: "In-person card payments via Stripe" },
    { id: "square", label: "Square", desc: "Square terminals and readers" },
    { id: "clover", label: "Clover", desc: "Clover POS terminals" },
  ];
  return (
    <div className="space-y-3">
      {providers.map((p) => (
        <button
          key={p.id}
          onClick={() => patch({ provider: p.id })}
          className={cn(
            "w-full text-left flex items-start gap-3 rounded-lg border p-4 transition-colors",
            state.payments.provider === p.id ? "border-primary bg-primary/5" : "hover:bg-accent",
          )}
        >
          <div className={cn("size-5 rounded-full border grid place-items-center shrink-0 mt-0.5", state.payments.provider === p.id && "bg-primary border-primary text-primary-foreground")}>
            {state.payments.provider === p.id && <Check className="size-3" />}
          </div>
          <div>
            <div className="font-medium text-sm">{p.label}</div>
            <div className="text-xs text-muted-foreground">{p.desc}</div>
          </div>
        </button>
      ))}
      {state.payments.provider === "cash_only" && (
        <div className="text-xs rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 p-3">
          Reminder: Card payments will remain disabled until a payment terminal is configured in Settings.
        </div>
      )}
    </div>
  );
}

function StepTestSale({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState["test_sale"]>) => void }) {
  const t = state.test_sale;
  const steps: { key: keyof WizardState["test_sale"]; label: string }[] = [
    { key: "added", label: "Added a sample product" },
    { key: "scanned", label: "Scanned or searched for the product" },
    { key: "paid", label: "Completed a cash transaction" },
    { key: "printed", label: "Printed a test receipt (or emailed it)" },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Walk through a sample sale in the POS to confirm everything works. Check each item off as you go.</p>
      {steps.map((s) => (
        <label key={s.key} className="flex items-center gap-3 rounded-md border p-3 cursor-pointer">
          <Checkbox checked={t[s.key]} onCheckedChange={(v) => patch({ [s.key]: !!v } as Partial<WizardState["test_sale"]>)} />
          <span className="text-sm flex-1">{s.label}</span>
        </label>
      ))}
      <Button variant="outline" onClick={() => window.open("/pos", "_blank")}><ExternalLink className="size-4" /> Open POS in new tab</Button>
    </div>
  );
}

function StepReview({ state, goTo }: { state: WizardState; goTo: (n: number) => void }) {
  const rows = [
    { step: 1, label: "Owner", value: `${state.owner.first_name} ${state.owner.last_name} — ${state.owner.email}` },
    { step: 2, label: "Store", value: `${state.store.name || "—"} · ${state.store.city}${state.store.state ? ", " + state.store.state : ""}` },
    { step: 3, label: "Tax & Currency", value: `${state.tax.rate}% · ${state.tax.currency} (${state.tax.currency_symbol}) · ${state.tax.time_zone}` },
    { step: 4, label: "Receipt branding", value: state.receipt.header || state.receipt.footer || "Defaults" },
    { step: 5, label: "First employee", value: state.employee.skip ? "Skipped" : `${state.employee.first_name} ${state.employee.last_name} (${state.employee.role})` },
    { step: 6, label: "Products", value: state.products.mode === "manual" ? `${state.products.items.length} manual` : state.products.mode === "import" ? "CSV import" : "Skipped" },
    { step: 7, label: "Hardware", value: Object.entries(state.hardware).filter(([, v]) => v).map(([k]) => k).join(", ") || "None connected" },
    { step: 8, label: "Payments", value: state.payments.provider.replace("_", " ") },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Review your setup. Click any row to jump back and edit.</p>
      {rows.map((r) => (
        <button key={r.step} onClick={() => goTo(r.step)} className="w-full flex items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-accent transition-colors">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{r.label}</div>
            <div className="text-sm mt-0.5">{r.value || "—"}</div>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function StepFinish({ onDone, onSettings }: { onDone: () => void; onSettings: () => void }) {
  return (
    <div className="text-center py-10 space-y-6">
      <div className="size-16 rounded-2xl bg-emerald-500/10 text-emerald-600 grid place-items-center mx-auto"><PartyPopper className="size-8" /></div>
      <div>
        <h2 className="text-3xl font-bold">Congratulations!</h2>
        <p className="text-muted-foreground mt-2">Your POS has been successfully configured and is ready to use.</p>
      </div>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Button size="lg" onClick={onDone}>Go to Dashboard</Button>
        <Button size="lg" variant="outline" onClick={onSettings}>Open Settings</Button>
        <Button size="lg" variant="ghost" asChild><a href="https://sezapos.com/support" target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> User Guide</a></Button>
      </div>
    </div>
  );
}

/* -------------------------- Shared subcomponents ------------------------- */

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs">{label}{required && <span className="text-destructive ml-1">*</span>}</Label>
      {children}
    </div>
  );
}

function ReceiptPreview({ state }: { state: WizardState }) {
  const s = state.store;
  const r = state.receipt;
  const t = state.tax;
  const items = [
    { name: "Coca-Cola 12oz", qty: 2, price: 1.99 },
    { name: "Snickers Bar", qty: 1, price: 1.49 },
  ];
  const subtotal = items.reduce((a, i) => a + i.qty * i.price, 0);
  const tax = t.inclusive ? 0 : subtotal * (t.rate / 100);
  const total = subtotal + tax;
  return (
    <div className="rounded-md border bg-white text-black font-mono text-xs p-4 shadow-inner">
      <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-gray-300">
        <div className="font-bold text-sm">{s.name || "Your Store"}</div>
        {s.address && <div>{s.address}</div>}
        {(s.city || s.state) && <div>{s.city}{s.state ? `, ${s.state}` : ""} {s.zip}</div>}
        {s.phone && <div>{s.phone}</div>}
        {r.header && <div className="pt-1 italic">{r.header}</div>}
      </div>
      <div className="py-2 space-y-1">
        {items.map((i, k) => (
          <div key={k} className="flex justify-between">
            <span>{i.qty} × {i.name}</span>
            <span>{t.currency_symbol}{(i.qty * i.price).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-gray-300 pt-2 space-y-0.5">
        <Row k="Subtotal" v={`${t.currency_symbol}${subtotal.toFixed(2)}`} />
        <Row k={`Tax (${t.rate}%${t.inclusive ? " incl." : ""})`} v={`${t.currency_symbol}${tax.toFixed(2)}`} />
        <Row k="TOTAL" v={`${t.currency_symbol}${total.toFixed(2)}`} bold />
      </div>
      <div className="text-center pt-3 space-y-1 border-t border-dashed border-gray-300 mt-2">
        {r.thank_you && <div>{r.thank_you}</div>}
        {r.footer && <div className="text-[10px]">{r.footer}</div>}
        {r.return_policy && <div className="text-[10px] text-gray-600">{r.return_policy}</div>}
      </div>
    </div>
  );
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={cn("flex justify-between", bold && "font-bold text-sm pt-1")}><span>{k}</span><span>{v}</span></div>;
}
