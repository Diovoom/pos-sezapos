import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
    note: "Native Stripe Terminal connector installed. A Stripe Location ID and completed owner account setup are required before pairing.",
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
  if (model.includes("simulated")) return "stripe-tap-to-pay";
  if (model.includes("tap to pay")) return "stripe-tap-to-pay";
  if (model.includes("wisepad") || model.includes("reader m2")) return "stripe-wisepad3";
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

export function PaymentTerminalsPanel({ canEdit }: { canEdit: boolean }) {
  const { data: me } = useMe();
  const storeId = me?.store?.id as string | undefined;
  const qc = useQueryClient();
  const native = isNativeMode();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    label: "",
    provider: "stripe",
    model: "",
    serial: "",
    location: "Front counter",
    stripeLocationId: "",
    testMode: true,
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
      if (form.provider === "stripe" && !form.stripeLocationId.trim()) {
        throw new Error(
          "Enter the Stripe Terminal Location ID from the owner payment setup before pairing this reader.",
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
              form.provider === "stripe" ? form.stripeLocationId.trim() : undefined,
            test_mode: form.provider === "stripe" ? form.testMode : undefined,
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
        stripeLocationId: "",
        testMode: true,
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
            <Smartphone className="size-5 text-primary" /> Complete owner payment setup first
          </CardTitle>
          <CardDescription>
            Business verification, processor authorization, and payout-bank setup belong in the
            Owner Dashboard. This Android screen is for choosing and pairing the physical reader.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-background p-4">
              <div className="font-semibold">1. Owner Dashboard</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect the processor, complete the provider-hosted verification, and choose the
                payout account. SEZA does not store full routing or account numbers.
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <div className="font-semibold">2. This physical POS</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the provider location ID, discover the certified reader, pair it, and run the
                provider test before accepting cards.
              </p>
            </div>
          </div>
          {native ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={OWNER_PAYMENT_SETUP_URL} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 size-4" /> Open Owner Dashboard payment setup
                </a>
              </Button>
              <Button variant="outline" onClick={copyOwnerSetupLink}>
                <Copy className="mr-2 size-4" /> Copy setup link for your phone
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border bg-background p-3 text-sm">
              <CheckCircle2 className="size-4 text-primary" /> You are in the Owner Dashboard payment
              setup area. Complete processor onboarding here, then pair the reader on the Android POS.
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
            <div className="mt-1 font-semibold">Complete in Owner Dashboard</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Bank information is handled by the selected processor.
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Security</div>
            <div className="mt-1 flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4" /> Owner verification required
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
              const canPair = definition?.connector === "stripe" || definition?.connector === "finix_cloud" || definition?.connector === "external";
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
                    {canEdit && terminal.status !== "active" && (
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
                            ? "Connect Finix"
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

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Add or prepare a terminal</CardTitle>
            <CardDescription>
              Save the actual provider, model, register location, and provider location ID. This does
              not claim the reader is connected until pairing succeeds.
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
                      stripeLocationId: value === "stripe" ? form.stripeLocationId : "",
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
                  <div className="space-y-1">
                    <Label>Stripe Terminal Location ID</Label>
                    <Input
                      value={form.stripeLocationId}
                      onChange={(event) => setForm({ ...form, stripeLocationId: event.target.value })}
                      placeholder="tml_..."
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      Get this after completing Stripe setup in the Owner Dashboard.
                    </p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label>Stripe test mode</Label>
                      <p className="text-xs text-muted-foreground">Use test credentials and simulated payments.</p>
                    </div>
                    <Switch
                      checked={form.testMode}
                      onCheckedChange={(checked) => setForm({ ...form, testMode: checked })}
                    />
                  </div>
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
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              <Plus className="mr-2 size-4" /> Prepare terminal
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
