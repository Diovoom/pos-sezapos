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
    <Card className="rounded-md shadow-none">
      <CardHeader className="space-y-1 p-3 pb-2">
        <CardTitle className="flex items-start justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Barcode className="size-4" /> Barcode scanner
          </span>
          <Badge
            variant="outline"
            className={`h-5 px-1.5 text-[10px] font-medium ${
              connected ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"
            }`}
          >
            {connected ? <CheckCircle2 className="mr-1 size-3" /> : <XCircle className="mr-1 size-3" />}
            {connected ? "Ready" : "Not tested"}
          </Badge>
        </CardTitle>
        <CardDescription className="text-[11px] leading-4">
          USB or Bluetooth HID scanner that sends Enter after a barcode.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2 p-3 pt-0">
        <div className="rounded-md border bg-muted/20 p-2 text-[11px]">
          <div className="flex items-center gap-1.5 font-medium">
            <Keyboard className="size-3.5" /> HID scanner
          </div>
          <p className="mt-1 text-muted-foreground">
            Last barcode: <span className="font-mono text-foreground">{lastBarcode || "None"}</span>
          </p>
        </div>

        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            buffer.current = "";
            setTesting(true);
          }}
          disabled={testing}
        >
          <Play className="mr-1.5 size-3.5" /> {testing ? "Scan now…" : "Test scanner"}
        </Button>
        {testing ? (
          <p className="text-[11px] font-medium text-primary">Scan any product barcode now.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
