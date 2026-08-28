import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DoorOpen, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit-log";
import { openCashDrawer, getDevice } from "@/lib/pos/hardware";
import {
  ManagerOverrideDialog,
  type ManagerOverrideResult,
} from "@/components/pos/ManagerOverrideDialog";
import { isOnlineNow } from "@/lib/offline/useOnline";
import { saveOfflineCashMovement } from "@/lib/offline/db";
import { userFacingError } from "@/lib/user-error";

const sb = supabase as any;

export type DrawerReason =
  "make_change" | "count_shift" | "safe_drop" | "manager_request" | "other";

const REASONS: { value: DrawerReason; label: string; description: string }[] = [
  { value: "make_change", label: "Make Change", description: "Break bills for a customer." },
  {
    value: "count_shift",
    label: "Count Shift",
    description: "Begin the end-of-shift count and close.",
  },
  {
    value: "safe_drop",
    label: "Cash Pickup / Safe Drop",
    description: "Remove cash from the drawer to the safe.",
  },
  {
    value: "manager_request",
    label: "Manager Request",
    description: "Requires manager or owner PIN.",
  },
  { value: "other", label: "Other", description: "Requires a note." },
];

export function OpenDrawerDialog({
  open,
  onOpenChange,
  session,
  storeId,
  cashierId,
  onCountShift,
  onSafeDropRecorded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: { id: string; store_id: string } | null;
  storeId?: string;
  cashierId?: string;
  onCountShift?: () => void;
  onSafeDropRecorded?: () => void;
}) {
  const [reason, setReason] = useState<DrawerReason>("make_change");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [managerGate, setManagerGate] = useState(false);
  const [approver, setApprover] = useState<ManagerOverrideResult | null>(null);
  // Per-dialog-open dedupe id so double-submits map to a single logical event.
  const dedupeRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setReason("make_change");
      setNote("");
      setAmount("");
      setApprover(null);
      dedupeRef.current = crypto.randomUUID();
    }
  }, [open]);

  const noSession = !session;
  const needsManager = reason === "manager_request" || noSession;
  const requiresNote = reason === "other";
  const requiresAmount = reason === "safe_drop";
  const amt = Number(amount);
  const amountValid = !requiresAmount || (Number.isFinite(amt) && amt > 0);
  const noteValid = !requiresNote || note.trim().length > 0;
  const canSubmit = amountValid && noteValid && (!needsManager || !!approver);

  const submit = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!canSubmit) throw new Error("Complete the form");
      const targetStore = session?.store_id ?? storeId;
      if (!targetStore) throw new Error("No active store");

      const clientDedupeId = dedupeRef.current;
      const drawer = getDevice("drawer") ?? getDevice("printer");
      const bridgeAvailable = !!drawer;

      // 1. Record the no-sale audit event (immutable).
      await logAudit({
        action: "drawer.no_sale_open",
        entity: "register_session",
        entity_id: session?.id,
        details: {
          reason,
          note: note.trim() || null,
          register_id: session?.id ?? null,
          cashier_id: cashierId ?? null,
          store_id: targetStore,
          status: bridgeAvailable ? "requested" : "unavailable",
          drawer_simulated: !bridgeAvailable,
          safe_drop_amount: requiresAmount ? amt : null,
          approver_id: approver?.manager_id ?? null,
          approver_name: approver?.manager_name ?? null,
          client_dedupe_id: clientDedupeId,
          no_active_shift: noSession,
        },
      });

      // 2. Safe drop → cash_movements row (server enforces uniqueness via user + session + type + notes matching pattern).
      if (requiresAmount && session) {
        if (!cashierId) throw new Error("Cashier identity is unavailable");
        const movementId = crypto.randomUUID();
        const movement = {
          id: movementId,
          idempotency_key: `safe-drop:${clientDedupeId}`,
          register_session_id: session.id,
          store_id: targetStore,
          user_id: cashierId,
          type: "safe_drop" as const,
          amount: Math.round(amt * 100) / 100,
          reason: "Safe drop",
          notes: note.trim() || `dedupe:${clientDedupeId}`,
          local_created_at: new Date().toISOString(),
          status: "pending" as const,
          attempts: 0,
        };
        await saveOfflineCashMovement(movement);
        if (isOnlineNow()) {
          void import("@/lib/offline/sync").then(({ syncNow }) =>
            syncNow().catch((error) => console.warn("[SEZA POS] safe-drop sync deferred", error)),
          );
        }
      }

      // 3. Attempt hardware bridge. No fake success when unavailable.
      let status: "opened" | "unavailable" | "failed" = "unavailable";
      if (bridgeAvailable) {
        try {
          const r = openCashDrawer(`no_sale.${reason}`);
          status = r.simulated ? "unavailable" : "opened";
        } catch {
          status = "failed";
        }
      }

      return { status, bridgeAvailable };
    },
    onSuccess: (r) => {
      if (r.status === "opened") {
        toast.success("Drawer opened");
      } else if (r.status === "failed") {
        toast.error("Cash drawer failed to open");
      } else {
        toast.error(
          "Cash drawer unavailable. Connect a supported register bridge or receipt printer.",
        );
      }
      const isCountShift = reason === "count_shift";
      onOpenChange(false);
      if (requiresAmount) onSafeDropRecorded?.();
      if (isCountShift) onCountShift?.();
    },
    onError: (e) => toast.error(userFacingError(e, "The drawer request could not be recorded.")),
  });

  const handleRequest = () => {
    if (needsManager && !approver) {
      setManagerGate(true);
      return;
    }
    if (!canSubmit) return;
    submit.mutate();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!submit.isPending) onOpenChange(v);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorOpen className="size-5 text-primary" /> Open Cash Drawer
            </DialogTitle>
            <DialogDescription>
              Select a reason. Every opening is logged. Opening the drawer never records a sale.
            </DialogDescription>
          </DialogHeader>

          {noSession && (
            <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs flex items-start gap-2">
              <AlertTriangle className="size-4 mt-0.5 text-warning" />
              <div>No active shift - a manager or owner must approve this opening.</div>
            </div>
          )}

          <RadioGroup
            value={reason}
            onValueChange={(v) => setReason(v as DrawerReason)}
            className="gap-2"
          >
            {REASONS.map((r) => (
              <label
                key={r.value}
                htmlFor={`drawer-reason-${r.value}`}
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent"
              >
                <RadioGroupItem
                  value={r.value}
                  id={`drawer-reason-${r.value}`}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.description}</div>
                </div>
              </label>
            ))}
          </RadioGroup>

          {requiresAmount && (
            <div className="space-y-1">
              <Label>Amount removed ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label>Note {requiresNote && <span className="text-destructive">*</span>}</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                requiresNote ? "Required  -  describe why the drawer needs to open" : "Optional"
              }
            />
          </div>

          {approver && (
            <div className="text-xs text-muted-foreground">
              Approved by {approver.manager_name}.
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submit.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRequest}
              disabled={submit.isPending || !amountValid || !noteValid}
            >
              {submit.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              {needsManager && !approver ? "Request Manager Approval" : "Request Drawer Open"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManagerOverrideDialog
        open={managerGate}
        onOpenChange={setManagerGate}
        action={noSession ? "drawer.open_without_shift" : "drawer.no_sale_open"}
        description={
          noSession
            ? "A manager PIN is required to open the drawer when no shift is active."
            : "A manager PIN is required for this drawer opening."
        }
        details={{ reason, cashier_id: cashierId, register_id: session?.id }}
        onApprove={(r) => {
          setApprover(r);
          setTimeout(() => submit.mutate(), 0);
        }}
      />
    </>
  );
}
