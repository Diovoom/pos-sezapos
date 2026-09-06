import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw, Unplug, Wifi } from "lucide-react";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { setActiveTerminal } from "@/lib/hardware";
import {
  connectReader,
  disconnect,
  getStripeTerminalContext,
  isReady,
  saveStripeTerminal,
  updateStripeTerminal,
  type StripeTerminalRecord,
} from "@/lib/hardware/terminal-stripe";
import { setActivePaymentProvider } from "@/lib/pos/payment-terminal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SEZA_PAYMENT_SETUP_URL = "https://dashboard.sezapos.com/settings?section=terminal";
const READER_DRIVER = "stripe-m2" as const;

function connectionMethod(terminal: StripeTerminalRecord): "usb" | "bluetooth" {
  return String(terminal.config?.connection_method || "usb").toLowerCase() === "bluetooth"
    ? "bluetooth"
    : "usb";
}

function readerLabel(terminal: StripeTerminalRecord) {
  if (terminal.serial) return `Reader M2 · ${terminal.serial}`;
  return "Reader M2";
}

export function PaymentTerminalsPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();

  const context = useQuery({
    queryKey: ["stripe-terminal-context"],
    queryFn: getStripeTerminalContext,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const stripeReady = Boolean(context.data?.ready && context.data?.locationId);
  const terminals = context.data?.terminals ?? [];
  const terminal = (terminals.find((item) => item.status === "active") ?? terminals[0]) as
    | StripeTerminalRecord
    | undefined;

  const readerReady = useQuery({
    queryKey: ["stripe-reader-ready", terminal?.id],
    enabled: Boolean(stripeReady && terminal?.status === "active"),
    queryFn: () => isReady(READER_DRIVER),
    retry: false,
    refetchInterval: 10_000,
  });
  const physicallyConnected = readerReady.data === true;

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["stripe-terminal-context"] }),
      qc.invalidateQueries({ queryKey: ["stripe-reader-ready"] }),
    ]);
  };

  const connectExisting = async (reader: StripeTerminalRecord) => {
    await updateStripeTerminal("activate", reader.id);
    setActiveTerminal(READER_DRIVER);
    setActivePaymentProvider("stripe-terminal");
    try {
      const connected = await connectReader(READER_DRIVER, (message) => toast.loading(message, { id: "seza-reader" }));
      window.dispatchEvent(new Event("seza:device-config-changed"));
      return connected;
    } catch (error) {
      // Keep the reader configured when a USB/Bluetooth connection attempt is
      // interrupted. Checkout can then retry the physical connection instead
      // of incorrectly falling back to "No payment terminal".
      window.dispatchEvent(new Event("seza:device-config-changed"));
      throw error;
    } finally {
      toast.dismiss("seza-reader");
    }
  };

  const connectNew = useMutation({
    mutationFn: async (method: "usb" | "bluetooth") => {
      if (!stripeReady) throw new Error("Finish payment setup on SEZA before connecting a card reader.");
      const saved = await saveStripeTerminal({
        label: "Card reader",
        model: "Reader M2",
        location: "Front counter",
        readerType: READER_DRIVER,
        connectionMethod: method,
      });
      const created = saved.terminals[saved.terminals.length - 1];
      if (!created) throw new Error("The card reader could not be prepared.");
      return connectExisting(created);
    },
    onSuccess: async (reader) => {
      await refresh();
      toast.success(`${reader.label || reader.serialNumber} is connected.`);
    },
    onError: async (error) => {
      await refresh();
      toast.error(userFacingError(error, "Could not connect the card reader."));
    },
  });

  const reconnect = useMutation({
    mutationFn: async (reader: StripeTerminalRecord) => connectExisting(reader),
    onSuccess: async (reader) => {
      await refresh();
      toast.success(`${reader.label || reader.serialNumber} is connected.`);
    },
    onError: (error) => toast.error(userFacingError(error, "Could not connect the card reader.")),
  });

  const test = useMutation({
    mutationFn: async (reader: StripeTerminalRecord) => {
      if (reader.status !== "active") await updateStripeTerminal("activate", reader.id);
      setActiveTerminal(READER_DRIVER);
      setActivePaymentProvider("stripe-terminal");
      const connected = await connectReader(READER_DRIVER, (message) => toast.loading(message, { id: "seza-reader-test" }));
      const ready = await isReady(READER_DRIVER);
      if (!ready) throw new Error("The card reader did not finish connecting.");
      return connected;
    },
    onSuccess: async () => {
      toast.dismiss("seza-reader-test");
      await refresh();
      toast.success("Card reader is ready for payments.");
    },
    onError: (error) => {
      toast.dismiss("seza-reader-test");
      toast.error(userFacingError(error, "Card reader test failed."));
    },
  });

  const disconnectReader = useMutation({
    mutationFn: async (reader: StripeTerminalRecord) => {
      await disconnect();
      await updateStripeTerminal("disconnected", reader.id).catch(() => undefined);
      setActiveTerminal("none");
      setActivePaymentProvider(null);
      window.dispatchEvent(new Event("seza:device-config-changed"));
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Card reader disconnected.");
    },
    onError: (error) => toast.error(userFacingError(error, "Could not disconnect the card reader.")),
  });

  const forgetReader = useMutation({
    mutationFn: async (reader: StripeTerminalRecord) => {
      if (reader.status === "active") await disconnect().catch(() => undefined);
      await updateStripeTerminal("remove", reader.id);
      setActiveTerminal("none");
      setActivePaymentProvider(null);
      window.dispatchEvent(new Event("seza:device-config-changed"));
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Card reader removed.");
    },
    onError: (error) => toast.error(userFacingError(error, "Could not remove the card reader.")),
  });

  if (context.isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Checking payment setup…
      </div>
    );
  }

  if (context.isError) {
    return (
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="size-5" /> Card reader</CardTitle>
            <CardDescription>{userFacingError(context.error, "Could not check payment setup.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => context.refetch()}>
              <RefreshCw className="mr-2 size-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stripeReady) {
    return (
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="size-5" /> Card reader</CardTitle>
            <CardDescription>
              Payment setup is completed securely on the SEZA website. After it is finished, come back here to connect the card reader.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => window.open(SEZA_PAYMENT_SETUP_URL, "_blank")}>
              <ExternalLink className="mr-2 size-4" /> Finish setup on SEZA
            </Button>
            <div className="text-xs text-muted-foreground">dashboard.sezapos.com</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="size-5" /> Card reader</CardTitle>
          <CardDescription>Connect the Reader M2 used by this register.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!terminal ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-dashed p-5 text-sm">
                Turn on the Reader M2 and connect it to this register.
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => connectNew.mutate("usb")} disabled={connectNew.isPending}>
                    {connectNew.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wifi className="mr-2 size-4" />}
                    Connect reader
                  </Button>
                  <Button variant="outline" onClick={() => connectNew.mutate("bluetooth")} disabled={connectNew.isPending}>
                    Use Bluetooth instead
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 rounded-lg border p-4">
                <div>
                  <div className="font-medium">{readerLabel(terminal)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {physicallyConnected
                      ? "Connected"
                      : terminal.status === "active"
                        ? "Configured · reader not detected"
                        : "Not connected"} · {connectionMethod(terminal) === "usb" ? "USB" : "Bluetooth"}
                  </div>
                </div>
                {physicallyConnected && <CheckCircle2 className="size-5 text-emerald-600" />}
              </div>

              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => reconnect.mutate(terminal)} disabled={reconnect.isPending}>
                    {reconnect.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wifi className="mr-2 size-4" />}
                    {physicallyConnected ? "Reconnect" : "Connect reader"}
                  </Button>
                  <Button variant="outline" onClick={() => test.mutate(terminal)} disabled={test.isPending}>Test reader</Button>
                  {terminal.status === "active" && (
                    <Button variant="outline" onClick={() => disconnectReader.mutate(terminal)} disabled={disconnectReader.isPending}>
                      <Unplug className="mr-2 size-4" /> Disconnect
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => forgetReader.mutate(terminal)} disabled={forgetReader.isPending}>Forget reader</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
