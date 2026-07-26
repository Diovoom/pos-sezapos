import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { SMS_PROVIDERS, type SmsProviderId, type SmsSettings } from "@/lib/sms/types";
import { sendSms } from "@/lib/sms/send";
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

const COMMON: CountryCode[] = ["US", "CA", "GB", "AU", "FR", "DE", "ES", "MX", "BR", "IN", "NG"];

function statusBadge(enabled: boolean, status: string | null) {
  if (!enabled)
    return (
      <Badge variant="outline" className="border-neutral-400 text-neutral-500">
        Not configured
      </Badge>
    );
  if (status === "connected")
    return (
      <Badge variant="outline" className="bg-success/15 text-success border-success/30">
        Connected
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
        Connection failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
      Not tested
    </Badge>
  );
}

export function SmsSettingsPanel() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["sms-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("sms_settings").select("*").maybeSingle();
      return (data ?? null) as SmsSettings | null;
    },
  });

  const [provider, setProvider] = useState<SmsProviderId>("twilio");
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [senderId, setSenderId] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [defaultCountry, setDefaultCountry] = useState<CountryCode>("US");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("");

  useEffect(() => {
    if (!settings) return;
    setProvider((settings.provider as SmsProviderId) ?? "twilio");
    const c = settings.credentials ?? {};
    setAccountSid(c.account_sid ?? "");
    setAuthToken(c.auth_token ?? "");
    setApiKey(c.api_key ?? "");
    setApiSecret(c.api_secret ?? "");
    setFromNumber(c.from_number ?? "");
    setSenderId(settings.sender_id ?? "");
    setDefaultCountry((settings.default_country as CountryCode) ?? "US");
    setEnabled(!!settings.enabled);
  }, [settings]);

  const countryOptions = useMemo(() => {
    const all = getCountries();
    const rest = all.filter((c) => !COMMON.includes(c)).sort();
    const dn = new Intl.DisplayNames(
      [typeof navigator !== "undefined" ? navigator.language : "en"],
      {
        type: "region",
      },
    );
    return [...COMMON.filter((c) => all.includes(c)), ...rest].map((c) => ({
      code: c,
      label: `${dn.of(c) ?? c} (+${getCountryCallingCode(c)})`,
    }));
  }, []);

  const supported = SMS_PROVIDERS.find((p) => p.id === provider)?.supported ?? false;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: me } = await supabase.from("profiles").select("store_id").maybeSingle();
      if (!me?.store_id) {
        toast.error("No store linked to your account");
        return;
      }
      const credentials =
        provider === "twilio"
          ? {
              account_sid: accountSid.trim(),
              auth_token: authToken.trim(),
              from_number: fromNumber.trim(),
            }
          : {
              api_key: apiKey.trim(),
              api_secret: apiSecret.trim(),
              from_number: fromNumber.trim(),
            };

      const { error } = await supabase.from("sms_settings").upsert(
        {
          store_id: me.store_id,
          provider,
          credentials,
          sender_id: senderId.trim() || null,
          default_country: defaultCountry,
          enabled,
        },
        { onConflict: "store_id" },
      );
      if (error) throw error;
      toast.success("SMS settings saved");
      qc.invalidateQueries({ queryKey: ["sms-settings"] });
      qc.invalidateQueries({ queryKey: ["sms-settings-default-country"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const parsed = parsePhoneNumberFromString(testPhone, defaultCountry);
    if (!parsed?.isValid()) {
      toast.error("Enter a valid test phone number");
      return;
    }
    setTesting(true);
    try {
      const res = await sendSms({
        to: parsed.number,
        body: "SEZA POS test message — your SMS provider is connected.",
        test: true,
      });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        toast.success("Test SMS sent");
      }
      qc.invalidateQueries({ queryKey: ["sms-settings"] });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>SMS Setup</CardTitle>
            <CardDescription>
              Send text-message receipts through your own SMS provider account.
            </CardDescription>
          </div>
          {statusBadge(enabled, settings?.last_status ?? null)}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as SmsProviderId)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMS_PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Default country</Label>
            <Select
              value={defaultCountry}
              onValueChange={(v) => setDefaultCountry(v as CountryCode)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {countryOptions.map((o) => (
                  <SelectItem key={o.code} value={o.code}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {provider === "twilio" ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Twilio Account SID</Label>
              <Input
                value={accountSid}
                onChange={(e) => setAccountSid(e.target.value)}
                placeholder="AC…"
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-xs">Twilio Auth Token</Label>
              <Input
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Kept private"
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-xs">From number (E.164, e.g. +15551234567)</Label>
              <Input
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                placeholder="+15551234567"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Find these in your Twilio Console dashboard. The From number must be an SMS-capable
              Twilio phone number on your account.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">API Key</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-xs">API Secret</Label>
              <Input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-xs">Sender number (E.164)</Label>
              <Input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the production credentials from your{" "}
              {SMS_PROVIDERS.find((p) => p.id === provider)?.label} account. For Plivo, use Auth ID
              as the API Key and Auth Token as the API Secret.
            </p>
          </div>
        )}

        <div>
          <Label className="text-xs">Sender ID / Business name (optional)</Label>
          <Input
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
            placeholder="Overrides From number where supported"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="font-medium">Enable SMS receipts</div>
            <p className="text-xs text-muted-foreground">Cashiers can send SMS after each sale.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin mr-2" />}
            Save configuration
          </Button>
        </div>

        <div className="border-t pt-4 space-y-2">
          <Label className="text-xs">Send a test SMS</Label>
          <div className="flex gap-2">
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(new AsYouType(defaultCountry).input(e.target.value))}
              placeholder="Recipient phone"
              disabled={testing}
            />
            <Button variant="outline" onClick={handleTest} disabled={testing || !supported}>
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Send className="size-4 mr-2" /> Test
                </>
              )}
            </Button>
          </div>
          {settings?.last_checked_at && (
            <p className="text-xs text-muted-foreground">
              Last tested {new Date(settings.last_checked_at).toLocaleString()}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
