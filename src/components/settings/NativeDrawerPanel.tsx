import { useState } from "react";
import { Banknote, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActivePrinter } from "@/lib/hardware";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";

export function NativeDrawerPanel() {
  const [busy, setBusy] = useState(false);
  const printer = getActivePrinter();
  const configured = printer.id !== "none";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Banknote className="size-5" /> Cash drawer</span>
          <Badge variant="outline" className={configured ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"}>
            {configured ? <CheckCircle2 className="mr-1 size-3" /> : <XCircle className="mr-1 size-3" />}
            {configured ? "Printer controlled" : "Printer required"}
          </Badge>
        </CardTitle>
        <CardDescription>
          The cash drawer opens through the connected receipt printer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Active printer: <span className="font-medium text-foreground">{printer.label}</span></p>
        <Button disabled={!configured || busy} onClick={async () => {
          setBusy(true);
          try {
            if (!(await printer.isReady())) throw new Error("The selected printer is not ready");
            await printer.kickDrawer(200);
            localStorage.setItem("pos.hw.drawer.status", "connected");
            localStorage.setItem("pos.hw.drawer.lastSeen", String(Date.now()));
            window.dispatchEvent(new Event("seza-hardware-status"));
            toast.success("Cash drawer opened");
          } catch (error) {
            toast.error(userFacingError(error, "Could not open the cash drawer"));
          } finally { setBusy(false); }
        }}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Banknote className="mr-2 size-4" />}
          Test open drawer
        </Button>
      </CardContent>
    </Card>
  );
}
