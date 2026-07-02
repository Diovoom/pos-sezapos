import { supabase } from "@/integrations/supabase/client";

export type SendTransactionalArgs = {
  templateName: string;
  recipientEmail: string;
  templateData?: Record<string, unknown>;
  idempotencyKey?: string;
  replyTo?: string;
};

/**
 * Sends a transactional email through the built-in Lovable Emails queue.
 * Requires a signed-in user — the JWT is used to authorize the send route.
 */
export async function sendTransactionalEmail(args: SendTransactionalArgs): Promise<
  | { ok: true; messageId?: string }
  | { ok: false; error: string }
> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "You must be signed in to send email." };

  try {
    const res = await fetch("/lovable/email/transactional/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        templateName: args.templateName,
        recipientEmail: args.recipientEmail,
        templateData: args.templateData ?? {},
        idempotencyKey: args.idempotencyKey,
        replyTo: args.replyTo,
      }),
    });

    const body = await res.json().catch(() => ({}) as any);
    if (!res.ok) {
      return { ok: false, error: body?.error || `Send failed (${res.status})` };
    }
    return { ok: true, messageId: body?.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
