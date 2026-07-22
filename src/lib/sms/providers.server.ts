import type { SmsCredentials, SmsProviderId, SmsSendResult } from "./types";

export type SendArgs = {
  to: string;
  body: string;
  credentials: SmsCredentials;
  senderId?: string | null;
};

function basicAuth(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

async function readJson(res: Response) {
  return res.json().catch(() => ({}));
}

async function sendTwilio({ to, body, credentials, senderId }: SendArgs): Promise<SmsSendResult> {
  const sid = credentials.account_sid?.trim();
  const token = credentials.auth_token?.trim();
  const from = (senderId || credentials.from_number || "").trim();
  if (!sid || !token) return { ok: false, error: "Twilio credentials missing (Account SID / Auth Token)" };
  if (!from) return { ok: false, error: "Twilio sender phone number is not configured" };

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(sid, token),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    const json: any = await readJson(res);
    return res.ok
      ? { ok: true, providerMessageId: json?.sid, raw: json }
      : { ok: false, error: json?.message || `Twilio error ${res.status}`, raw: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

async function sendVonage({ to, body, credentials, senderId }: SendArgs): Promise<SmsSendResult> {
  const apiKey = credentials.api_key?.trim();
  const apiSecret = credentials.api_secret?.trim();
  const from = (senderId || credentials.from_number || "SEZA POS").trim();
  if (!apiKey || !apiSecret) return { ok: false, error: "Vonage API key and secret are required" };

  try {
    const res = await fetch("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_key: apiKey, api_secret: apiSecret, to, from, text: body }).toString(),
    });
    const json: any = await readJson(res);
    const message = json?.messages?.[0];
    if (!res.ok || message?.status !== "0") {
      return { ok: false, error: message?.["error-text"] || `Vonage error ${res.status}`, raw: json };
    }
    return { ok: true, providerMessageId: message?.["message-id"], raw: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

async function sendMessageBird({ to, body, credentials, senderId }: SendArgs): Promise<SmsSendResult> {
  const accessKey = credentials.api_key?.trim();
  const originator = (senderId || credentials.from_number || "SEZA POS").trim();
  if (!accessKey) return { ok: false, error: "MessageBird access key is required" };

  try {
    const res = await fetch("https://rest.messagebird.com/messages", {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${accessKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ originator, recipients: to, body }).toString(),
    });
    const json: any = await readJson(res);
    return res.ok
      ? { ok: true, providerMessageId: json?.id, raw: json }
      : { ok: false, error: json?.errors?.[0]?.description || `MessageBird error ${res.status}`, raw: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

async function sendPlivo({ to, body, credentials, senderId }: SendArgs): Promise<SmsSendResult> {
  const authId = (credentials.auth_id || credentials.api_key)?.trim();
  const authToken = (credentials.auth_token || credentials.api_secret)?.trim();
  const src = (senderId || credentials.from_number || "").trim();
  if (!authId || !authToken) return { ok: false, error: "Plivo Auth ID and Auth Token are required" };
  if (!src) return { ok: false, error: "Plivo sender number is required" };

  try {
    const res = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Message/`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(authId, authToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ src, dst: to, text: body }),
    });
    const json: any = await readJson(res);
    return res.ok
      ? { ok: true, providerMessageId: json?.message_uuid?.[0], raw: json }
      : { ok: false, error: json?.error || `Plivo error ${res.status}`, raw: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function sendViaProvider(provider: SmsProviderId, args: SendArgs): Promise<SmsSendResult> {
  switch (provider) {
    case "twilio": return sendTwilio(args);
    case "vonage": return sendVonage(args);
    case "messagebird": return sendMessageBird(args);
    case "plivo": return sendPlivo(args);
    default: return { ok: false, error: `Unknown SMS provider: ${provider}` };
  }
}
