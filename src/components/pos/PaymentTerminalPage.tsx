import { useQuery } from "@tanstack/react-query";
import { CreditCard, ExternalLink, Usb } from "lucide-react";
import { PaymentTerminalsPanel } from "@/components/settings/PaymentTerminalsPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ManagerSupportFooter } from "@/components/pos/ManagerSupportFooter";
import {
  getStripeTerminalContext,
  isReady as isStripeReaderReady,
} from "@/lib/hardware/terminal-stripe";

export function PaymentTerminalPage() {
  const permissions = usePermissions();
  const canConfigure =
    permissions.isSuper || permissions.isManager || permissions.has("hardware.configure");
  const canOperate = true;

  const readerReady = useQuery({
    queryKey: ["payment-terminal-native-reader-ready"],
    queryFn: () => isStripeReaderReady("stripe-m2"),
    retry: false,
    refetchInterval: 1_000,
  });
  const readerConnected = readerReady.data === true;

  const stripeSetup = useQuery({
    queryKey: ["payment-terminal-stripe-setup-ready"],
    queryFn: async () => {
      const context = await getStripeTerminalContext();
      return Boolean(context.ready && context.terminalLocationReady);
    },
    retry: false,
    refetchInterval: 5_000,
  });
  const merchantSetupReady = stripeSetup.data === true;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <CreditCard className="size-4 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">Payment terminal</h1>
            <p className="text-[11px] text-muted-foreground">
              Reader status and connection for this register.
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-20">
        <div className="mx-auto max-w-4xl space-y-3">
          {!readerConnected && (
            <Card className="rounded-md shadow-none">
              <CardContent className={`grid gap-3 p-3 ${merchantSetupReady ? "" : "md:grid-cols-2"}`}>
                <div className="flex gap-2.5">
                  <Usb className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Reader M2</p>
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      SEZA reconnects the saved reader automatically. Keep the reader powered and connected.
                    </p>
                  </div>
                </div>

                {!merchantSetupReady && (
                  <div className="flex gap-2.5">
                    <ExternalLink className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Owner payment setup</p>
                      <p className="text-[11px] leading-4 text-muted-foreground">
                        Complete merchant verification and settlement setup from the Owner Dashboard.
                      </p>
                      <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                        <a
                          href="https://dashboard.sezapos.com/settings?section=terminal"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open owner setup
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <PaymentTerminalsPanel canEdit={canConfigure} canOperate={canOperate} />
          <p className="px-1 text-[11px] text-muted-foreground">
            Connected means the provider SDK confirms the physical reader is available.
          </p>
          <ManagerSupportFooter />
        </div>
      </div>
    </div>
  );
}
