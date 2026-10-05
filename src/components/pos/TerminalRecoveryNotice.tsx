import { useEffect, useRef, useState } from "react";
import { recoverStripeCheckout } from "@/lib/hardware/terminal-stripe";
import { Button } from "@/components/ui/button";

type Recovery = Awaited<ReturnType<typeof recoverStripeCheckout>>["checkouts"][number];

const DEFINITELY_UNPAID = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "canceled",
  "unprepared",
]);

function isDefinitelyUnpaid(row: Recovery) {
  return DEFINITELY_UNPAID.has(row.status);
}

async function loadVisibleRecoveryRows() {
  const result = await recoverStripeCheckout();
  const unpaid = result.checkouts.filter(isDefinitelyUnpaid);
  if (!unpaid.length) return result.checkouts;

  // A confirmed cancel/never-started checkout is not a recovery emergency.
  // Clear those durable checkout locks automatically so the cashier does not
  // get a scary banner after intentionally backing out of a card payment.
  await Promise.all(
    unpaid.map((row) =>
      recoverStripeCheckout("abandon", row.checkoutId).catch(() => undefined),
    ),
  );
  return (await recoverStripeCheckout()).checkouts;
}

function recoveryMessage(row: Recovery) {
  if (row.status === "saved") {
    return `Earlier payment saved as receipt ${row.sale?.receipt_number ?? row.sale?.id}. Do not ring it again.`;
  }
  const status = row.status.replaceAll("_", " ");
  return `An earlier card checkout still needs verification (${status}). Do not charge it again.`;
}

export function TerminalRecoveryNotice({
  enabled,
  actorId,
  storeId,
  onResolved,
}: {
  enabled: boolean;
  actorId?: string | null;
  storeId?: string | null;
  onResolved: () => void;
}) {
  const [rows, setRows] = useState<Recovery[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setRows([]);
    setError("");
    if (!enabled || !actorId || !storeId) return;
    let alive = true,
      running = false;
    const refresh = async () => {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        const checkouts = await loadVisibleRecoveryRows();
        if (alive) {
          setRows(checkouts);
          setError("");
        }
      } catch {
        if (alive)
          setError(
            "Payment recovery could not connect. Check recovery before retrying a card payment.",
          );
      } finally {
        running = false;
      }
    };
    void refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      generation.current++;
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [enabled, actorId, storeId]);

  const run = async (action: "recover" | "acknowledge" | "abandon", row: Recovery) => {
    if (busy) return;
    const started = generation.current;
    setBusy(true);
    try {
      const result = await recoverStripeCheckout(action, row.checkoutId);
      if (started !== generation.current) return;
      setError("");
      if (action === "recover") {
        const recovered = result.checkouts[0];
        if (recovered && isDefinitelyUnpaid(recovered)) {
          await recoverStripeCheckout("abandon", recovered.checkoutId);
          if (started !== generation.current) return;
          setRows(await loadVisibleRecoveryRows());
        } else {
          setRows(result.checkouts);
        }
      } else {
        setRows([]);
        if (action === "acknowledge") onResolved();
      }
    } catch {
      if (started === generation.current)
        setError(
          "Payment still needs review. Do not charge again. Reconnect and retry recovery, or contact support.",
        );
    } finally {
      setBusy(false);
    }
  };
  if (!enabled || (!rows.length && !error)) return null;
  return (
    <div
      role="status"
      className="m-3 rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"
    >
      {error && <p>{error}</p>}
      {rows.map((row) => (
        <div key={row.checkoutId}>
          <p>{recoveryMessage(row)}</p>
          <div className="mt-2 flex gap-2">
            <Button disabled={busy} onClick={() => void run("recover", row)}>
              {busy ? "Checking…" : "Check payment"}
            </Button>
            {row.status === "saved" && (
              <Button disabled={busy} onClick={() => void run("acknowledge", row)}>
                Acknowledge saved sale and clear cart
              </Button>
            )}

          </div>
        </div>
      ))}
    </div>
  );
}
