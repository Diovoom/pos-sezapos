// Android shell ManagerOverrideDialog — REAL implementation.
//
// The production dialog calls `verifyManagerPin` via TanStack server fn,
// which is not reachable from the bundled Android build (no server-fn
// hashes shipped). This file is aliased into every production import of
// `@/components/pos/ManagerOverrideDialog` by vite.capacitor.config.ts, so
// refunds, voids, discounts, drawer opens, safe drops, shift closes, and
// age-verification overrides all route through here on Android.
//
// The dialog POSTs to the stable public HTTPS endpoint
// `/api/public/pos/verify-manager-pin`, attaching the current Supabase
// bearer token. The server route re-verifies the caller, matches only
// active manager/owner/admin PINs scoped to the caller's store, and
// writes the authoritative audit_log row (granted OR denied) for every
// attempt — the client MUST NOT duplicate that audit entry.
//
// Security invariants (do not regress):
//   - PIN lives only in React state; never in localStorage/sessionStorage,
//     logs, analytics, or the dialog title/description.
//   - No client-side role check ever grants approval — the server decides.
//   - Dialog closure is NOT approval; onApprove fires only after a 200 OK
//     that includes a manager_id.
//   - Result is single-use per action: the caller decides what to do with
//     it; we do not cache or persist it.
import { nativeFetch, userSafeNetworkMessage } from "../lib/nativeHttp";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, Delete, WifiOff } from "lucide-react";
import { supabase, API_BASE_URL } from "../supabase";
import { getPairing } from "../lib/pairing";
import { readMeta } from "@/lib/offline/db";
import { isOnlineNow } from "@/lib/offline/useOnline";
import { userFacingError } from "@/lib/errors/user-facing";

export type ManagerOverrideResult = { manager_id: string; manager_name: string };

// Client-side rate limit: min gap between submissions + hard cap on
// consecutive failures per dialog session. Server-side rate limiting on
// the endpoint remains authoritative; this only smooths the UX and
// blocks obvious tap-storms.
const MIN_SUBMIT_GAP_MS = 800;
const MAX_ATTEMPTS = 6;
const LOCKOUT_MS = 15_000;

type UiError =
  | { kind: "invalid" }        // wrong / unauthorized PIN
  | { kind: "offline" }        // native/cloud connectivity unavailable
  | { kind: "network" }        // fetch threw
  | { kind: "rate" }           // 429 / client cap
  | { kind: "session" }        // 401 caller unauthorized
  | { kind: "server"; msg?: string };

function messageFor(err: UiError): string {
  switch (err.kind) {
    case "invalid":
      // Deliberately generic — never reveal which manager owns a PIN or
      // whether a manager exists.
      return "Incorrect or unauthorized manager PIN.";
    case "offline":
      return "You are offline. Manager approval requires a secure connection.";
    case "network":
      return "Network error. Check your connection and try again.";
    case "rate":
      return "Too many attempts. Wait a moment before trying again.";
    case "session":
      return "Your session has expired. Sign in again to request approval.";
    case "server":
      return userFacingError(err.msg, "Approval could not be completed. Try again.");
  }
}

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
  const [error, setError] = useState<UiError | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const lastSubmitRef = useRef(0);
  const inflightRef = useRef(false);
  const approvedRef = useRef(false);

  const dots = useMemo(
    () => Array.from({ length: 6 }, (_, i) => i < pin.length),
    [pin.length],
  );

  // Reset every time the dialog opens for a fresh action. Never persist
  // PIN, attempts, or errors across openings.
  useEffect(() => {
    if (open) {
      setPin("");
      setError(null);
      setAttempts(0);
      setLockedUntil(0);
      lastSubmitRef.current = 0;
      inflightRef.current = false;
      approvedRef.current = false;
    }
  }, [open]);

  const lockedRemainingMs = Math.max(0, lockedUntil - Date.now());
  const locked = lockedRemainingMs > 0;

  const submit = useCallback(async (pinValue: string) => {
    if (inflightRef.current || approvedRef.current) return;
    const now = Date.now();
    if (now - lastSubmitRef.current < MIN_SUBMIT_GAP_MS) return;
    if (locked) { setError({ kind: "rate" }); return; }
    if (!/^\d{4,8}$/.test(pinValue)) return;

    if (!isOnlineNow()) {
      setError({ kind: "offline" });
      setPin("");
      return;
    }

    lastSubmitRef.current = now;
    inflightRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
      const token = sess.session?.access_token;
      const pairing = getPairing();
      const cachedCallerId = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
      if (!token && (!pairing || !cachedCallerId)) {
        setError({ kind: "session" });
        setPin("");
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      let res: Response;
      try {
        res = await nativeFetch(`${API_BASE_URL}/api/public/pos/verify-manager-pin`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            pin: pinValue,
            action,
            details: details ?? {},
            ...(pairing
              ? {
                  store_id: pairing.storeId,
                  device_id: pairing.deviceId,
                  device_secret: pairing.deviceSecret,
                  caller_id: cachedCallerId,
                }
              : {}),
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      let data: { manager_id?: string; manager_name?: string; error?: string } = {};
      try { data = await res.json(); } catch { /* non-JSON */ }

      if (res.status === 401) {
        // Endpoint returns 401 for both "no bearer" and "wrong PIN".
        // Treat missing manager_id + our own bearer-attached call as
        // wrong PIN; keep session-expired mapping only when the message
        // explicitly says so.
        const msg = (data.error ?? "").toLowerCase();
        if (msg === "unauthorized") {
          setError({ kind: "session" });
        } else {
          setError({ kind: "invalid" });
          const next = attempts + 1;
          setAttempts(next);
          if (next >= MAX_ATTEMPTS) {
            setLockedUntil(Date.now() + LOCKOUT_MS);
          }
        }
        setPin("");
        return;
      }

      if (res.status === 429) {
        setError({ kind: "rate" });
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setPin("");
        return;
      }

      if (!res.ok || !data.manager_id) {
        setError({ kind: "server", msg: data.error });
        setPin("");
        return;
      }

      // Success — mark approved BEFORE closing so any rapid re-submits
      // from a queued tap are ignored.
      approvedRef.current = true;
      onApprove({
        manager_id: data.manager_id,
        manager_name: data.manager_name ?? "Manager",
      });
      onOpenChange(false);
      setPin("");
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setError({ kind: aborted ? "network" : "network" });
      setPin("");
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  }, [action, details, attempts, locked, onApprove, onOpenChange]);

  // Auto-submit as soon as a full 6-digit PIN is entered. 4/5-digit PINs
  // fall back to the manual Approve button (endpoint accepts 4-8).
  useEffect(() => {
    if (pin.length === 6 && !busy && !locked && !approvedRef.current) {
      void submit(pin);
    }
  }, [pin, busy, locked, submit]);

  const press = (d: string) => {
    if (busy || locked) return;
    setError(null);
    if (pin.length < 6) setPin(pin + d);
  };
  const del = () => { if (!busy) { setError(null); setPin(pin.slice(0, -1)); } };
  const clear = () => { if (!busy) { setError(null); setPin(""); } };

  const handleOpenChange = (v: boolean) => {
    // Block dismissal while a verification request is in flight so a
    // stray backdrop tap can never orphan the approval.
    if (busy) return;
    onOpenChange(v);
    if (!v) setPin("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onInteractOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-primary" /> Manager approval required
          </DialogTitle>
          <DialogDescription>
            {description ?? `A manager must approve "${action}".`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="flex gap-2" aria-label="Manager PIN entry">
            {dots.map((filled, i) => (
              <span
                key={i}
                className={`inline-block size-3 rounded-full border-2 transition-colors ${
                  filled ? "bg-primary border-primary" : "border-muted-foreground/40"
                }`}
              />
            ))}
          </div>
          <div className="text-xs text-muted-foreground">Manager PIN</div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 text-sm text-destructive text-center px-2"
            >
              {error.kind === "offline" && <WifiOff className="size-4" />}
              <span>{messageFor(error)}</span>
            </div>
          )}
          {locked && !error && (
            <div role="alert" className="text-sm text-destructive text-center">
              Too many attempts. Try again in {Math.ceil(lockedRemainingMs / 1000)}s.
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <Button
              key={d}
              variant="outline"
              className="h-14 text-xl"
              onClick={() => press(d)}
              disabled={busy || locked}
            >
              {d}
            </Button>
          ))}
          <Button variant="ghost" className="h-14" onClick={clear} disabled={busy || locked || pin.length === 0}>
            C
          </Button>
          <Button
            variant="outline"
            className="h-14 text-xl"
            onClick={() => press("0")}
            disabled={busy || locked}
          >
            0
          </Button>
          <Button variant="ghost" className="h-14" onClick={del} disabled={busy || locked || pin.length === 0}>
            <Delete className="size-5" />
          </Button>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit(pin)}
            disabled={busy || locked || pin.length < 4}
          >
            {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
