import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { isNativeMode } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { logAudit } from "@/lib/audit-log";
import { setActiveTerminal, type TerminalDriverId } from "@/lib/hardware";
import { connectReader as connectStripeReader } from "@/lib/hardware/terminal-stripe";
import { setActivePaymentProvider } from "@/lib/pos/payment-terminal";
import { checkFinixTerminal } from "@/lib/finix/terminal";
import { getStripeConnectStatus, startStripeConnectOnboarding } from "@/lib/stripe-connect.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const sb = supabase as any;
const OWNER_PAYMENT_SETUP_URL = "https://dashboard.sezapos.com/settings?section=terminal";

type Terminal = {
  id: string;
  store_id: string;
  label: string;
  provider: string;
  serial: string | null;
  location: string | null;
  status: string;
  last_seen_at: string | null;
  config?: Record<string, unknown> | null;
};

type Provider = {
  id: string;
  label: string;
  mode: "integrated" | "external";
  connector: "stripe" | "finix_cloud" | "not_installed" | "external";
  models: string[];
  note: string;
};

const PROVIDERS: Provider[] = [
  {
    id: "finix",
    label: "Finix",
    mode: "integrated",
    connector: "finix_cloud",
    models: ["PAX A35", "PAX A800", "PAX A920 Pro", "Finix certified terminal"],
    note: "SEZA sends card-present sales through the secure SEZA backend to Finix. Finix API credentials stay on the server and are never stored in the APK.",
  },
  {
    id: "stripe",
    label: "Stripe Terminal",
    mode: "integrated",
    connector: "stripe",
    models: [
      "Simulated reader (test)",
      "Tap to Pay on Android",
      "Reader M2",
      "WisePOS E",
      "S700",
      "WisePad 3",
    ],
    note: "Native Stripe Terminal connector installed. SEZA creates the merchant and Terminal Location automatically after the owner completes Stripe verification.",
  },
  {
    id: "square",
    label: "Square",
    mode: "integrated",
    connector: "not_installed",
    models: ["Square Reader for contactless and chip", "Square Reader for magstripe", "Square Terminal"],
    note: "The Square Mobile Payments connector is not installed in this APK yet. Saving the model alone cannot pair a Square reader.",
  },
  {
    id: "clover",
    label: "Clover",
    mode: "integrated",
    connector: "not_installed",
    models: ["Clover Flex", "Clover Mini", "Clover Station"],
    note: "Requires Clover merchant credentials, device activation, and the Clover connector.",
  },
  {
    id: "pax",
    label: "PAX",
    mode: "integrated",
    connector: "not_installed",
    models: ["A920", "A920 Pro", "A80", "E700"],
    note: "Connection depends on the merchant processor and its certified PAX application or SDK.",
  },
  {
    id: "ingenico",
    label: "Ingenico",
    mode: "integrated",
    connector: "not_installed",
    models: ["Lane 3000", "Lane 5000", "Desk 3500", "Move 5000"],
    note: "Connection depends on the merchant processor and a supported semi-integrated gateway.",
  },
  {
    id: "dejavoo",
    label: "Dejavoo",
    mode: "integrated",
    connector: "not_installed",
    models: ["Z8", "Z9", "Z11", "QD4"],
    note: "Cloud or local integration is available only after a supported processor connector is installed.",
  },
  {
    id: "adyen",
    label: "Adyen",
    mode: "integrated",
    connector: "not_installed",
    models: ["S1E2L", "AMS1", "NYC1"],
    note: "Requires an active Adyen merchant account and certified SEZA connector.",
  },
  {
    id: "fiserv",
    label: "Fiserv / CardPointe",
    mode: "integrated",
    connector: "not_installed",
    models: ["Clover devices", "Ingenico devices", "PAX devices"],
    note: "Exact reader support depends on the merchant account and processor integration.",
  },
  {
    id: "worldpay",
    label: "Worldpay",
    mode: "integrated",
    connector: "not_installed",
    models: ["PAX", "Ingenico", "Verifone"],
    note: "Exact reader support depends on the merchant account and processor integration.",
  },
  {
    id: "elavon",
    label: "Elavon",
    mode: "integrated",
    connector: "not_installed",
    models: ["Ingenico", "PAX", "Converge terminals"],
    note: "Exact reader support depends on the merchant account and processor integration.",
  },
  {
    id: "external",
    label: "External standalone terminal",
    mode: "external",
    connector: "external",
    models: ["Any terminal used separately"],
    note: "The cashier confirms the result shown on the separate terminal. SEZA does not claim it received an automatic approval.",
  },
];

function driverForTerminal(terminal: Terminal): TerminalDriverId {
  if (terminal.provider !== "stripe") return "none";
  const model = String(terminal.config?.model ?? "").toLowerCase();
  if (model.includes("simulated")) return "stripe-simulated";
  if (model.includes("reader m2")) return "stripe-m2";
  if (model.includes("tap to pay")) return "stripe-tap-to-pay";
  if (model.includes("wisepad")) return "stripe-wisepad3";
  if (model.includes("wisepos") || model.includes("s700")) return "stripe-wisepos";
  return "none";
}

function providerForTerminal(terminal: Terminal) {
  return PROVIDERS.find((item) => item.id === terminal.provider);
}

function statusLabel(terminal: Terminal) {
  if (terminal.status === "active") return "Reader connected";
  if (terminal.status === "configured") return "Prepared — pairing required";
  return "Not paired";
}

export function PaymentTerminalsPanel({
  canEdit,
  canOperate = canEdit,
}: {
  canEdit: boolean;
  canOperate?: boolean;
}) {
  const { data: me } = useMe();
  const storeId = me?.store?.id as string | undefined;
  const qc = useQueryClient();
  const native = isNativeMode();
  const isOwner = Boolean(me?.roles?.includes("owner"));
  const getStripeStatus = useServerFn(getStripeConnectStatus);
  const beginStripeOnboarding = useServerFn(startStripeConnectOnboarding);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    label: "",
    provider: "stripe",
    model: "",
    serial: "",
    location: "Front counter",
    stripeConnectionMethod: "usb" as "usb" | "bluetooth",
    finixMerchantId: "",
    finixDeviceId: "",
    finixEnvironment: "sandbox" as "sandbox" | "live",
  });

  const provider = PROVIDERS.find((item) => item.id === form.provider) ?? PROVIDERS[0];
  const filteredProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? PROVIDERS.filter((item) =>
          `${item.label} ${item.models.join(" ")}`.toLowerCase().includes(q),
        )
      : PROVIDERS;
  }, [search]);

  const terminals = useQuery({
    queryKey: ["payment_terminals", storeId],
    enabled: !!storeId,
    queryFn: async (): Promise<Terminal[]> => {
      const { data, error } = await sb
        .from("payment_terminals")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Terminal[];
    },
  });

  const stripeStore = useQuery({
    queryKey: ["store", "stripe-connect", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("stores")
        .select(
          "id,stripe_connected_account_id,stripe_connect_status,stripe_card_payments_status,stripe_terminal_location_id,address,city,state,zip,country",
        )
        .eq("id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const stripeStatus = useQuery({
    queryKey: ["stripe-connect-status", storeId],
    enabled: Boolean(storeId && isOwner && !native),
    queryFn: () => getStripeStatus({}),
    retry: false,
  });

  const connectStripe = useMutation({
    mutationFn: () => beginStripeOnboarding({}),
    onSuccess: ({ url }) => {
      if (!url) throw new Error("Stripe did not return an onboarding URL.");
      window.location.assign(url);
    },
    onError: (error) => toast.error(userFacingError(error, "Could not start Stripe setup.")),
  });

  const stripeReady =
    stripeStatus.data?.status === "ready" || stripeStore.data?.stripe_connect_status === "ready";
  const stripeNeedsAddress = Boolean(
    stripeStatus.data?.needsStoreAddress ||
      (stripeStore.data?.stripe_connect_status === "payments_ready" &&
        !stripeStore.data?.stripe_terminal_location_id),
  );

  const copyOwnerSetupLink = async () => {
    try {
      await navigator.clipboard.writeText(OWNER_PAYMENT_SETUP_URL);
      toast.success("Owner payment setup link copied.");
    } catch {
      toast.info(OWNER_PAYMENT_SETUP_URL);
    }
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Your store is not ready yet.");
      if (!form.label.trim()) throw new Error("Enter a terminal name.");
      if (!form.model.trim()) throw new Error("Choose the terminal model.");
      if (form.provider === "stripe" && !stripeReady) {
        throw new Error(
          stripeNeedsAddress
            ? "Add the complete store address in General Settings so SEZA can create the Stripe Terminal Location."
            : "Complete Stripe setup in the Owner Dashboard before preparing a Stripe reader.",
        );
      }
      if (form.provider === "finix" && !form.finixDeviceId.trim()) {
        throw new Error("Enter the Finix Device ID assigned to this payment terminal.");
      }
      const { data, error } = await sb
        .from("payment_terminals")
        .insert({
          store_id: storeId,
          label: form.label.trim(),
          provider: form.provider,
          serial: form.serial.trim() || null,
          location: form.location.trim() || null,
          status: "configured",
          config: {
            model: form.model.trim(),
            mode: provider.mode,
            setup_source: native ? "android_pos" : "owner_dashboard",
            location_id:
              form.provider === "stripe" ? stripeStore.data?.stripe_terminal_location_id : undefined,
            connection_method:
              form.provider === "stripe" && form.model.toLowerCase().includes("reader m2")
                ? form.stripeConnectionMethod
                : undefined,
            finix_device_id: form.provider === "finix" ? form.finixDeviceId.trim() : undefined,
            finix_merchant_id: form.provider === "finix" ? form.finixMerchantId.trim() || undefined : undefined,
            finix_environment: form.provider === "finix" ? form.finixEnvironment : undefined,
            reader_type: driverForTerminal({
              id: "draft",
              store_id: storeId,
              label: form.label,
              provider: form.provider,
              serial: form.serial || null,
              location: form.location,
              status: "configured",
              last_seen_at: null,
              config: { model: form.model },
            }),
          },
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit({
        action: "terminal.create",
        entity: "payment_terminal",
        entity_id: data.id,
        details: { provider: form.provider, model: form.model, mode: provider.mode },
      });
    },
    onSuccess: () => {
      toast.success("Terminal prepared. Pair it before accepting card payments.");
      setForm({
        label: "",
        provider: "stripe",
        model: "",
        serial: "",
        location: "Front counter",
        stripeConnectionMethod: "usb",
        finixMerchantId: "",
        finixDeviceId: "",
        finixEnvironment: "sandbox",
      });
      qc.invalidateQueries({ queryKey: ["payment_terminals"] });
    },
    onError: (error) => toast.error(userFacingError(error, "Could not prepare this terminal.")),
  });

  const activate = useMutation({
    mutationFn: async (terminal: Terminal) => {
      if (!storeId) throw new Error("Your store is not ready yet.");
      const providerConfig = providerForTerminal(terminal);
      const driver = driverForTerminal(terminal);

      if (providerConfig?.connector === "finix_cloud") {
        const { error: clearError } = await sb
          .from("payment_terminals")
          .update({ status: "inactive" })
          .eq("store_id", storeId);
        if (clearError) throw clearError;
        const { error: selectingError } = await sb
          .from("payment_terminals")
          .update({ status: "active" })
          .eq("id", terminal.id)
          .eq("store_id", storeId);
        if (selectingError) throw selectingError;
        setActiveTerminal("none");
        setActivePaymentProvider("finix");
        try {
          const health = await checkFinixTerminal();
          await sb.from("payment_terminals").update({
            last_seen_at: new Date().toISOString(),
            serial: health?.serial_number || terminal.serial,
          }).eq("id", terminal.id).eq("store_id", storeId);
          await logAudit({
            action: "terminal.activate",
            entity: "payment_terminal",
            entity_id: terminal.id,
            details: { provider: "finix", device_id: health?.device_id, connected: health?.connected },
          });
          return { kind: "finix" as const, reader: { label: "Finix terminal", serialNumber: health?.serial_number || terminal.serial || "" } };
        } catch (error) {
          setActivePaymentProvider(null);
          await sb.from("payment_terminals").update({ status: "configured" }).eq("id", terminal.id).eq("store_id", storeId);
          throw error;
        }
      }

      if (providerConfig?.connector === "not_installed") {
        throw new Error(
          `${providerConfig.label} cannot be paired by this APK yet because its certified connector is not installed.`,
        );
      }

      if (providerConfig?.connector === "external") {
        const { error: clearError } = await sb
          .from("payment_terminals")
          .update({ status: "inactive" })
          .eq("store_id", storeId);
        if (clearError) throw clearError;
        const { error } = await sb
          .from("payment_terminals")
          .update({ status: "active" })
          .eq("id", terminal.id)
          .eq("store_id", storeId);
        if (error) throw error;
        setActiveTerminal("none");
        setActivePaymentProvider(null);
        return { kind: "external" as const, reader: null };
      }

      if (driver === "none") throw new Error("Choose a supported Stripe reader model.");

      const { error: clearError } = await sb
        .from("payment_terminals")
        .update({ status: "inactive" })
        .eq("store_id", storeId);
      if (clearError) throw clearError;
      const { error: selectingError } = await sb
        .from("payment_terminals")
        .update({ status: "active" })
        .eq("id", terminal.id)
        .eq("store_id", storeId);
      if (selectingError) throw selectingError;

      setActiveTerminal(driver);
      setActivePaymentProvider("stripe-terminal");
      try {
        const reader = await connectStripeReader(driver, (message) => toast.loading(message, { id: "terminal-pairing" }));
        const { error: connectedError } = await sb
          .from("payment_terminals")
          .update({
            status: "active",
            serial: reader.serialNumber || terminal.serial,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", terminal.id)
          .eq("store_id", storeId);
        if (connectedError) throw connectedError;
        await logAudit({
          action: "terminal.activate",
          entity: "payment_terminal",
          entity_id: terminal.id,
          details: { provider: terminal.provider, driver, reader: reader.serialNumber },
        });
        return { kind: "integrated" as const, reader };
      } catch (error) {
        setActiveTerminal("none");
        setActivePaymentProvider(null);
        await sb
          .from("payment_terminals")
          .update({ status: "configured" })
          .eq("id", terminal.id)
          .eq("store_id", storeId);
        throw error;
      } finally {
        toast.dismiss("terminal-pairing");
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["payment_terminals", storeId] });
      if (result.kind === "external") {
        toast.info("External terminal selected. The cashier must confirm its result for every card sale.");
      } else {
        toast.success(`Connected to ${result.reader.label || result.reader.serialNumber}.`);
      }
    },
    onError: (error) => toast.error(userFacingError(error, "Could not pair this terminal.")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("payment_terminals").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ action: "terminal.delete", entity: "payment_terminal", entity_id: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment_terminals"] }),
    onError: () => toast.error("Could not remove this terminal."),
  });

  return (
    <div className="max-w-5xl space-y-5">
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5 text-primary" /> Stripe payment setup
          </CardTitle>
          <CardDescription>
            SEZA handles the Stripe account and Terminal Location IDs behind the scenes. Store staff
            should never have to copy Stripe IDs or secret keys into the POS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-background p-4">
              <div className="font-semibold">1. Connect and verify Stripe</div>
              <p className="mt-1 text-sm text-muted-foreground">
                The owner completes Stripe business verification and payout setup. SEZA saves only
                Stripe identifiers and readiness status, not bank credentials.
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <div className="font-semibold">2. Pair the physical reader</div>
              <p className="mt-1 text-sm text-muted-foreground">
                After Stripe is ready, choose Reader M2 or another supported model on this POS and
                pair it. SEZA supplies the correct merchant and Terminal Location automatically.
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-background p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">
                  {stripeReady
                    ? "Stripe ready for card payments"
                    : stripeNeedsAddress
                      ? "Stripe verified — store address required"
                      : stripeStore.data?.stripe_connected_account_id
                        ? "Stripe verification in progress"
                        : "Stripe is not connected yet"}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {stripeReady
                    ? "SEZA has the connected merchant and Terminal Location. You can prepare and pair the reader."
                    : stripeNeedsAddress
                      ? "Complete Street address, City, State, ZIP and Country in General Settings. SEZA will then create the Terminal Location automatically."
                      : "The store owner must finish Stripe onboarding before this register can accept card payments."}
                </p>
              </div>
              {stripeReady && <CheckCircle2 className="size-6 text-emerald-600" />}
            </div>
          </div>

          {native ? (
            <div className="flex flex-wrap gap-2">
              {!stripeReady && (
                <Button asChild>
                  <a href={OWNER_PAYMENT_SETUP_URL} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 size-4" /> Open Owner Dashboard
                  </a>
                </Button>
              )}
              <Button variant="outline" onClick={copyOwnerSetupLink}>
                <Copy className="mr-2 size-4" /> Copy Owner Dashboard link
              </Button>
            </div>
          ) : isOwner ? (
            <div className="flex flex-wrap gap-2">
              {!stripeNeedsAddress && (
                <Button onClick={() => connectStripe.mutate()} disabled={connectStripe.isPending}>
                  {connectStripe.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 size-4" />
                  )}
                  {stripeReady
                    ? "Manage payout account"
                    : stripeStore.data?.stripe_connected_account_id
                      ? "Continue Stripe setup"
                      : "Connect Stripe"}
                </Button>
              )}
              {stripeNeedsAddress && (
                <Button asChild variant="outline">
                  <a href="/settings?section=general">Complete store address</a>
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  void stripeStatus.refetch();
                  void stripeStore.refetch();
                }}
                disabled={stripeStatus.isFetching}
              >
                {stripeStatus.isFetching && <Loader2 className="mr-2 size-4 animate-spin" />}
                Refresh Stripe status
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
              Only the store owner can connect or change Stripe payment processing.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" /> Payments and terminals
          </CardTitle>
          <CardDescription>
            A terminal is shown as connected only after its installed provider connector confirms a
            real reader connection.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Card sales today</div>
            <div className="mt-1 text-2xl font-semibold">Available after connection</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Payout account</div>
            <div className="mt-1 font-semibold">
              {stripeReady ? "Connected through Stripe" : "Setup required"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {stripeReady
                ? "Use Manage payout account above to review or update the merchant bank account securely in Stripe."
                : "The store owner must complete Stripe payout setup before live card processing."}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Security</div>
            <div className="mt-1 flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4" />
              {stripeReady ? "Stripe verification complete" : "Owner verification required"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prepared and connected terminals</CardTitle>
          <CardDescription>
            “Prepared” means the setup was saved. “Reader connected” means the installed SDK actually
            found and connected to the hardware.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {terminals.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading terminals
            </div>
          ) : (terminals.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No terminals prepared yet.</p>
          ) : (
            (terminals.data ?? []).map((terminal) => {
              const definition = providerForTerminal(terminal);
              const canPair =
                (definition?.connector === "stripe" && stripeReady) ||
                definition?.connector === "finix_cloud" ||
                definition?.connector === "external";
              return (
                <div
                  key={terminal.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="font-medium">{terminal.label}</div>
                    <div className="text-sm text-muted-foreground">
                      {definition?.label ?? terminal.provider} · {String(terminal.config?.model ?? terminal.serial ?? "Model not recorded")}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                      <Wifi className="size-3.5" /> {statusLabel(terminal)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canOperate && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => activate.mutate(terminal)}
                        disabled={activate.isPending || !canPair}
                        title={
                          canPair
                            ? undefined
                            : `${definition?.label ?? terminal.provider} connector is not installed in this APK yet.`
                        }
                      >
                        {definition?.connector === "external"
                          ? "Use as external"
                          : definition?.connector === "finix_cloud"
                            ? terminal.status === "active"
                              ? "Reconnect Finix"
                              : "Connect Finix"
                            : terminal.status === "active"
                              ? "Reconnect reader"
                              : "Pair reader"}
                      </Button>
                    )}
                    {canEdit && (
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(terminal.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {!canEdit && canOperate && (
        <p className="text-xs text-muted-foreground">
          Store staff can reconnect an existing reader here. Adding, removing, or changing payment
          processing remains restricted to authorized managers or the owner.
        </p>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Add or prepare a terminal</CardTitle>
            <CardDescription>
              Choose the provider, model, and register location. SEZA supplies protected processor
              identifiers automatically after the owner finishes payment setup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search Stripe, Square, Clover, PAX, Ingenico, Dejavoo..."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Provider</Label>
                <Select
                  value={form.provider}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      provider: value,
                      model: "",
                      stripeConnectionMethod: value === "stripe" ? form.stripeConnectionMethod : "usb",
                      finixDeviceId: value === "finix" ? form.finixDeviceId : "",
                      finixMerchantId: value === "finix" ? form.finixMerchantId : "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProviders.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Terminal name</Label>
                <Input
                  value={form.label}
                  onChange={(event) => setForm({ ...form, label: event.target.value })}
                  placeholder="Front counter"
                />
              </div>
              <div className="space-y-1">
                <Label>Model</Label>
                <Select value={form.model} onValueChange={(value) => setForm({ ...form, model: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose model" />
                  </SelectTrigger>
                  <SelectContent>
                    {provider.models.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Register location</Label>
                <Input
                  value={form.location}
                  onChange={(event) => setForm({ ...form, location: event.target.value })}
                  placeholder="Front counter"
                />
              </div>
              <div className="space-y-1">
                <Label>Serial number (optional)</Label>
                <Input
                  value={form.serial}
                  onChange={(event) => setForm({ ...form, serial: event.target.value })}
                />
              </div>
              {form.provider === "finix" && (
                <>
                  <div className="space-y-1">
                    <Label>Finix Device ID</Label>
                    <Input
                      value={form.finixDeviceId}
                      onChange={(event) => setForm({ ...form, finixDeviceId: event.target.value })}
                      placeholder="DV..."
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    <p className="text-xs text-muted-foreground">The Device resource assigned to the physical terminal in Finix.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Finix Merchant ID (optional)</Label>
                    <Input
                      value={form.finixMerchantId}
                      onChange={(event) => setForm({ ...form, finixMerchantId: event.target.value })}
                      placeholder="MU..."
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    <p className="text-xs text-muted-foreground">Keep this for reconciliation and merchant mapping. Card-present sales use the Device ID.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Finix environment</Label>
                    <Select
                      value={form.finixEnvironment}
                      onValueChange={(value) => setForm({ ...form, finixEnvironment: value as "sandbox" | "live" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">Sandbox</SelectItem>
                        <SelectItem value="live">Live</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Use Sandbox until Finix approves SEZA for live processing.</p>
                  </div>
                </>
              )}
              {form.provider === "stripe" && (
                <>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Stripe connection</Label>
                    <div className={`rounded-lg border p-3 text-sm ${stripeReady ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                      {stripeReady
                        ? "Ready — SEZA will use this store’s connected Stripe merchant and Terminal Location automatically."
                        : stripeNeedsAddress
                          ? "Complete the store address in General Settings before preparing a Stripe reader."
                          : "Complete Stripe owner onboarding before preparing a Stripe reader."}
                    </div>
                  </div>
                  {form.model.toLowerCase().includes("reader m2") && (
                    <div className="space-y-1">
                      <Label>Reader M2 connection</Label>
                      <Select
                        value={form.stripeConnectionMethod}
                        onValueChange={(value) =>
                          setForm({
                            ...form,
                            stripeConnectionMethod: value as "usb" | "bluetooth",
                          })
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="usb">USB — recommended for countertop POS</SelectItem>
                          <SelectItem value="bluetooth">Bluetooth — wireless fallback</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        USB uses the M2 data cable and Android USB permission. Bluetooth remains available as a fallback.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-medium">
                {provider.connector === "stripe"
                  ? "Native connector installed"
                  : provider.connector === "finix_cloud"
                    ? "Finix cloud connector installed"
                  : provider.connector === "external"
                    ? "External confirmation mode"
                    : "Connector not installed in this APK"}
              </div>
              <div className="mt-1 text-muted-foreground">{provider.note}</div>
            </div>
            <Button
              onClick={() => add.mutate()}
              disabled={add.isPending || (form.provider === "stripe" && !stripeReady)}
            >
              <Plus className="mr-2 size-4" /> Prepare terminal
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
