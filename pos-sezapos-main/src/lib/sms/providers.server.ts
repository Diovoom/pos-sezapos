import type { SmsCredentials, SmsProviderId, SmsSendResult } from "./types";

export type SendArgs = {
  to: string; // E.164
  body: string;
  credentials: SmsCredentials;
  senderId?: string | null;
};

async function sendTwilio({ to, body, credentials, senderId }: SendArgs): Promise<SmsSendResult> {
  const sid = credentials.account_sid?.trim();
  const token = credentials.auth_token?.trim();
  const from = (senderId || credentials.from_number || "").trim();
  if (!sid || !token) return { ok: false, error: "Twilio credentials missing (Account SID / Auth Token)" };
  if (!from) return { ok: false, error: "Twilio sender phone number is not configured" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const auth = btoa(`${sid}:${token}`);
  const params = new URLSearchParams({ To: to, From: from, Body: body });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json?.message || `Twilio error ${res.status}`, raw: json };
    }
    return { ok: true, providerMessageId: json?.sid, raw: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

async function notImplemented(name: string): Promise<SmsSendResult> {
  return { ok: false, error: `${name} provider is not yet implemented — please choose Twilio for now.` };
}

export async function sendViaProvider(
  provider: SmsProviderId,
  args: SendArgs,
): Promise<SmsSendResult> {
  switch (provider) {
    case "twilio":
      return sendTwilio(args);
    case "vonage":
      return notImplemented("Vonage");
    case "messagebird":
      return notImplemented("MessageBird");
    case "plivo":
      return notImplemented("Plivo");
    default:
      return { ok: false, error: `Unknown SMS provider: ${provider}` };
  }
}
