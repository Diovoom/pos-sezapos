import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/hooks/useMe";
import { supabase } from "@/integrations/supabase/client";
import { userFacingError } from "@/lib/errors/user-facing";
import { getStripeConnectStatus, startStripeConnectOnboarding } from "@/lib/stripe-connect.functions";

const ANDROID_SETUP_TEXT = "Physical reader pairing is managed on the SEZA Android POS.";

type Terminal = {
  id: string;
  label: string;
  serial: string | null;
  location: string | null;
  status: string;
  last_seen_at: string | null;
  config?: Record<string, unknown> | null;
};

function statusTone(value: string | null | undefined) {
  const status = String(value || "").toLowerCase();
  if (["ready", "active", "enabled"].includes(status)) return "text-emerald-700 bg-emerald-500/10 border-emerald-500/20";
  if (["onboarding", "payments_ready", "pending", "migration_required"].includes(status)) return "text-amber-700 bg-amber-500/10 border-amber-500/20";
  return "text-muted-foreground bg-muted/40";
}

export function PaymentTerminalsPanel({ canEdit }: { canEdit: boolean }) {
  const { data: me } = useMe();
  const storeId = me?.store?.id as string | undefined;
  const isOwner = Boolean(me?.roles?.includes("owner"));
  const qc = useQueryClient();
  const getStripeStatus = useServerFn(getStripeConnectStatus);
  const beginStripeOnboarding = useServerFn(startStripeConnectOnboarding);

  const store = useQuery({
    queryKey: ["stripe-owner-store", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name,address,city,state,zip,country,stripe_connected_account_id,stripe_connect_status,stripe_card_payments_status,stripe_terminal_location_id,stripe_onboarding_completed_at")
        .eq("id", storeId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const terminals = useQuery({
    queryKey: ["stripe-terminal-list-web", storeId],
    enabled: Boolean(storeId),
    queryFn: async (): Promise<Terminal[]> => {
      const { data, error } = await supabase
        .from("payment_terminals")
        .select("id,label,serial,location,status,last_seen_at,config")
        .eq("store_id", storeId!)
        .eq("provider", "stripe")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Terminal[];
    },
  });

  const status = useQuery({
    queryKey: ["stripe-connect-status", storeId],
    enabled: Boolean(storeId && isOwner),
    queryFn: () => getStripeStatus({}),
    retry: false,
  });

  const connect = useMutation({
    mutationFn: () => beginStripeOnboarding({}),
    onSuccess: ({ url }) => {
      if (!url) throw new Error("Stripe did not return an onboarding URL.");
      window.location.assign(url);
    },
    onError: (error) => toast.error(userFacingError(error, "Could not open Stripe setup.")),
  });

  const refresh = async () => {
    await Promise.all([
      status.refetch(),
      store.refetch(),
      terminals.refetch(),
    ]);
    void qc.invalidateQueries({ queryKey: ["stripe-connect-status"] });
  };

  const connectStatus = status.data?.status || store.data?.stripe_connect_status || "not_started";
  const cardStatus = status.data?.cardPaymentsStatus || store.data?.stripe_card_payments_status || null;
  const migrationRequired = Boolean(status.data?.migrationRequired || connectStatus === "migration_required");
  const cardStatusLabel = ["restricted", "pending", "inactive"].includes(String(cardStatus || "").toLowerCase())
    ? "Setup required"
    : cardStatus
      ? String(cardStatus).replaceAll("_", " ")
      : "Not ready";
  const locationReady = Boolean(status.data?.terminalLocationReady || store.data?.stripe_terminal_location_id);
  const ready = connectStatus === "ready" && ["active", "enabled"].includes(String(cardStatus || "").toLowerCase()) && locationReady;
  const hasAddress = Boolean(store.data?.address && store.data?.city && store.data?.state && store.data?.zip && store.data?.country);

  return (
    <div className="max-w-4xl space-y-4">
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="size-5 text-primary" /> Stripe payments</CardTitle>
          <CardDescription>
            Stripe handles merchant verification, legal details, payout banking, and card-payment eligibility. SEZA keeps the merchant status here and the physical reader workflow in the Android POS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={`rounded-lg border p-3 ${statusTone(connectStatus)}`}>
              <div className="text-xs font-medium uppercase tracking-wide">Merchant</div>
              <div className="mt-1 font-semibold capitalize">{connectStatus.replaceAll("_", " ")}</div>
            </div>
            <div className={`rounded-lg border p-3 ${statusTone(cardStatus)}`}>
              <div className="text-xs font-medium uppercase tracking-wide">Card payments</div>
              <div className="mt-1 font-semibold capitalize">{cardStatusLabel}</div>
            </div>
            <div className={`rounded-lg border p-3 ${locationReady ? statusTone("ready") : statusTone("pending")}`}>
              <div className="text-xs font-medium uppercase tracking-wide">Terminal location</div>
              <div className="mt-1 font-semibold">{locationReady ? "Ready" : "Not created"}</div>
            </div>
          </div>

          {!hasAddress && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              Add the store street address, city, state, ZIP, and country in General Settings before Terminal Location setup can finish.
            </div>
          )}

          {migrationRequired && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              This sandbox payment profile was created with the old setup. Restart secure payment setup once to create the new SEZA-managed test profile. Your store data is not affected.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {isOwner && canEdit && (
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ExternalLink className="mr-2 size-4" />}
                {ready ? "Update payment verification or payout details" : migrationRequired ? "Restart secure payment setup" : connectStatus === "not_started" ? "Set up payments" : "Continue payment setup"}
              </Button>
            )}
            <Button variant="outline" onClick={refresh} disabled={status.isFetching || store.isFetching}>
              <RefreshCw className={`mr-2 size-4 ${status.isFetching || store.isFetching ? "animate-spin" : ""}`} /> Refresh status
            </Button>
          </div>

          {ready && (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" /> This merchant is ready for Stripe Terminal card-present payments.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Physical readers</CardTitle>
          <CardDescription>{ANDROID_SETUP_TEXT}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {terminals.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading readers…</div>
          ) : (terminals.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No Stripe reader has been added from an Android register yet.
            </div>
          ) : (
            (terminals.data ?? []).map((terminal) => (
              <div key={terminal.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">{terminal.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {String(terminal.config?.model || "Stripe reader")}{terminal.serial ? ` · ${terminal.serial}` : ""}{terminal.location ? ` · ${terminal.location}` : ""}
                  </div>
                </div>
                <div className="text-sm capitalize">{terminal.status}</div>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            Reader discovery, USB/Bluetooth pairing, reconnect, disconnect, and test are intentionally available only on the physical SEZA Android register.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
