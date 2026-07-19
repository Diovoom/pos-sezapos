// Shell stub for ManagerOverrideDialog.
//
// The real dialog calls the `verifyManagerPin` TanStack Start server
// function. That path is not wired for the bundled Android build yet — it
// would need a matching /api/public/pos/verify-manager-pin HTTPS route so
// the shell can POST from the WebView with the current bearer token.
//
// Until that endpoint exists we render a clear message and block approval
// rather than silently allowing sensitive actions. The desktop / web app
// continues to work normally.
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export type ManagerOverrideResult = { manager_id: string; manager_name: string };

export function ManagerOverrideDialog({
  open,
  onOpenChange,
  action,
  description,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: string;
  description?: string;
  details?: Record<string, unknown>;
  onApprove: (r: ManagerOverrideResult) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" /> Manager approval unavailable
          </DialogTitle>
          <DialogDescription>
            {description ?? `Manager approval for "${action}" is not yet available in the Android app.`}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Please complete this action from the web dashboard, or ask a manager to sign in on this
          device to perform it directly.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
