import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CreditCard, Loader2, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { isNativeMode } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { logAudit } from "@/lib/audit-log";
import { setActiveTerminal, type TerminalDriverId } from "@/lib/hardware";
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
  models: string[];
  note: string;
};

const PROVIDERS: Provider[] = [
  {
    id: "stripe",
    label: "Stripe Terminal",
    mode: "integrated",
    models: ["Simulated reader (test)", "Tap to Pay on Android", "WisePOS E", "S700", "WisePad 3"],
    note: "Automatic approved or declined results when the certified SDK is enabled.",
  },
  {
    id: "square",
    label: "Square",
    mode: "integrated",
    models: ["Square Reader", "Square Terminal", "Tap to Pay"],
    note: "Requires a merchant Square account and approved SEZA integration.",
  },
  {
    id: "clover",
    label: "Clover",
    mode: "integrated",
    models: ["Clover Flex", "Clover Mini", "Clover Station"],
    note: "Requires Clover merchant credentials and device activation.",
  },
  {
    id: "pax",
    label: "PAX",
    mode: "integrated",
    models: ["A920", "A920 Pro", "A80", "E700"],
    note: "Connection depends on the merchant processor and certified gateway.",
  },
  {
    id: "ingenico",
    label: "Ingenico",
    mode: "integrated",
    models: ["Lane 3000", "Lane 5000", "Desk 3500", "Move 5000"],
    note: "Connection depends on the merchant processor and supported gateway.",
  },
  {
    id: "dejavoo",
    label: "Dejavoo",
    mode: "integrated",
    models: ["Z8", "Z9", "Z11", "QD4"],
    note: "Cloud or local integration is enabled only for supported processors.",
  },
  {
    id: "adyen",
    label: "Adyen",
    mode: "integrated",
    models: ["S1E2L", "AMS1", "NYC1"],
    note: "Requires an active Adyen merchant account.",
  },
  {
    id: "fiserv",
    label: "Fiserv / CardPointe",
    mode: "integrated",
    models: ["Clover devices", "Ingenico devices", "PAX devices"],
    note: "Exact reader support depends on the merchant account.",
  },
  {
    id: "worldpay",
    label: "Worldpay",
    mode: "integrated",
    models: ["PAX", "Ingenico", "Verifone"],
    note: "Exact reader support depends on the merchant account.",
  },
  {
    id: "elavon",
    label: "Elavon",
    mode: "integrated",
    models: ["Ingenico", "PAX", "Converge terminals"],
    note: "Exact reader support depends on the merchant account.",
  },
  {
    id: "external",
    label: "External standalone terminal",
    mode: "external",
    models: ["Any terminal used separately"],
    note: "SEZA records external card payments without pretending it received processor approval.",
  },
];

function driverForTerminal(terminal: Terminal): TerminalDriverId {
  if (terminal.provider !== "stripe") return "none";
  const model = String(terminal.config?.model ?? "").toLowerCase();
  if (model.includes("simulated")) return "stripe-tap-to-pay";
  if (model.includes("tap to pay")) return "stripe-tap-to-pay";
  if (model.includes("wisepad")) return "stripe-wisepad3";
  if (model.includes("wisepos")) return "stripe-wisepos";
  return "none";
}

export function PaymentTerminalsPanel({ canEdit }: { canEdit: boolean }) {
  const { data: me } = useMe();
  const storeId = me?.store?.id as string | undefined;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    label: "",
    provider: "stripe",
    model: "",
    serial: "",
    location: "Front counter",
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

  const add = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Your store is not ready yet.");
      if (!form.label.trim()) throw new Error("Enter a terminal name.");
      if (!form.model.trim()) throw new Error("Choose or enter the terminal model.");
      const { data, error } = await sb
        .from("payment_terminals")
        .insert({
          store_id: storeId,
          label: form.label.trim(),
          provider: form.provider,
          serial: form.serial.trim() || null,
          location: form.location.trim() || null,
          status: "inactive",
          config: {
            model: form.model.trim(),
            mode: provider.mode,
            setup_source: isNativeMode() ? "android_pos" : "owner_dashboard",
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
      toast.success("Terminal saved. Select Use on this POS to activate it.");
      setForm({ label: "", provider: "stripe", model: "", serial: "", location: "Front counter" });
      qc.invalidateQueries({ queryKey: ["payment_terminals"] });
    },
    onError: (error) =>
      toast.error(userFacingError(error, "Could not save this terminal.")),
  });

  const activate = useMutation({
    mutationFn: async (terminal: Terminal) => {
      if (!storeId) throw new Error("Your store is not ready yet.");
      const { error: clearError } = await sb
        .from("payment_terminals")
        .update({ status: "inactive" })
        .eq("store_id", storeId);
      if (clearError) throw clearError;
      const { error } = await sb
        .from("payment_terminals")
        .update({ status: "active", last_seen_at: new Date().toISOString() })
        .eq("id", terminal.id)
        .eq("store_id", storeId);
      if (error) throw error;
      const driver = driverForTerminal(terminal);
      setActiveTerminal(driver);
      await logAudit({
        action: "terminal.activate",
        entity: "payment_terminal",
        entity_id: terminal.id,
        details: { provider: terminal.provider, driver },
      });
      return { driver };
    },
    onSuccess: ({ driver }) => {
      qc.invalidateQueries({ queryKey: ["payment_terminals", storeId] });
      if (driver === "none") {
        toast.info("Terminal saved as external. Automatic card approval needs a supported integration.");
      } else {
        toast.success("This terminal is now active on the POS.");
      }
    },
    onError: (error) => toast.error(userFacingError(error, "Could not activate this terminal.")),
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
    <div className="space-y-5 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" /> Payments and terminals
          </CardTitle>
          <CardDescription>
            Owners can manage processors and readers from the web dashboard or Android owner mode.
            Pairing and test charges finish on the physical POS.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Card sales today</div>
            <div className="mt-1 text-2xl font-semibold">Available after connection</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Payout account</div>
            <div className="mt-1 font-semibold">Not connected</div>
            <div className="text-xs text-muted-foreground mt-1">
              Full bank details are never stored by SEZA.
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Security</div>
            <div className="mt-1 flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4" /> Step-up verification required
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected terminals</CardTitle>
          <CardDescription>
            Only a certified integrated connection can return an automatic approval. External
            terminal mode always asks the cashier to confirm the separate terminal result.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {terminals.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading terminals
            </div>
          ) : (terminals.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No terminals connected yet.</p>
          ) : (
            (terminals.data ?? []).map((terminal) => (
              <div
                key={terminal.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <div className="font-medium">{terminal.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {PROVIDERS.find((item) => item.id === terminal.provider)?.label ??
                      terminal.provider}{" "}
                    · {String(terminal.config?.model ?? terminal.serial ?? "Model not recorded")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs capitalize">{terminal.status}</span>
                  {canEdit && terminal.status !== "active" && (
                    <Button size="sm" variant="outline" onClick={() => activate.mutate(terminal)} disabled={activate.isPending}>
                      Use on this POS
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(terminal.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Add or prepare a terminal</CardTitle>
            <CardDescription>
              Search by provider or model. SEZA will show the correct setup path on the POS.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search Stripe, Clover, PAX, Ingenico, Dejavoo..."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Provider</Label>
                <Select
                  value={form.provider}
                  onValueChange={(value) => setForm({ ...form, provider: value, model: "" })}
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
                <Select
                  value={form.model}
                  onValueChange={(value) => setForm({ ...form, model: value })}
                >
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
                <Label>Serial number (optional)</Label>
                <Input
                  value={form.serial}
                  onChange={(event) => setForm({ ...form, serial: event.target.value })}
                />
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-medium">
                {provider.mode === "integrated" ? "Integrated setup" : "External terminal mode"}
              </div>
              <div className="mt-1 text-muted-foreground">{provider.note}</div>
            </div>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              <Plus className="mr-2 size-4" /> Save terminal
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
