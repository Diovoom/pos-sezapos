// Shell ManagerOverrideDialog.
//
// The production dialog calls the `verifyManagerPin` TanStack server fn,
// which is not reachable from the bundled Android build (no server-fn
// hashes). We POST to the stable public HTTPS endpoint
// /api/public/pos/verify-manager-pin instead, attaching the current
// Supabase bearer token. The server route re-verifies the caller and
// records an audit_log row (granted OR denied) for every attempt.
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, Delete } from "lucide-react";
import { toast } from "sonner";
import { supabase, API_BASE_URL } from "../supabase";

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
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const dots = useMemo(() => Array.from({ length: 6 }, (_, i) => i < pin.length), [pin]);

  const press = (d: string) => { if (pin.length < 6) setPin(pin + d); };
  const del = () => setPin(pin.slice(0, -1));
  const clear = () => setPin("");

  async function submit() {
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { toast.error("Please sign in again."); return; }
      const res = await fetch(`${API_BASE_URL}/api/public/pos/verify-manager-pin`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pin, action, details }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        manager_id?: string; manager_name?: string; error?: string;
      };
      if (!res.ok || !data.manager_id) {
        toast.error(data.error ?? "Approval failed");
        setPin("");
        return;
      }
      onApprove({ manager_id: data.manager_id, manager_name: data.manager_name ?? "Manager" });
      onOpenChange(false);
      setPin("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) setPin(""); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-primary" /> Manager approval required
          </DialogTitle>
          <DialogDescription>
            {description ?? `A manager must approve "${action}".`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="flex gap-2">
            {dots.map((filled, i) => (
              <span
                key={i}
                className={`inline-block size-3 rounded-full border-2 ${filled ? "bg-primary border-primary" : "border-muted-foreground/40"}`}
              />
            ))}
          </div>
          <div className="text-xs text-muted-foreground">Manager PIN</div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <Button key={d} variant="outline" className="h-14 text-xl" onClick={() => press(d)} disabled={busy}>{d}</Button>
          ))}
          <Button variant="ghost" className="h-14" onClick={clear} disabled={busy}>C</Button>
          <Button variant="outline" className="h-14 text-xl" onClick={() => press("0")} disabled={busy}>0</Button>
          <Button variant="ghost" className="h-14" onClick={del} disabled={busy}><Delete className="size-5" /></Button>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || pin.length < 4}>
            {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
