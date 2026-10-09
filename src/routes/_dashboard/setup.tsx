import { useServerFn } from "@tanstack/react-start";
import {
  DEFAULT_STATE,
  cleanSetup,
  parseSetupCsv,
  setupProducts,
  validateSetup,
  validateSetupStep,
  setupError,
  type WizardState,
} from "@/lib/setup/model";
import { getOwnerSetup, saveOwnerSetup, finishOwnerSetup } from "@/lib/setup/setup.functions";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Check,
  PartyPopper,
  Rocket,
  Store as StoreIcon,
  User,
  Percent,
  Receipt,
  Users,
  Package,
  Printer,
  CreditCard,
  ShoppingCart,
  ClipboardCheck,
  LogOut,
  ExternalLink,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountryList } from "@/hooks/useLocale";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { isDisposableEmail } from "@/lib/security/disposable-email";
import { userFacingError } from "@/lib/errors/user-facing";

function CountrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: countries = [] } = useCountryList();
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select country" />
      </SelectTrigger>
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
  head: () => ({
    meta: [
      { title: "Store setup  -  SEZA POS" },
      {
        name: "description",
        content: "Configure your store details, currency, and tax rates before going live.",
      },
    ],
  }),
  component: SetupWizardPage,
});

const STEPS = [
  { id: 0, label: "Welcome", icon: Rocket },
  { id: 1, label: "Owner", icon: User },
  { id: 2, label: "Store", icon: StoreIcon },
  { id: 3, label: "Taxes & Currency", icon: Percent },
  { id: 4, label: "Receipt", icon: Receipt },
  { id: 5, label: "Employee", icon: Users },
  { id: 6, label: "Products", icon: Package },
  { id: 7, label: "Register setup", icon: Printer },
  { id: 8, label: "Payments", icon: CreditCard },
  { id: 9, label: "POS Preview", icon: ShoppingCart },
  { id: 10, label: "Review", icon: ClipboardCheck },
  { id: 11, label: "Finish", icon: PartyPopper },
];

function SetupWizardPage() {
  const me = useMe();
  const scope = `${me.data?.user.id ?? ""}:${me.data?.store?.id ?? ""}`;
  if (me.isLoading) return <p className="p-4">Loading your store…</p>;
  if (!me.data?.store?.id || !me.data.roles.includes("owner"))
    return <p className="p-4">Sign in with your store’s owner account to continue setup.</p>;
  return <ScopedSetup key={scope} actorId={me.data.user.id} storeId={me.data.store.id} />;
}
const contentKey = (s: WizardState) => JSON.stringify({ ...s, step: 0 });
function ScopedSetup({ actorId, storeId }: { actorId: string; storeId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getSetup = useServerFn(getOwnerSetup),
    saveSetup = useServerFn(saveOwnerSetup),
    finishSetup = useServerFn(finishOwnerSetup);
  const scope = { actorId, storeId };
  const store = { id: storeId };
  const draftKey = `seza.setup.draft.v2:${actorId}:${storeId}`;
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false),
    [saving, setSaving] = useState(false),
    [finishing, setFinishing] = useState(false);
  const [error, setError] = useState(""),
    [saveStatus, setSaveStatus] = useState("Loading…"),
    [conflict, setConflict] = useState(false);
  const revision = useRef<string | null>(null),
    savedContent = useRef("");
  const latest = useRef(state);
  latest.current = state;
  const pending = useRef<Promise<void> | null>(null),
    finishLock = useRef(false),
    disposed = useRef(false);
  const remote = useQuery({
    queryKey: ["owner-setup", actorId, storeId],
    queryFn: () => getSetup({ data: scope }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
    };
  }, []);
  const keepLocal = (next: WizardState, dirty: boolean) => {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ state: next, revision: revision.current, dirty }),
      );
    } catch {
      setSaveStatus("Device storage unavailable. Use Save draft before leaving.");
    }
  };
  useEffect(() => {
    if (!remote.data || loaded) return;
    const result = remote.data;
    revision.current = result.revision;
    savedContent.current = contentKey(result.state);
    let initial = result.state;
    try {
      const cached = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (!result.completed && cached?.state) {
        const local = cleanSetup(cached.state);
        if (cached.revision === result.revision || contentKey(local) === savedContent.current)
          initial = local;
        else if (cached.dirty) {
          initial = local;
          setConflict(true);
          setError(
            "Your saved setup changed in another tab. Review this device’s draft, then choose which version to keep.",
          );
        }
      }
    } catch {
      /* malformed/old browser draft cannot replace server data */
    }
    setState(initial);
    latest.current = initial;
    setLoaded(true);
    setSaveStatus("Draft loaded");
  }, [remote.data, loaded, draftKey]);
  const flush = async () => {
    if (conflict) throw new Error("SETUP_CONFLICT");
    while (pending.current) await pending.current;
    if (
      disposed.current ||
      latest.current.step === 11 ||
      contentKey(latest.current) === savedContent.current
    )
      return;
    const snapshot = latest.current;
    setSaving(true);
    const request = (async () => {
      const result = await saveSetup({
        data: { ...scope, revision: revision.current, state: snapshot },
      });
      if (disposed.current) return;
      revision.current = result.revision;
      savedContent.current = contentKey(snapshot);
      if (result.completed) {
        setState((s) => ({ ...s, step: 11 }));
        return;
      }
      keepLocal(latest.current, contentKey(latest.current) !== savedContent.current);
      setSaveStatus("Draft saved");
      setError("");
    })();
    pending.current = request;
    try {
      await request;
    } finally {
      if (pending.current === request) pending.current = null;
      if (!disposed.current) setSaving(false);
    }
  };
  useEffect(() => {
    if (!loaded || state.step === 11) return;
    const dirty = contentKey(state) !== savedContent.current;
    keepLocal(state, dirty);
    if (!dirty || finishing || conflict) return;
    setSaveStatus("Draft kept on this device");
    // Navigation changes only the local step. Only edited content is saved.
    const timer = setTimeout(() => {
      void flush().catch((e) => {
        if (!disposed.current) {
          setError(setupError(e));
          setSaveStatus("Not saved online");
        }
      });
    }, 1800);
    return () => clearTimeout(timer);
  }, [state, loaded, finishing, conflict]);
  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));
  const patchStore = (p: Partial<WizardState["store"]>) =>
    setState((s) => ({ ...s, store: { ...s.store, ...p } }));
  const patchOwner = (p: Partial<WizardState["owner"]>) =>
    setState((s) => ({ ...s, owner: { ...s.owner, ...p } }));
  const patchTax = (p: Partial<WizardState["tax"]>) =>
    setState((s) => ({ ...s, tax: { ...s.tax, ...p } }));
  const patchReceipt = (p: Partial<WizardState["receipt"]>) =>
    setState((s) => ({ ...s, receipt: { ...s.receipt, ...p } }));
  const goTo = (step: number) => {
    if (finishLock.current || state.step === 11) return;
    setError("");
    setState((s) => ({ ...s, step: Math.max(0, Math.min(10, step)) }));
  };
  const next = () => {
    const message = validateSetupStep(state, state.step);
    if (message) {
      setError(message);
      return;
    }
    goTo(state.step + 1);
  };
  const back = () => goTo(state.step - 1);
  const skip = () => {
    if (finishLock.current) return;
    setError("");
    setState((s) => ({
      ...s,
      step: s.step + 1,
      ...(s.step === 5 ? { employee: { ...s.employee, skip: true } } : {}),
      ...(s.step === 6 ? { products: { ...s.products, mode: "skip" as const } } : {}),
    }));
  };
  const uploads = useRef(0);
  const [uploading, setUploading] = useState(false);
  const canContinue = !uploading;
  const finish = async () => {
    if (finishLock.current) return;
    if (uploads.current > 0) {
      setError("Wait for the logo upload to finish, then try again.");
      return;
    }
    const invalid = validateSetup(state);
    if (invalid) {
      setState((s) => ({ ...s, step: invalid.step }));
      setError(invalid.message);
      return;
    }
    finishLock.current = true;
    setFinishing(true);
    setError("");
    try {
      await flush();
      if (disposed.current) return;
      await finishSetup({ data: { ...scope, revision: revision.current, state: latest.current } });
      if (disposed.current) return;
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* Completed server state wins on return. */
      }
      setState((s) => ({ ...s, step: 11 }));
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      if (!disposed.current) setError(setupError(e));
    } finally {
      finishLock.current = false;
      if (!disposed.current) setFinishing(false);
    }
  };

  const uploadLogo = async (file: File, field: "logo_url" | "receipt_logo_url") => {
    if (!store?.id) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Use a PNG, JPEG or WebP logo smaller than 2 MB.");
      return;
    }
    uploads.current++;
    setUploading(true);
    try {
      const path = `${store.id}/${field}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data, error: urlError } = await supabase.storage
        .from("product-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (urlError || !data?.signedUrl) throw urlError ?? new Error("Upload failed");
      if (disposed.current) return;
      const url = data.signedUrl;
      if (field === "logo_url") patchStore({ logo_url: url });
      else patchReceipt({ logo_url: url });
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(userFacingError(e, "Upload failed"));
    } finally {
      uploads.current--;
      if (!disposed.current) setUploading(uploads.current > 0);
    }
  };

  if (remote.isError && !loaded)
    return (
      <div className="space-y-3 p-4">
        <p>{setupError(remote.error)}</p>
        <Button onClick={() => remote.refetch()}>Try again</Button>
      </div>
    );
  if (!loaded) {
    return (
      <div className="p-10 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="owner-setup min-w-0 max-w-full flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl min-w-0 mx-auto p-4 pb-24 md:p-8 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Step {state.step + 1} of {STEPS.length}
              </div>
              <h1 className="text-xl font-semibold">{STEPS[state.step].label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {uploading ? (
              "Uploading logo…"
            ) : saving ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Saving…
              </>
            ) : (
              <>{saveStatus}</>
            )}
          </div>
        </div>

        {state.step < 11 && (
          <p className="text-sm text-muted-foreground">
            Changes stay in your draft until you finish. Back and Continue do not create records.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {conflict && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setState(remote.data!.state);
                savedContent.current = contentKey(remote.data!.state);
                setConflict(false);
                setError("");
              }}
            >
              Use saved setup
            </Button>
            <Button
              onClick={() => {
                setConflict(false);
                setError("");
              }}
            >
              Keep this device’s draft
            </Button>
          </div>
        )}
        {state.step < 11 && (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={saving || finishing || conflict}
              onClick={() => {
                void flush().catch((e) => setError(setupError(e)));
              }}
            >
              Save draft
            </Button>
            <Link to="/help" className="self-center text-sm underline">
              Open Support
            </Link>
          </div>
        )}

        {state.step < 11 && (
          <div className="hidden md:flex items-center gap-1 overflow-x-auto text-xs">
            {STEPS.filter((s) => s.id < 11).map((s) => (
              <button
                key={s.id}
                onClick={() => goTo(s.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md whitespace-nowrap transition-colors",
                  s.id === state.step
                    ? "bg-primary text-primary-foreground"
                    : s.id < state.step
                      ? "text-foreground hover:bg-accent"
                      : "text-muted-foreground hover:bg-accent",
                )}
              >
                {s.id < state.step ? <Check className="size-3" /> : <s.icon className="size-3" />}
                {s.label}
              </button>
            ))}
          </div>
        )}

        <section className="min-w-0 border-t pt-5" aria-label={STEPS[state.step].label}>
          <fieldset disabled={finishing || uploading} className="min-w-0">
            {state.step === 0 && (
              <StepWelcome onStart={() => goTo(1)} onExit={() => navigate({ to: "/dashboard" })} />
            )}
            {state.step === 1 && <StepOwner state={state} patch={patchOwner} />}
            {state.step === 2 && (
              <StepStore
                state={state}
                patch={patchStore}
                onLogo={(f) => uploadLogo(f, "logo_url")}
              />
            )}
            {state.step === 3 && <StepTaxes state={state} patch={patchTax} />}
            {state.step === 4 && (
              <StepReceipt
                state={state}
                patch={patchReceipt}
                onLogo={(f) => uploadLogo(f, "receipt_logo_url")}
              />
            )}
            {state.step === 5 && (
              <StepEmployee
                state={state}
                patch={(p) => setState((s) => ({ ...s, employee: { ...s.employee, ...p } }))}
              />
            )}
            {state.step === 6 && (
              <StepProducts
                state={state}
                patch={(p) => setState((s) => ({ ...s, products: { ...s.products, ...p } }))}
              />
            )}
            {state.step === 7 && (
              <StepHardware
                state={state}
                patch={(p) => setState((s) => ({ ...s, hardware: { ...s.hardware, ...p } }))}
              />
            )}
            {state.step === 8 && (
              <StepPayments
                state={state}
                patch={(p) => setState((s) => ({ ...s, payments: { ...s.payments, ...p } }))}
              />
            )}
            {state.step === 9 && (
              <StepTestSale
                state={state}
                patch={(p) => setState((s) => ({ ...s, test_sale: { ...s.test_sale, ...p } }))}
              />
            )}
            {state.step === 10 && <StepReview state={state} goTo={goTo} />}
            {state.step === 11 && (
              <StepFinish
                onDone={() => navigate({ to: "/dashboard" })}
                onSettings={() => navigate({ to: "/settings" })}
              />
            )}
          </fieldset>
        </section>

        {state.step > 0 && state.step < 11 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" onClick={back} disabled={finishing}>
              <ChevronLeft className="size-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              {[5, 6].includes(state.step) && (
                <Button variant="ghost" onClick={skip} disabled={finishing}>
                  <SkipForward className="size-4" /> Skip
                </Button>
              )}
              {state.step < 10 && (
                <Button onClick={next} disabled={!canContinue || finishing}>
                  Continue <ChevronRight className="size-4" />
                </Button>
              )}
              {state.step === 10 && (
                <Button onClick={finish} disabled={finishing}>
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
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Welcome to SEZA POS</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Let's get your business up and running. This wizard walks you through everything you need
          - owner account, store details, taxes, receipts, employees, products, hardware, and
          payments. You can save a draft and return later.
        </p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button size="lg" onClick={onStart}>
          <Rocket className="size-4" /> Start Setup
        </Button>
        <Button size="lg" variant="ghost" onClick={onExit}>
          <LogOut className="size-4" /> Exit
        </Button>
      </div>
    </div>
  );
}

function StepOwner({
  state,
  patch,
}: {
  state: WizardState;
  patch: (p: Partial<WizardState["owner"]>) => void;
}) {
  const o = state.owner;
  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        You are the Owner. Confirm your details - your Owner role and 6-digit Employee ID are
        already assigned.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="First name" required>
          <Input value={o.first_name} onChange={(e) => patch({ first_name: e.target.value })} />
        </Field>
        <Field label="Last name" required>
          <Input value={o.last_name} onChange={(e) => patch({ last_name: e.target.value })} />
        </Field>
        <Field label="Business email" required>
          <Input type="email" value={o.email} disabled />
          {isDisposableEmail(o.email) && (
            <p className="mt-2 text-sm font-medium text-red-600">
              This account uses a temporary email address. Update it to a permanent business email
              before continuing.
            </p>
          )}
        </Field>
        <Field label="Phone number">
          <Input value={o.phone} onChange={(e) => patch({ phone: e.target.value })} />
        </Field>
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

function StepStore({
  state,
  patch,
  onLogo,
}: {
  state: WizardState;
  patch: (p: Partial<WizardState["store"]>) => void;
  onLogo: (f: File) => void;
}) {
  const s = state.store;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="size-20 rounded-xl border bg-muted overflow-hidden grid place-items-center">
          {s.logo_url ? (
            <img src={s.logo_url} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <StoreIcon className="size-8 text-muted-foreground" />
          )}
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])}
          />
          <span className="inline-flex items-center gap-2 h-9 px-4 rounded-md border bg-background text-sm hover:bg-accent">
            <Upload className="size-4" /> Upload logo
          </span>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Store name" required>
          <Input value={s.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Business type">
          <Select value={s.business_type} onValueChange={(v) => patch({ business_type: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "convenience",
                "grocery",
                "liquor",
                "restaurant",
                "retail",
                "coffee_shop",
                "other",
              ].map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tax ID (optional)">
          <Input value={s.tax_id} onChange={(e) => patch({ tax_id: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={s.phone} onChange={(e) => patch({ phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={s.email} onChange={(e) => patch({ email: e.target.value })} />
        </Field>
        <Field label="Website">
          <Input
            value={s.website}
            onChange={(e) => patch({ website: e.target.value })}
            placeholder="https://"
          />
        </Field>
        <Field label="Address" className="md:col-span-2">
          <Input value={s.address} onChange={(e) => patch({ address: e.target.value })} />
        </Field>
        <Field label="City">
          <Input value={s.city} onChange={(e) => patch({ city: e.target.value })} />
        </Field>
        <Field label="State / Province">
          <Input value={s.state} onChange={(e) => patch({ state: e.target.value })} />
        </Field>
        <Field label="Postal code">
          <Input value={s.zip} onChange={(e) => patch({ zip: e.target.value })} />
        </Field>
        <Field label="Country">
          <CountrySelect value={s.country} onChange={(v) => patch({ country: v })} />
        </Field>
        <Field label="Business hours" className="md:col-span-2">
          <Input value={s.hours} onChange={(e) => patch({ hours: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

function StepTaxes({
  state,
  patch,
}: {
  state: WizardState;
  patch: (p: Partial<WizardState["tax"]>) => void;
}) {
  const t = state.tax;
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Field label="Default tax rate (%)" required>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.001"
            value={t.rate}
            onChange={(e) => patch({ rate: Number(e.target.value) || 0 })}
          />
        </Field>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Tax inclusive pricing</div>
            <div className="text-xs text-muted-foreground">Prices already include tax</div>
          </div>
          <Switch
            aria-label="Tax inclusive pricing"
            checked={t.inclusive}
            onCheckedChange={(v) => patch({ inclusive: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency">
            <Input
              value={t.currency}
              onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Symbol">
            <Input
              value={t.currency_symbol}
              onChange={(e) => patch({ currency_symbol: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Time zone">
          <Input value={t.time_zone} onChange={(e) => patch({ time_zone: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date format">
            <Select value={t.date_format} onValueChange={(date_format) => patch({ date_format })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([t.date_format, "MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"])).map(
                  (format) => (
                    <SelectItem key={format} value={format}>
                      {format}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Language">
            <Input value={t.language} onChange={(e) => patch({ language: e.target.value })} />
          </Field>
        </div>
      </div>
      <ReceiptPreview state={state} />
    </div>
  );
}

function StepReceipt({
  state,
  patch,
  onLogo,
}: {
  state: WizardState;
  patch: (p: Partial<WizardState["receipt"]>) => void;
  onLogo: (f: File) => void;
}) {
  const r = state.receipt;
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <label className="cursor-pointer inline-flex items-center gap-2 h-9 px-4 rounded-md border bg-background text-sm hover:bg-accent">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])}
          />
          <Upload className="size-4" /> Upload receipt logo
        </label>
        <Field label="Header message">
          <Textarea
            rows={2}
            value={r.header}
            onChange={(e) => patch({ header: e.target.value })}
            placeholder="e.g. Welcome to My Store"
          />
        </Field>
        <Field label="Footer message">
          <Textarea rows={2} value={r.footer} onChange={(e) => patch({ footer: e.target.value })} />
        </Field>
        <Field label="Return policy">
          <Textarea
            rows={2}
            value={r.return_policy}
            onChange={(e) => patch({ return_policy: e.target.value })}
          />
        </Field>
        <Field label="Thank-you message">
          <Input value={r.thank_you} onChange={(e) => patch({ thank_you: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Field label="Facebook">
            <Input
              value={r.social.facebook}
              onChange={(e) => patch({ social: { ...r.social, facebook: e.target.value } })}
            />
          </Field>
          <Field label="Instagram">
            <Input
              value={r.social.instagram}
              onChange={(e) => patch({ social: { ...r.social, instagram: e.target.value } })}
            />
          </Field>
          <Field label="Twitter/X">
            <Input
              value={r.social.twitter}
              onChange={(e) => patch({ social: { ...r.social, twitter: e.target.value } })}
            />
          </Field>
        </div>
      </div>
      <ReceiptPreview state={state} />
    </div>
  );
}

function StepEmployee({
  state,
  patch,
}: {
  state: WizardState;
  patch: (p: Partial<WizardState["employee"]>) => void;
}) {
  const e = state.employee;
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <div className="text-sm font-medium">I'll be the only user for now</div>
          <div className="text-xs text-muted-foreground">Skip and add employees later</div>
        </div>
        <Switch
          aria-label="Only user for now"
          checked={e.skip}
          onCheckedChange={(v) => patch({ skip: v })}
        />
      </div>
      {!e.skip && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="First name">
            <Input value={e.first_name} onChange={(ev) => patch({ first_name: ev.target.value })} />
          </Field>
          <Field label="Last name">
            <Input value={e.last_name} onChange={(ev) => patch({ last_name: ev.target.value })} />
          </Field>
          <Field label="Role">
            <Select
              value={e.role}
              onValueChange={(v) => patch({ role: v as WizardState["employee"]["role"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cashier">Cashier</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={e.email}
              onChange={(ev) => patch({ email: ev.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input value={e.phone} onChange={(ev) => patch({ phone: ev.target.value })} />
          </Field>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        When you finish, SEZA emails a secure invitation. The employee chooses their own password.
        Existing employees are not invited again.
      </p>
    </div>
  );
}

function StepProducts({
  state,
  patch,
}: {
  state: WizardState;
  patch: (p: Partial<WizardState["products"]>) => void;
}) {
  const p = state.products;
  const [fileError, setFileError] = useState("");
  let parsed: ReturnType<typeof parseSetupCsv> = [];
  let csvError = "";
  if (p.mode === "import" && p.csv.trim())
    try {
      parsed = setupProducts(state);
    } catch (e) {
      csvError = (e as Error).message;
    }

  return (
    <div className="space-y-4">
      <Tabs
        value={p.mode}
        onValueChange={(v) => patch({ mode: v as WizardState["products"]["mode"] })}
      >
        <TabsList className="grid grid-cols-3">
          <TabsTrigger value="manual">Add manually</TabsTrigger>
          <TabsTrigger value="import">Import CSV</TabsTrigger>
          <TabsTrigger value="skip">Skip</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-3">
          {p.items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 border-b pb-3 sm:grid-cols-12">
              <Input
                aria-label={`Product ${i + 1} name`}
                className="col-span-2 sm:col-span-5"
                placeholder="Name"
                value={it.name}
                onChange={(e) => {
                  const items = [...p.items];
                  items[i] = { ...it, name: e.target.value };
                  patch({ items });
                }}
              />
              <Input
                aria-label={`Product ${i + 1} SKU`}
                className="col-span-2 sm:col-span-3"
                placeholder="SKU"
                value={it.sku}
                onChange={(e) => {
                  const items = [...p.items];
                  items[i] = { ...it, sku: e.target.value };
                  patch({ items });
                }}
              />
              <Input
                className="col-span-1 sm:col-span-2"
                type="number"
                aria-label={`Product ${i + 1} price`}
                min="0"
                step="0.01"
                placeholder="Price"
                value={it.price}
                onChange={(e) => {
                  const items = [...p.items];
                  items[i] = { ...it, price: Number(e.target.value) };
                  patch({ items });
                }}
              />
              <Input
                className="col-span-1 sm:col-span-2"
                type="number"
                aria-label={`Product ${i + 1} stock`}
                min="0"
                step="0.001"
                placeholder="Stock"
                value={it.stock}
                onChange={(e) => {
                  const items = [...p.items];
                  items[i] = { ...it, stock: Number(e.target.value) };
                  patch({ items });
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="col-span-2 sm:col-span-12 justify-self-end"
                onClick={() => patch({ items: p.items.filter((_, index) => index !== i) })}
              >
                Remove product {i + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              patch({ items: [...p.items, { name: "", price: 0, sku: "", stock: 0 }] })
            }
          >
            + Add row
          </Button>
        </TabsContent>

        <TabsContent value="import" className="space-y-3">
          <Field label="CSV file">
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 300_000) {
                  setFileError("Use a CSV smaller than 300 KB.");
                  return;
                }
                try {
                  const csv = await file.text();
                  patch({ csv });
                  setFileError("");
                } catch {
                  setFileError(
                    "The CSV could not be opened. Try another file or paste its contents.",
                  );
                }
              }}
            />
          </Field>
          {fileError && (
            <p role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Upload or paste CSV with headers:{" "}
            <code className="font-mono">name,sku,price,stock</code>
          </p>
          <Textarea
            rows={8}
            aria-label="CSV contents"
            placeholder="name,sku,price,stock&#10;Coca-Cola 12oz,COKE-12,1.99,50"
            value={p.csv}
            onChange={(e) => patch({ csv: e.target.value })}
            className="font-mono text-xs"
          />
          {csvError && (
            <p role="alert" className="text-sm text-destructive">
              {csvError}
            </p>
          )}
          {parsed.length > 0 && (
            <div className="rounded-md border overflow-hidden">
              <div className="px-3 py-2 bg-muted text-xs font-medium">
                Ready to import when you finish: {parsed.length} product
                {parsed.length !== 1 ? "s" : ""}
              </div>
              <div className="max-h-48 overflow-y-auto text-xs">
                {parsed.slice(0, 20).map((r, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 py-1.5 border-t break-words"
                  >
                    <span>{r.name}</span>
                    <span className="text-muted-foreground">{r.sku}</span>
                    <span>
                      {state.tax.currency_symbol}
                      {r.price.toFixed(2)}
                    </span>
                    <span>{r.stock}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="skip">
          <p className="text-sm text-muted-foreground py-4">
            You can add products anytime from the Products page. Existing products are preserved;
            matching SKUs (or names without a SKU) are skipped on import.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StepHardware({
  state: _state,
  patch: _patch,
}: {
  state: WizardState;
  patch: (p: Partial<WizardState["hardware"]>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="border-b pb-4">
        <div className="font-semibold">Physical hardware is configured on the Android register</div>
        <p className="mt-1 text-sm text-muted-foreground">
          After you pair a POS with its 10-character code and sign in with a manager or owner PIN,
          SEZA opens the register hardware setup on that device. This website does not try to
          connect USB or Bluetooth hardware from your phone or laptop.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          ["Receipt printer", "Connect and test it on the paired Android POS."],
          ["Barcode scanner", "Configure USB HID or supported scanner input on the POS."],
          ["Cash drawer", "Configure the printer kick-out on the POS."],
          ["Payment terminal", "Pair and test the certified reader on the POS."],
        ].map(([label, desc]) => (
          <div key={label} className="border-b py-3">
            <div className="text-sm font-semibold">{label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
          </div>
        ))}
      </div>
      <div className="border-b py-3">
        <div className="text-sm font-semibold">Customer display</div>
        <div className="mt-1 text-xs text-muted-foreground">
          No manual connection step is required. On supported dual-screen SEZA hardware, the
          customer display starts automatically. You can customize its idle message and text size
          later from the POS.
        </div>
      </div>
    </div>
  );
}

function StepPayments({
  state,
  patch,
}: {
  state: WizardState;
  patch: (p: Partial<WizardState["payments"]>) => void;
}) {
  const providers: { id: WizardState["payments"]["provider"]; label: string; desc: string }[] = [
    {
      id: "cash_only",
      label: "Cash only (for now)",
      desc: "You can enable card payments later without re-running store setup.",
    },
    {
      id: "stripe",
      label: "Stripe Terminal",
      desc: "Use Stripe for SEZA card payments. The physical reader is paired on the Android POS.",
    },
  ];
  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => patch({ provider: provider.id })}
          className={cn(
            "w-full text-left flex items-start gap-3 border-b py-3 transition-colors",
            state.payments.provider === provider.id
              ? "border-primary bg-primary/5"
              : "hover:bg-accent",
          )}
        >
          <div
            className={cn(
              "size-5 rounded-full border grid place-items-center shrink-0 mt-0.5",
              state.payments.provider === provider.id &&
                "bg-primary border-primary text-primary-foreground",
            )}
          >
            {state.payments.provider === provider.id && <Check className="size-3" />}
          </div>
          <div>
            <div className="font-medium text-sm">{provider.label}</div>
            <div className="text-xs text-muted-foreground">{provider.desc}</div>
          </div>
        </button>
      ))}
      <div className="text-sm text-muted-foreground">
        Merchant verification and payout information stay in the Owner Dashboard. Reader discovery,
        pairing, reconnecting, and testing happen only on the physical Android register.
      </div>
      <p className="text-sm">
        Choosing Stripe here saves your preference. After finishing this wizard, open Payments in
        Settings for verification and payouts.
      </p>
    </div>
  );
}

function StepTestSale({
  state,
  patch: _patch,
}: {
  state: WizardState;
  patch: (p: Partial<WizardState["test_sale"]>) => void;
}) {
  let items: WizardState["products"]["items"] = [];
  try {
    items = setupProducts(state);
  } catch {
    /* sample while draft is invalid */
  }
  const price = items[0]?.price ?? 10;
  const sampleTax =
    Math.round(
      (state.tax.inclusive
        ? price - price / (1 + state.tax.rate / 100)
        : (price * state.tax.rate) / 100) * 100,
    ) / 100;
  const sampleSubtotal = state.tax.inclusive ? price - sampleTax : price;
  const sampleTotal = sampleSubtotal + sampleTax;
  const itemName = items[0]?.name || "Sample item";
  const money = (value: number) => `${state.tax.currency_symbol || "$"}${value.toFixed(2)}`;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Read-only POS preview</div>
        <p className="mt-1 text-sm text-muted-foreground">
          This preview shows how the core store settings will appear. Real checkout and hardware
          testing happen on the paired Android POS.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-background">
        <div className="border-b px-4 py-3">
          <div className="font-bold">{state.store.name || "Your store"}</div>
          <div className="text-xs text-muted-foreground">SEZA POS preview</div>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-[1fr_260px]">
          <div className="border-b py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Catalog
            </div>
            <div className="mt-3 flex items-center justify-between rounded-md bg-muted/40 p-3">
              <span className="font-medium">{itemName}</span>
              <span>{money(sampleSubtotal)}</span>
            </div>
          </div>
          <div className="border-b py-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{money(sampleSubtotal)}</span>
            </div>
            <div className="mt-2 flex justify-between text-muted-foreground">
              <span>Tax ({state.tax.rate.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%)</span>
              <span>{money(sampleTax)}</span>
            </div>
            <div className="mt-3 flex justify-between border-t pt-3 text-lg font-bold">
              <span>Total</span>
              <span>{money(sampleTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepReview({ state, goTo }: { state: WizardState; goTo: (n: number) => void }) {
  const rows = [
    {
      step: 1,
      label: "Owner",
      value: `${state.owner.first_name} ${state.owner.last_name}  -  ${state.owner.email}`,
    },
    {
      step: 2,
      label: "Store",
      value: `${state.store.name || " - "} · ${state.store.city}${state.store.state ? ", " + state.store.state : ""}`,
    },
    {
      step: 3,
      label: "Tax & Currency",
      value: `${state.tax.rate}% · ${state.tax.currency} (${state.tax.currency_symbol}) · ${state.tax.time_zone}`,
    },
    {
      step: 4,
      label: "Receipt branding",
      value: state.receipt.header || state.receipt.footer || "Defaults",
    },
    {
      step: 5,
      label: "First employee",
      value: state.employee.skip
        ? "Skipped"
        : `${state.employee.first_name} ${state.employee.last_name} (${state.employee.role})`,
    },
    {
      step: 6,
      label: "Products",
      value:
        state.products.mode === "manual"
          ? `${state.products.items.length} manual`
          : state.products.mode === "import"
            ? "CSV import"
            : "Skipped",
    },
    {
      step: 7,
      label: "Register hardware",
      value: "Configured on each Android POS after pairing",
    },
    { step: 8, label: "Payments", value: state.payments.provider.replace("_", " ") },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Review your setup. Click any row to jump back and edit.
      </p>
      {rows.map((r) => (
        <button
          key={r.step}
          onClick={() => goTo(r.step)}
          className="w-full flex items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-accent transition-colors"
        >
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{r.label}</div>
            <div className="text-sm mt-0.5">{r.value || " - "}</div>
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
      <div>
        <h2 className="text-xl font-semibold">Store setup complete</h2>
        <p className="text-muted-foreground mt-2">
          Your store setup is saved. Pair an Android register to finish physical hardware setup and
          start selling.
        </p>
      </div>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Button size="lg" asChild>
          <Link to="/devices">Pair an Android register</Link>
        </Button>
        <Button size="lg" onClick={onDone}>
          Go to Dashboard
        </Button>
        <Button size="lg" variant="outline" onClick={onSettings}>
          Open Settings
        </Button>
        <Button size="lg" variant="ghost" asChild>
          <a href="https://sezapos.com/support" target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" /> User Guide
          </a>
        </Button>
      </div>
    </div>
  );
}

/* -------------------------- Shared subcomponents ------------------------- */

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block min-w-0 space-y-1.5", className)}>
      <span className="text-sm">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </span>
      {children}
    </label>
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
  const tax = t.inclusive ? subtotal - subtotal / (1 + t.rate / 100) : subtotal * (t.rate / 100);
  const total = t.inclusive ? subtotal : subtotal + tax;
  return (
    <div className="rounded-md border bg-white text-black font-mono text-xs p-4 shadow-inner">
      <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-gray-300 break-words">
        {(r.logo_url || s.logo_url) && (
          <img
            src={r.logo_url || s.logo_url}
            alt="Receipt logo"
            className="mx-auto max-h-16 max-w-32 object-contain"
          />
        )}
        <div className="font-bold text-sm">{s.name || "Your Store"}</div>
        {s.address && <div>{s.address}</div>}
        {(s.city || s.state) && (
          <div>
            {s.city}
            {s.state ? `, ${s.state}` : ""} {s.zip}
          </div>
        )}
        {s.phone && <div>{s.phone}</div>}
        {r.header && <div className="pt-1 italic">{r.header}</div>}
      </div>
      <div className="py-2 space-y-1">
        {items.map((i, k) => (
          <div key={k} className="flex justify-between">
            <span>
              {i.qty} × {i.name}
            </span>
            <span>
              {t.currency_symbol}
              {(i.qty * i.price).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-gray-300 pt-2 space-y-0.5">
        <Row
          k="Subtotal"
          v={`${t.currency_symbol}${(t.inclusive ? subtotal - tax : subtotal).toFixed(2)}`}
        />
        <Row
          k={`Tax (${t.rate}%${t.inclusive ? " incl." : ""})`}
          v={`${t.currency_symbol}${tax.toFixed(2)}`}
        />
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
  return (
    <div className={cn("flex justify-between", bold && "font-bold text-sm pt-1")}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
