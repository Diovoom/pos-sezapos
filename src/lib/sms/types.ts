export type SmsProviderId = "twilio" | "vonage" | "messagebird" | "plivo";

export const SMS_PROVIDERS: { id: SmsProviderId; label: string; supported: boolean }[] = [
  { id: "twilio", label: "Twilio", supported: true },
  { id: "vonage", label: "Vonage", supported: true },
  { id: "messagebird", label: "MessageBird", supported: true },
  { id: "plivo", label: "Plivo", supported: true },
];

export type SmsCredentials = {
  // Twilio
  account_sid?: string;
  auth_token?: string;
  auth_id?: string;
  // Common
  from_number?: string;
  api_key?: string;
  api_secret?: string;
};

export type SmsSettings = {
  store_id: string;
  provider: SmsProviderId;
  credentials: SmsCredentials;
  sender_id: string | null;
  default_country: string;
  enabled: boolean;
  last_status: string | null;
  last_checked_at: string | null;
};

export type SmsSendResult =
  | { ok: true; providerMessageId?: string; raw?: unknown }
  | { ok: false; error: string; raw?: unknown };
