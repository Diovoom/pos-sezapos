import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Unplug, Wifi } from "lucide-react";
import { toast } from "sonner";
import { setActiveTerminal } from "@/lib/hardware";
import {
  clearStripeReaderConnectionMethod, connectReader, disconnect,
  getStripeReaderConnectionMethod, getStripeTerminalContext, getStripeReaderSetup, isReady,
  selectedStripeTerminal, updateStripeTerminal,
} from "@/lib/hardware/terminal-stripe";
import { safeReaderMessage, READER_MESSAGES } from "@/lib/hardware/reader-diagnostics";
import { setActivePaymentProvider } from "@/lib/pos/payment-terminal";
import { deviceControl } from "@/lib/device-control";
import { Button } from "@/components/ui/button";
import { READER_SETUP, readerSetupUrl } from "@/lib/hardware/reader-setup";
import { useMe } from "@/hooks/useMe";
import { getPairing } from "../lib/pairing";

const DRIVER = "stripe-m2" as const;
type Action = "usb" | "bluetooth" | "test" | "reconnect" | "forget";

export function PaymentTerminalsPanel({ canEdit }: { canEdit: boolean }) {
  const me = useMe();
  const pairing = getPairing();
  const scope = `${pairing?.storeId ?? "unpaired"}:${pairing?.deviceId ?? ""}:${me.data?.user.id ?? ""}`;
  return <ScopedReaderPanel key={scope} canEdit={canEdit} scope={scope} paired={Boolean(pairing)} storeId={pairing?.storeId} />;
}

function ScopedReaderPanel({ canEdit, scope, paired, storeId }: { canEdit: boolean; scope: string; paired: boolean; storeId?: string }) {
  const qc = useQueryClient();
  const actionLock = useRef(false);
  const [status, setStatus] = useState("");
  const context = useQuery({ queryKey: ["stripe-terminal-context", scope], enabled: paired, queryFn: () => getStripeTerminalContext(), staleTime: 10_000, retry: false, refetchOnWindowFocus: true });
  const connectivity = useQuery({ queryKey: ["android-connectivity"], queryFn: () => deviceControl.getConnectivityState(), retry: false, staleTime: 5_000 });
  const terminal = context.data && (selectedStripeTerminal(context.data) ?? context.data.terminals.find(item => item.status === "configured"));
  const ready = useQuery({ queryKey: ["stripe-reader-ready", scope, terminal?.id], enabled: paired, queryFn: () => isReady(DRIVER), retry: false, refetchInterval: 2_000 });
  const setup = useQuery({ queryKey: ["stripe-reader-setup", scope], queryFn: getStripeReaderSetup,
    enabled: paired && canEdit && ready.isSuccess && ready.data !== true && !actionLock.current,
    retry: false, staleTime: 10_000, refetchInterval: 30_000, refetchOnWindowFocus: true,
  });
  const setupStep = setup.isError ? "retry" : setup.data?.step;
  const instruction = setupStep ? READER_SETUP[setupStep] : null;
  const ownerUrl = setupStep ? readerSetupUrl(setupStep, storeId) : null;
  const setupBlocked = Boolean(setupStep && setupStep !== "reader");
  useEffect(() => {
    let disposed = false;
    const resume = async () => {
      if (disposed || !paired) return;
      const connected = await isReady(DRIVER);
      if (disposed) return;
      void context.refetch(); void ready.refetch();
      if (canEdit && !connected) void setup.refetch();
    };
    // Android external browser return doesn't always trigger window.focus.
    const listener = import("@capacitor/app").then(({ App }) => App.addListener("appStateChange", ({ isActive }) => { if (isActive) void resume(); }));
    window.addEventListener("focus", resume);
    return () => { disposed = true; window.removeEventListener("focus", resume); void listener.then(handle => handle.remove()).catch(() => undefined); };
  }, []);
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
      setStatus(error ? safeReaderMessage(error) : "");
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
      if (!terminal) {
        const checked = await getStripeReaderSetup();
        qc.setQueryData(["stripe-reader-setup", scope], checked);
        if (checked.step !== "reader") return READER_SETUP[checked.step].message;
      }
      const transport = action === "usb" || action === "bluetooth" ? action : method;
      // Explicit transport changes/reconnect release the current native reader.
      if (action !== "test") await disconnect({ preserveSelection: true });
      await connectReader(DRIVER, setStatus, { method: transport });
      if (action === "test" && !await isReady(DRIVER)) throw new Error(READER_MESSAGES.NATIVE);
      return action === "test" ? "Card reader is connected and ready. No payment was taken." : "Card reader connected.";
    },
    onSuccess: message => { setStatus(message); },
    onError: error => {
      const message = safeReaderMessage(error); setStatus(message); toast.error(message);
      if (["MERCHANT_SETUP", "LOCATION"].includes(String((error as { code?: string })?.code))) void setup.refetch();
    },
    onSettled: async () => { try { await refresh(); } finally { actionLock.current = false; } },
  });
  const run = (action: Action) => {
    if (actionLock.current || !canEdit) return;
    actionLock.current = true;
    setStatus(action === "forget" ? "Forgetting card reader…" : "Checking card reader setup…");
    operation.mutate(action);
  };
  const disabled = operation.isPending || !canEdit || !paired;
  const contextMessage = context.isError ? safeReaderMessage(context.error) : null;
  const connected = ready.data === true;
  const configured = Boolean(terminal?.serial);
  const waiting = !connected && !configured && canEdit && paired && !setupStep;

  return (
    <section className="max-w-2xl space-y-4" aria-label="Card reader">
      <h2 className="text-base font-semibold">Card reader</h2>
      <p className="text-sm" role="status">{connected ? `Connected${terminal?.serial ? ` · ${terminal.serial}` : ""}` : configured ? "Reader configured · Disconnected" : "No card reader connected"}</p>
      {!paired ? <p className="text-sm">Pair this register with your store before connecting a card reader.</p> : !canEdit ?
        <p className="text-sm text-muted-foreground">Sign in as an owner or manager on this POS to configure the reader.</p> : !connected && (
        <div className="space-y-3">
          {waiting ? <p className="text-sm">Checking store payment setup…</p> : instruction && (!configured || setupBlocked) ? <>
            <p className="text-sm">{instruction.message}</p>
            {setupBlocked && (ownerUrl ? <Button asChild><a href={ownerUrl} target="_blank" rel="noreferrer">{instruction.action}</a></Button> :
              <Button variant="outline" disabled={setup.isFetching} onClick={() => { setStatus(""); void setup.refetch(); }}>{instruction.action}</Button>)}
          </> : configured ? <p className="text-sm text-muted-foreground">SEZA reconnects this reader automatically. Keep it powered and connected.</p> : null}
          {!setupBlocked && <p className="text-sm text-muted-foreground">Use a USB data and charging cable. Bluetooth is also available.</p>}
          {!setupBlocked && !status && contextMessage && <p role="status" className="text-sm">{contextMessage}</p>}
          {!setupBlocked && status && <p role="status" className="text-sm">{status}</p>}
        </div>
      )}
      {connected && status && <p role="status" className="text-sm">{status}</p>}
      <div className="flex flex-wrap gap-2">
        {!connected && <>
          <Button disabled={disabled || waiting || setupBlocked} onClick={() => run("usb")}><Unplug className="mr-2 size-4" /> Connect with USB</Button>
          <Button variant="outline" disabled={disabled || waiting || setupBlocked || connectivity.data?.bluetoothSupported === false} onClick={() => run("bluetooth")}><Wifi className="mr-2 size-4" /> Connect with Bluetooth</Button>
        </>}
        {(configured || connected) && <>
          <Button variant="outline" disabled={disabled} onClick={() => run("test")}>Test reader</Button>
          <Button variant="outline" disabled={disabled} onClick={() => run("reconnect")}><RefreshCw className="mr-2 size-4" /> Reconnect</Button>
          <Button variant="ghost" disabled={disabled} onClick={() => run("forget")}>Forget reader</Button>
        </>}
        {operation.isPending && <Loader2 aria-label="Connecting reader" className="size-4 animate-spin" />}
      </div>
    </section>
  );
}
