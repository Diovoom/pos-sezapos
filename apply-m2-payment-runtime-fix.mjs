import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${rel}`);
  return { p, text: fs.readFileSync(p, "utf8") };
}

function write(p, text) {
  fs.writeFileSync(p, text, "utf8");
}

function replaceOnce(text, oldText, newText, label) {
  if (text.includes(newText)) return text;
  if (!text.includes(oldText)) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  return text.replace(oldText, newText);
}

// -----------------------------------------------------------------------------
// 1) Client Stripe payment flow: stop infinite "Creating secure..." hangs.
// -----------------------------------------------------------------------------
{
  const rel = "src/lib/hardware/terminal-stripe.ts";
  const { p, text: original } = read(rel);
  let text = original;

  const oldFn = `async function createPaymentIntent(
  amountCents: number,
  currency: string,
  description?: string,
  idempotencyId?: string,
) {
  const result = await callApi<{ id: string; client_secret: string }>(
    "/api/public/pos/stripe-terminal/payment-intent",
    { amount: amountCents, currency, description, idempotencyId },
  );
  if (!result.client_secret) throw new Error("Stripe Terminal PaymentIntent was not created");
  return result;
}`;

  const newFn = `async function createPaymentIntent(
  amountCents: number,
  currency: string,
  description?: string,
  idempotencyId?: string,
) {
  const startedAt = Date.now();
  const request = callApi<{ id: string; client_secret: string }>(
    "/api/public/pos/stripe-terminal/payment-intent",
    { amount: amountCents, currency, description, idempotencyId },
  );

  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => {
      reject(
        new Error(
          \`[SEZA-RAW-PAYMENT-INTENT-TIMEOUT] endpoint=/api/public/pos/stripe-terminal/payment-intent waitedMs=\${Date.now() - startedAt} amountCents=\${amountCents} currency=\${currency}\`,
        ),
      );
    }, 20_000);
  });

  const result = await Promise.race([request, timeout]);
  if (!result.client_secret) {
    throw new Error(
      \`[SEZA-RAW-PAYMENT-INTENT] missing client_secret response=\${JSON.stringify(result)}\`,
    );
  }
  return result;
}`;

  text = replaceOnce(text, oldFn, newFn, "terminal-stripe createPaymentIntent");

  // The temporary reader raw-diagnostic patch renamed the error helper.
  if (text.includes("function rawTerminalError(") && text.includes("friendlyTerminalError(error, \"Stripe Terminal payment failed. Please try again.\")")) {
    text = text.replace(
      'friendlyTerminalError(error, "Stripe Terminal payment failed. Please try again.")',
      'rawTerminalError(error, "PAYMENT_FLOW")',
    );
  }

  write(p, text);
  console.log(`patched ${rel}`);
}

// -----------------------------------------------------------------------------
// 2) PaymentDialog: forward real payment state to the customer display.
// -----------------------------------------------------------------------------
{
  const rel = "src/components/pos/PaymentDialog.tsx";
  const { p, text: original } = read(rel);
  let text = original;

  text = replaceOnce(
    text,
    `  onComplete: (p: CompletedPayment) => void;
  // When true`,
    `  onComplete: (p: CompletedPayment) => void;
  onPaymentEvent?: (event: PaymentEvent) => void;
  // When true`,
    "PaymentDialog Props.onPaymentEvent",
  );

  text = replaceOnce(
    text,
    `  onComplete,
  bypassCancelApproval = false,`,
    `  onComplete,
  onPaymentEvent,
  bypassCancelApproval = false,`,
    "PaymentDialog destructure onPaymentEvent",
  );

  text = replaceOnce(
    text,
    `              onComplete={onComplete}
              onCancel={requestCancel}
              onCancelNoApproval={() => onOpenChange(false)}`,
    `              onComplete={onComplete}
              onPaymentEvent={onPaymentEvent}
              onCancel={requestCancel}
              onCancelNoApproval={() => onOpenChange(false)}`,
    "PaymentDialog pass onPaymentEvent",
  );

  text = replaceOnce(
    text,
    `  onComplete,
  onCancel,
  onCancelNoApproval,
}: {
  method: PaymentMethod;
  total: number;
  currency: string;
  onComplete: (p: CompletedPayment) => void;
  onCancel: () => void;`,
    `  onComplete,
  onPaymentEvent,
  onCancel,
  onCancelNoApproval,
}: {
  method: PaymentMethod;
  total: number;
  currency: string;
  onComplete: (p: CompletedPayment) => void;
  onPaymentEvent?: (event: PaymentEvent) => void;
  onCancel: () => void;`,
    "TerminalPanel onPaymentEvent prop",
  );

  text = replaceOnce(
    text,
    `        (e) => {
          setEvent(e);
          void logPaymentAttempt({`,
    `        (e) => {
          setEvent(e);
          onPaymentEvent?.(e);
          void logPaymentAttempt({`,
    "TerminalPanel forward payment event",
  );

  write(p, text);
  console.log(`patched ${rel}`);
}

// -----------------------------------------------------------------------------
// 3) POS route: map payment events to the native customer-facing display.
// -----------------------------------------------------------------------------
{
  const rel = "src/routes/_pos/pos.tsx";
  const { p, text: original } = read(rel);
  let text = original;

  text = replaceOnce(
    text,
    `        onComplete={(p) => finalize.mutate(p)}
        // Owners/managers/admins already possess payment-cancel authority.`,
    `        onComplete={(p) => finalize.mutate(p)}
        onPaymentEvent={(event) => {
          if (
            event.status === "payment_requested" ||
            event.status === "connecting" ||
            event.status === "processing" ||
            event.status === "card_presented"
          ) {
            setDisplayStatus({
              phase: "processing",
              message:
                event.status === "payment_requested"
                  ? "Preparing card payment…"
                  : event.message || "Preparing card payment…",
            });
            return;
          }

          if (event.status === "waiting_for_customer") {
            setDisplayStatus({
              phase: "processing",
              message: "Tap, insert, or swipe your card on the Stripe Reader M2.",
            });
            return;
          }

          if (
            event.status === "declined" ||
            event.status === "error" ||
            event.status === "network_error" ||
            event.status === "timeout"
          ) {
            setDisplayStatus({
              phase: "declined",
              message: event.message || "Card payment could not be completed.",
            });
            return;
          }

          if (event.status === "cancelled") {
            setDisplayStatus({
              phase: "cancelled",
              message: "Payment was cancelled at the register.",
            });
            return;
          }

          if (event.status === "approved") {
            setDisplayStatus({
              phase: "processing",
              message: "Payment approved. Finishing sale…",
            });
          }
        }}
        // Owners/managers/admins already possess payment-cancel authority.`,
    "POS PaymentDialog customer-display payment state",
  );

  write(p, text);
  console.log(`patched ${rel}`);
}

// -----------------------------------------------------------------------------
// 4) Server payment-intent endpoint: never let non-critical audit logging block
//    the card-present flow, and return a stage-specific timeout.
// -----------------------------------------------------------------------------
{
  const rel = "src/routes/api/public/pos/stripe-terminal/payment-intent.ts";
  const { p, text: original } = read(rel);
  let text = original;

  const oldCreate = `          const stripe = createTerminalStripeClient(merchant.environment);
          const intent = await stripe.paymentIntents.create(
            {
              amount,
              currency,
              payment_method_types: ["card_present"],
              capture_method: "automatic",
              description,
              metadata: {
                seza_store_id: merchant.storeId,
                seza_cashier_id: merchant.userId,
                seza_terminal_id: merchant.terminalId ?? "",
                seza_channel: "android_pos",
              },
            },
            {
              stripeAccount: merchant.stripeAccountId,
              ...(idempotencyId ? { idempotencyKey: \`seza-pos-\${idempotencyId}\` } : {}),
            },
          );`;

  const newCreate = `          const stripe = createTerminalStripeClient(merchant.environment);
          const intentRequest = stripe.paymentIntents.create(
            {
              amount,
              currency,
              payment_method_types: ["card_present"],
              capture_method: "automatic",
              description,
              metadata: {
                seza_store_id: merchant.storeId,
                seza_cashier_id: merchant.userId,
                seza_terminal_id: merchant.terminalId ?? "",
                seza_channel: "android_pos",
              },
            },
            {
              stripeAccount: merchant.stripeAccountId,
              ...(idempotencyId ? { idempotencyKey: \`seza-pos-\${idempotencyId}\` } : {}),
            },
          );

          const intentTimeout = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("[stripe-terminal/payment-intent] Stripe PaymentIntent creation timed out after 15 seconds")),
              15_000,
            );
          });

          const intent = await Promise.race([intentRequest, intentTimeout]);`;

  text = replaceOnce(text, oldCreate, newCreate, "server Stripe PaymentIntent timeout");

  const oldAudit = `          await (supabaseAdmin.from as any)("payment_attempts").insert({
            store_id: merchant.storeId,
            attempted_by: merchant.userId,
            provider: "stripe_terminal",
            method: "card",
            amount: amount / 100,
            currency,
            status: "created",
            message: "Stripe Terminal PaymentIntent created",
            reference: intent.id,
          });

          return json({ id: intent.id, client_secret: intent.client_secret });`;

  const newAudit = `          const auditWrite = (supabaseAdmin.from as any)("payment_attempts").insert({
            store_id: merchant.storeId,
            attempted_by: merchant.userId,
            provider: "stripe_terminal",
            method: "card",
            amount: amount / 100,
            currency,
            status: "created",
            message: "Stripe Terminal PaymentIntent created",
            reference: intent.id,
          });

          // Audit logging is useful, but must never hold the customer's card flow.
          await Promise.race([
            Promise.resolve(auditWrite).catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, 1_000)),
          ]);

          return json({ id: intent.id, client_secret: intent.client_secret });`;

  text = replaceOnce(text, oldAudit, newAudit, "non-blocking payment audit");

  write(p, text);
  console.log(`patched ${rel}`);
}

console.log("");
console.log("M2 payment runtime patch applied.");
console.log("Next:");
console.log("1) Deploy the website/backend to Cloudflare (payment-intent endpoint changed).");
console.log("2) Rebuild/sync/install the Android APK (customer display + client timeout changed).");
