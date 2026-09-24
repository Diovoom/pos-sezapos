import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { fmtCurrency } from "@/lib/format";
import { logAudit } from "@/lib/audit-log";
import { userFacingError } from "@/lib/errors/user-facing";

export function RecoverCardProcessingCostsPanel() {
  const qc = useQueryClient();
  const me = useMe();
  const storeId = me.data?.store?.id as string | undefined;
  const isOwner = Boolean(me.data?.roles?.includes("owner"));

  const pricing = useQuery({
    queryKey: ["store-card-processing-pricing", storeId],
    enabled: Boolean(storeId && isOwner),
    queryFn: async () => {
      const { data, error } = await (supabase.from("stores") as any)
        .select(
          "id,recover_card_processing_costs,card_processing_percent,card_processing_fixed_fee,updated_at",
        )
        .eq("id", storeId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        recover_card_processing_costs: boolean;
        card_processing_percent: number;
        card_processing_fixed_fee: number;
        updated_at: string;
      } | null;
    },
  });

  const update = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await (supabase.rpc as any)(
        "set_recover_card_processing_costs",
        { p_enabled: enabled },
      );
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("SEZA could not update the payment pricing setting.");
      return row as {
        recover_card_processing_costs: boolean;
        card_processing_percent: number;
        card_processing_fixed_fee: number;
      };
    },
    onSuccess: async (row) => {
      qc.setQueryData(["store-card-processing-pricing", storeId], (current: any) => ({
        ...(current ?? {}),
        ...row,
        id: storeId,
        updated_at: new Date().toISOString(),
      }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["store", storeId] }),
        qc.invalidateQueries({ queryKey: ["store"] }),
      ]);
      void logAudit({
        action: "settings.update",
        entity: "store",
        entity_id: storeId,
        details: {
          setting: "recover_card_processing_costs",
          enabled: row.recover_card_processing_costs,
        },
      });
      toast.success(
        row.recover_card_processing_costs
          ? "Recover Card Processing Costs is on"
          : "Recover Card Processing Costs is off",
      );
    },
    onError: (error) => {
      toast.error(userFacingError(error, "This payment setting could not be updated."));
    },
  });

  if (!isOwner) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" /> Owner-only payment pricing
          </CardTitle>
          <CardDescription>
            Only the business owner can change card-processing cost recovery.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const row = pricing.data;
  const enabled = Boolean(row?.recover_card_processing_costs);
  const percent = Number(row?.card_processing_percent ?? 0);
  const fixed = Number(row?.card_processing_fixed_fee ?? 0);
  const currency = me.data?.store?.currency ?? "USD";

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-5" /> Recover Card Processing Costs
              </CardTitle>
              <CardDescription className="mt-2 max-w-2xl">
                When enabled, SEZA automatically calculates a card price designed to recover eligible
                card-processing costs. Customers paying cash receive the lower cash price.
              </CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0">
              Owner only
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {pricing.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading payment pricing…
            </div>
          ) : pricing.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {userFacingError(pricing.error, "Payment pricing could not be loaded. Please refresh and try again.")}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
                <div>
                  <div className="font-semibold">Recover Card Processing Costs</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cashiers cannot change this setting. It applies to every register connected to this
                    business.
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  disabled={update.isPending || !row}
                  onCheckedChange={(checked) => update.mutate(checked)}
                  aria-label="Recover Card Processing Costs"
                />
              </div>

              <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                <div className="font-semibold">Current card-processing pricing model</div>
                <p className="mt-1 text-muted-foreground">
                  {percent > 0 || fixed > 0
                    ? `${(percent * 100).toFixed(2)}% + ${fmtCurrency(fixed, currency)} per card transaction`
                    : "No card-processing pricing has been configured for this business."}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Processing rates are managed centrally by SEZA and are not editable by cashiers or
                  employees.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Cash
                  </div>
                  <div className="mt-1 font-semibold">Lower cash/base price</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The amount rung by the merchant remains the cash price.
                  </p>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Card
                  </div>
                  <div className="mt-1 font-semibold">Calculated card price</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The full card price is established before Stripe Terminal starts collecting the card.
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
