import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { logAudit } from "@/lib/audit-log";
import { setActiveTerminal, type TerminalDriverId } from "@/lib/hardware";
import { connectReader as connectStripeReader } from "@/lib/hardware/terminal-stripe";
import { setActivePaymentProvider } from "@/lib/pos/payment-terminal";
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

const STRIPE_MODELS = [
  "Reader M2",
  "Tap to Pay on Android",
  "WisePOS E",
  "S700",
  "WisePad 3",
] as const;

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

function driverForModel(model: string): TerminalDriverId {
  const value = model.toLowerCase();
  if (value.includes("reader m2")) return "stripe-m2";
  if (value.includes("tap to pay")) return "stripe-tap-to-pay";
  if (value.includes("wisepad")) return "stripe-wisepad3";
  if (value.includes("wisepos") || value.includes("s700")) return "stripe-wisepos";
  return "none";
}

function driverForTerminal(terminal: Terminal): TerminalDriverId {
  const configured = String(terminal.config?.reader_type ?? "");
  if (
    configured === "stripe-m2" ||
    configured === "stripe-tap-to-pay" ||
    configured === "stripe-wisepos" ||
    configured === "stripe-wisepad3"
  ) {
    return configured;
  }
  return driverForModel(String(terminal.config?.model ?? ""));
}

function statusLabel(terminal: Terminal) {
  if (terminal.status === "active") return "Reader connected";
  if (terminal.status === "configured") return "Ready to pair";
  return "Not paired";
}

export function PaymentTerminalsPanel({ canEdit }: { canEdit: boolean }) {
  const { data: me } = useMe();
  const storeId = me?.store?.id as string | undefined;
  const qc = useQueryClient();
  const [form, setForm] = useState({
    label: "Front counter",
    model: "",
    serial: "",
    location: "Front counter",
    connectionMethod: "usb" as "usb" | "bluetooth",
  });

  const stripeStore = useQuery({
    queryKey: ["android-stripe-store", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("stores")
        .select("id,stripe_connect_status,stripe_card_payments_status,stripe_terminal_location_id")
        .eq("id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data as
        | {
            id: string;
            stripe_connect_status?: string | null;
            stripe_card_payments_status?: string | null;
            stripe_terminal_location_id?: string | null;
          }
        | null;
    },
    retry: false,
  });

  const stripeReady = Boolean(
    stripeStore.data?.stripe_connect_status === "ready" &&
      String(stripeStore.data?.stripe_terminal_location_id || "").trim(),
  );

  const terminals = useQuery({
    queryKey: ["payment_terminals", storeId],
    enabled: !!storeId,
    queryFn: async (): Promise<Terminal[]> => {
      const { data, error } = await sb
        .from("payment_terminals")
        .select("*")
        .eq("store_id", storeId)
        .eq("provider", "stripe")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Terminal[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Your store is not ready yet.");
      if (!stripeReady) {
        throw new Error("Complete Stripe setup in the Owner Dashboard before pairing a reader.");
      }
      if (!form.label.trim()) throw new Error("Enter a terminal name.");
      if (!form.model) throw new Error("Choose the Stripe reader model.");

      const driver = driverForModel(form.model);
      if (driver === "none") throw new Error("Choose a supported Stripe reader model.");

      const locationId = String(stripeStore.data?.stripe_terminal_location_id || "").trim();
      const { data, error } = await sb
        .from("payment_terminals")
        .insert({
          store_id: storeId,
          label: form.label.trim(),
          provider: "stripe",
          serial: form.serial.trim() || null,
          location: form.location.trim() || "Front counter",
          status: "configured",
          config: {
            model: form.model,
            mode: "integrated",
            setup_source: "android_pos",
            location_id: locationId,
            reader_type: driver,
            connection_method: driver === "stripe-m2" ? form.connectionMethod : undefined,
          },
        })
        .select()
        .single();
      if (error) throw error;

      await logAudit({
        action: "terminal.create",
        entity: "payment_terminal",
        entity_id: data.id,
        details: { provider: "stripe", model: form.model },
      });
    },
    onSuccess: () => {
      toast.success("Reader saved. Tap Pair reader to connect it.");
      setForm({
        label: "Front counter",
        model: "",
        serial: "",
        location: "Front counter",
        connectionMethod: "usb",
      });
      void qc.invalidateQueries({ queryKey: ["payment_terminals", storeId] });
    },
    onError: (error) => toast.error(userFacingError(error, "Could not save this reader.")),
  });

  const activate = useMutation({
    mutationFn: async (terminal: Terminal) => {
      if (!storeId) throw new Error("Your store is not ready yet.");
      if (!stripeReady) {
        throw new Error("Stripe setup is not complete for this store yet.");
      }

      const driver = driverForTerminal(terminal);
      if (driver === "none") throw new Error("This reader model is not supported by the Stripe connector.");

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
        const reader = await connectStripeReader(driver, (message) =>
          toast.loading(message, { id: "terminal-pairing" }),
        );
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
          details: { provider: "stripe", driver, reader: reader.serialNumber },
        });
        return reader;
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
    onSuccess: (reader) => {
      void qc.invalidateQueries({ queryKey: ["payment_terminals", storeId] });
      toast.success(`Connected to ${reader.label || reader.serialNumber}.`);
    },
    onError: (error) => toast.error(userFacingError(error, "Could not pair this reader.")),
  });

  const remove = useMutation({
    mutationFn: async (terminal: Terminal) => {
      if (terminal.status === "active") {
        setActiveTerminal("none");
        setActivePaymentProvider(null);
      }
      const { error } = await sb
        .from("payment_terminals")
        .delete()
        .eq("id", terminal.id)
        .eq("store_id", storeId);
      if (error) throw error;
      await logAudit({
        action: "terminal.delete",
        entity: "payment_terminal",
        entity_id: terminal.id,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payment_terminals", storeId] });
      toast.success("Reader removed.");
    },
    onError: () => toast.error("Could not remove this reader."),
  });

  return (
    <div className="max-w-4xl space-y-4">
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" /> Card payments
          </CardTitle>
          <CardDescription>
            {stripeStore.isLoading
              ? "Checking this store’s Stripe setup…"
              : stripeReady
                ? "Stripe is ready. Pair the reader used by this register."
                : "Finish Stripe setup once in the Owner Dashboard, then return here to pair the reader."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stripeStore.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking Stripe
            </div>
          ) : stripeReady ? (
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="size-5" /> Ready to pair a reader
            </div>
          ) : (
            <Button asChild>
              <a href={OWNER_PAYMENT_SETUP_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 size-4" /> Open SEZA Dashboard
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Readers</CardTitle>
          <CardDescription>
            SEZA only shows a reader as connected after the native Stripe Terminal SDK confirms it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {terminals.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading readers
            </div>
          ) : (terminals.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No card reader added yet.</p>
          ) : (
            (terminals.data ?? []).map((terminal) => (
              <div key={terminal.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                <div>
                  <div className="font-semibold">{terminal.label}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {String(terminal.config?.model ?? "Stripe reader")}
                    {terminal.serial ? ` • ${terminal.serial}` : ""}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wifi className="size-3.5" /> {statusLabel(terminal)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => activate.mutate(terminal)}
                    disabled={!canEdit || !stripeReady || activate.isPending}
                  >
                    {activate.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    {terminal.status === "active" ? "Reconnect" : "Pair reader"}
                  </Button>
                  {canEdit ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove.mutate(terminal)}
                      disabled={remove.isPending}
                      aria-label="Remove reader"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Add reader</CardTitle>
            <CardDescription>
              Choose the Stripe reader. SEZA fills the store’s Stripe account and Terminal Location automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Reader name</Label>
                <Input
                  value={form.label}
                  onChange={(event) => setForm({ ...form, label: event.target.value })}
                  placeholder="Front counter"
                />
              </div>
              <div className="space-y-1">
                <Label>Model</Label>
                <Select value={form.model} onValueChange={(model) => setForm({ ...form, model })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose Stripe reader" />
                  </SelectTrigger>
                  <SelectContent>
                    {STRIPE_MODELS.map((model) => (
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
              {form.model.toLowerCase().includes("reader m2") ? (
                <div className="space-y-1 sm:col-span-2">
                  <Label>Reader M2 connection</Label>
                  <Select
                    value={form.connectionMethod}
                    onValueChange={(value) =>
                      setForm({ ...form, connectionMethod: value as "usb" | "bluetooth" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usb">USB — recommended for this countertop POS</SelectItem>
                      <SelectItem value="bluetooth">Bluetooth — wireless fallback</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <Button onClick={() => add.mutate()} disabled={!stripeReady || add.isPending}>
              {add.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Add reader
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
