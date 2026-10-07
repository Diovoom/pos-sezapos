import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, RefreshCw, Unplug, Wifi } from "lucide-react";
import { toast } from "sonner";
import { setActiveTerminal } from "@/lib/hardware";
import {
  clearStripeReaderConnectionMethod, connectReader, disconnect,
  getStripeReaderConnectionMethod, getStripeTerminalContext, isReady,
  selectedStripeTerminal, updateStripeTerminal,
} from "@/lib/hardware/terminal-stripe";
import { safeReaderMessage, READER_MESSAGES } from "@/lib/hardware/reader-diagnostics";
import { setActivePaymentProvider } from "@/lib/pos/payment-terminal";
import { deviceControl } from "@/lib/device-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DRIVER = "stripe-m2" as const;
type Action = "usb" | "bluetooth" | "test" | "reconnect" | "forget";

export function PaymentTerminalsPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const actionLock = useRef(false);
  const [status, setStatus] = useState("");
  const context = useQuery({ queryKey: ["stripe-terminal-context"], queryFn: getStripeTerminalContext, retry: false, refetchOnWindowFocus: true });
  const connectivity = useQuery({ queryKey: ["android-connectivity"], queryFn: () => deviceControl.getConnectivityState(), retry: false, staleTime: 5_000 });
  const terminal = context.data && (selectedStripeTerminal(context.data) ?? context.data.terminals.find(item => item.status === "configured"));
  const ready = useQuery({ queryKey: ["stripe-reader-ready", terminal?.id], queryFn: () => isReady(DRIVER), retry: false, refetchInterval: 10_000 });
  const method = terminal ? getStripeReaderConnectionMethod(terminal.id) ?? (terminal.config?.connection_method === "bluetooth" ? "bluetooth" : "usb") : "usb";
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["stripe-terminal-context"] }),
      qc.invalidateQueries({ queryKey: ["stripe-reader-ready"] }),
    ]);
  };
  useEffect(() => {
    const update = () => {
      const error = localStorage.getItem("pos.terminal.lastError");
      if (error) setStatus(safeReaderMessage(error));
      void qc.invalidateQueries({ queryKey: ["stripe-reader-ready"] });
    };
    update();
    window.addEventListener("seza:device-config-changed", update);
    return () => window.removeEventListener("seza:device-config-changed", update);
  }, [qc]);

  const operation = useMutation({
    mutationFn: async (action: Action) => {
      if (action === "forget") {
        // Fetch current state if the initial context request failed.
        const latest = await getStripeTerminalContext();
        const saved = selectedStripeTerminal(latest) ?? latest.terminals.find(item => item.status === "configured");
        await disconnect();
        if (saved) {
          await updateStripeTerminal("remove", saved.id);
          clearStripeReaderConnectionMethod(saved.id);
        }
        localStorage.removeItem("pos.stripe.readerSelection");
        localStorage.removeItem("pos.terminal.lastError");
        setActiveTerminal("none");
        setActivePaymentProvider(null);
        window.dispatchEvent(new Event("seza:device-config-changed"));
        return "Card reader forgotten.";
      }
      const transport = action === "usb" || action === "bluetooth" ? action : method;
      // Explicit transport changes/reconnect release the current native reader.
      if (action !== "test") await disconnect({ preserveSelection: true });
      await connectReader(DRIVER, setStatus, { method: transport });
      if (action === "test" && !await isReady(DRIVER)) throw new Error(READER_MESSAGES.NATIVE);
      return action === "test" ? "Card reader is connected and ready. No payment was taken." : "Card reader connected.";
    },
    onSuccess: message => { setStatus(message); toast.success(message); },
    onError: error => { const message = safeReaderMessage(error); setStatus(message); toast.error(message); },
    onSettled: async () => { try { await refresh(); } finally { actionLock.current = false; } },
  });
  const run = (action: Action) => {
    if (actionLock.current || !canEdit) return;
    actionLock.current = true;
    setStatus(action === "forget" ? "Forgetting card reader…" : "Checking card reader setup…");
    operation.mutate(action);
  };
  const disabled = operation.isPending || !canEdit;
  const contextMessage = context.isError ? safeReaderMessage(context.error)
    : context.data && !context.data.ready ? (context.data.terminalLocationReady ? READER_MESSAGES.MERCHANT_SETUP : READER_MESSAGES.LOCATION)
    : context.isPending ? "Checking store payment status…" : null;

  // Hardware controls remain mounted through loading, context/auth failures and
  // missing reader rows. Only confirmed account readiness produces setup advice.
  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="size-5" /> Card reader</CardTitle>
          <CardDescription>Set up the Stripe Reader M2 on this register. Use a USB data cable or Bluetooth.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{ready.data === true ? `Connected${terminal?.serial ? ` · ${terminal.serial}` : ""}` : terminal ? "Reader configured · Disconnected" : "No card reader connected"}</p>
          {contextMessage && <p role="status" className="text-sm text-muted-foreground">{contextMessage}</p>}
          {status && <p role="status" className="text-sm">{status}</p>}
          {!canEdit && <p className="text-sm text-muted-foreground">Sign in as an owner or manager on this POS to configure the reader.</p>}
          {connectivity.data?.bluetoothSupported === false && <p className="text-sm text-muted-foreground">Bluetooth is unavailable on this register. Use a USB data cable.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button disabled={disabled} onClick={() => run("usb")}><Unplug className="mr-2 size-4" /> Connect with USB</Button>
            <Button variant="outline" disabled={disabled || connectivity.data?.bluetoothSupported === false} onClick={() => run("bluetooth")}><Wifi className="mr-2 size-4" /> Connect with Bluetooth</Button>
            <Button variant="outline" disabled={disabled} onClick={() => run(method)}>{operation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Scan / connect</Button>
            <Button variant="outline" disabled={disabled} onClick={() => run("test")}>Test reader</Button>
            <Button variant="outline" disabled={disabled} onClick={() => run("reconnect")}><RefreshCw className="mr-2 size-4" /> Reconnect</Button>
            <Button variant="ghost" disabled={disabled} onClick={() => run("forget")}>Forget reader</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
