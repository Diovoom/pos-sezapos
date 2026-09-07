import { sendSezaEmail } from "@/lib/email/provider.server";

const DEFAULT_FROM = "SEZA POS <sezaofficial@sezapos.com>";
const DEFAULT_SUPPORT = "support@sezapos.com";

export function supportInbox(): string {
  return process.env.SEZA_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT;
}

export function supportFrom(): string {
  return process.env.SEZA_EMAIL_FROM?.trim() || DEFAULT_FROM;
}

export async function sendSupportEmailBestEffort(input: {
  to?: string | null;
  subject: string;
  text: string;
  replyTo?: string | null;
  idempotencyKey?: string;
}): Promise<boolean> {
  const to = input.to?.trim();
  if (!to || !to.includes("@") || to.startsWith("website-chat:")) return false;
  try {
    await sendSezaEmail({
      to,
      from: supportFrom(),
      subject: input.subject.slice(0, 180),
      text: input.text,
      replyTo: input.replyTo?.trim() || supportInbox(),
      idempotencyKey: input.idempotencyKey,
    });
    return true;
  } catch (error) {
    console.error("Support notification email failed", {
      to_domain: to.split("@")[1] || "unknown",
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
