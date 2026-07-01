import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifyManagerOverride } from "@/lib/overrides.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export type ManagerOverrideResult = { manager_id: string; manager_name: string };

export function ManagerOverrideDialog({
  open,
  onOpenChange,
  action,
  description,
  details,
  onApprove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: string;
  description?: string;
  details?: Record<string, unknown>;
  onApprove: (r: ManagerOverrideResult) => void;
}) {
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const verify = useServerFn(verifyManagerOverride);

  const submit = async () => {
    if (!/^\d{6}$/.test(empId)) return toast.error("Enter a 6-digit employee ID");
    if (!/^\d{4,8}$/.test(pin)) return toast.error("Enter the manager's PIN");
    setBusy(true);
    try {
      const r = await verify({
        data: { employee_id: empId, pin, action, details: { ...(details ?? {}), reason } },
      });
      toast.success(`Approved by ${r.manager_name}`);
      onApprove(r);
      onOpenChange(false);
      setEmpId(""); setPin(""); setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Override denied");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Manager approval required
          </DialogTitle>
          <DialogDescription>{description ?? `Authorize: ${action}`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Manager employee ID</Label>
            <Input
              autoFocus inputMode="numeric" maxLength={6} value={empId}
              onChange={(e) => setEmpId(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6 digits"
            />
          </div>
          <div className="space-y-1">
            <Label>Manager PIN</Label>
            <Input
              type="password" inputMode="numeric" maxLength={8} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="PIN"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="space-y-1">
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Context for audit log" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin mr-2" />}Approve
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
