type SezaEmailPayload = {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  idempotencyKey?: string;
};

export class EmailProviderError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "EmailProviderError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function sendSezaEmail(payload: SezaEmailPayload): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailProviderError("RESEND_API_KEY is not configured", 500);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(payload.idempotencyKey ? { "Idempotency-Key": payload.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: payload.from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
    }),
  });

  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!response.ok) {
    const rawRetry = response.headers.get("retry-after");
    const retryAfterSeconds = rawRetry && Number.isFinite(Number(rawRetry)) ? Number(rawRetry) : null;
    throw new EmailProviderError(
      body.message || body.name || `Email provider returned ${response.status}`,
      response.status,
      retryAfterSeconds,
    );
  }
  return { id: body.id };
}
