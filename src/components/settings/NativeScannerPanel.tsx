import { useEffect, useRef, useState } from "react";
import { Barcode, CheckCircle2, Keyboard, Play, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const STATUS_KEY = "pos.hw.scanner.status";
const LAST_KEY = "pos.hw.scanner.lastBarcode";

export function NativeScannerPanel() {
  const [testing, setTesting] = useState(false);
  const [lastBarcode, setLastBarcode] = useState(() => localStorage.getItem(LAST_KEY) ?? "");
  const buffer = useRef("");
  const lastKeyAt = useRef(0);

  useEffect(() => {
    if (!testing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      if (now - lastKeyAt.current > 120) buffer.current = "";
      lastKeyAt.current = now;
      if (event.key === "Enter") {
        const value = buffer.current.trim();
        buffer.current = "";
        if (value.length >= 3) {
          setLastBarcode(value);
          localStorage.setItem(LAST_KEY, value);
          localStorage.setItem(STATUS_KEY, "connected");
          localStorage.setItem("pos.hw.scanner.lastSeen", String(Date.now()));
          window.dispatchEvent(new Event("seza-hardware-status"));
          setTesting(false);
          toast.success(`Scanner connected. Barcode ${value} received.`);
        }
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        buffer.current += event.key;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [testing]);

  const connected = localStorage.getItem(STATUS_KEY) === "connected";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Barcode className="size-5" /> Barcode scanner</span>
          <Badge variant="outline" className={connected ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"}>
            {connected ? <CheckCircle2 className="mr-1 size-3" /> : <XCircle className="mr-1 size-3" />}
            {connected ? "Connected" : "Not tested"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Works with USB or Bluetooth scanners that act like a keyboard. Scan a barcode ending with Enter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-surface/40 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium"><Keyboard className="size-4" /> HID keyboard scanner</div>
          <p className="mt-1 text-muted-foreground">Last barcode: <span className="font-mono text-foreground">{lastBarcode || "None"}</span></p>
        </div>
        <Button onClick={() => { buffer.current = ""; setTesting(true); }} disabled={testing}>
          <Play className="mr-2 size-4" /> {testing ? "Scan a barcode now…" : "Test scanner"}
        </Button>
        {testing ? <p className="text-sm font-medium text-primary">Scan any product barcode. Do not click another field.</p> : null}
      </CardContent>
    </Card>
  );
}
