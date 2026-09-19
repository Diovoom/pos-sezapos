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
    <Card className="rounded-md shadow-none">
      <CardHeader className="space-y-1 p-3 pb-2">
        <CardTitle className="flex items-start justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Banknote className="size-4" /> Cash drawer
          </span>
          <Badge
            variant="outline"
            className={`h-5 px-1.5 text-[10px] font-medium ${
              configured ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"
            }`}
          >
            {configured ? <CheckCircle2 className="mr-1 size-3" /> : <XCircle className="mr-1 size-3" />}
            {configured ? "Ready" : "Needs printer"}
          </Badge>
        </CardTitle>
        <CardDescription className="text-[11px] leading-4">
          Drawer opens through the connected receipt printer.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2 p-3 pt-0">
        <div className="rounded-md border bg-muted/20 p-2 text-[11px]">
          Active printer: <span className="font-medium text-foreground">{printer.label}</span>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={!configured || busy}
          onClick={async () => {
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
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Banknote className="mr-1.5 size-3.5" />}
          Test drawer
        </Button>
      </CardContent>
    </Card>
  );
}
