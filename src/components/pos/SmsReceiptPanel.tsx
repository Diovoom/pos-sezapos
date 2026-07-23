import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AsYouType,
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";
import { sendSms, buildReceiptSms } from "@/lib/sms/send";
import { fmtCurrency } from "@/lib/format";
import { isNativeMode } from "@/lib/native";
import type { ReceiptData } from "./Receipt";

// Curated common countries first, then all others sorted alphabetically.
const PRIORITY: CountryCode[] = ["US", "CA", "GB", "AU", "FR", "DE", "ES", "MX", "BR", "IN", "NG"];

function buildCountryOptions(defaultCountry: CountryCode) {
  const all = getCountries();
  const rest = all.filter((c) => !PRIORITY.includes(c)).sort();
  const dn = new Intl.DisplayNames([typeof navigator !== "undefined" ? navigator.language : "en"], {
    type: "region",
  });
  const build = (c: CountryCode) => ({
    code: c,
    label: `${dn.of(c) ?? c} (+${getCountryCallingCode(c)})`,
  });
  const priority = PRIORITY.filter((c) => all.includes(c));
  const list = [...priority, ...rest].map(build);
  if (!list.find((o) => o.code === defaultCountry)) list.unshift(build(defaultCountry));
  return list;
}

export function SmsReceiptPanel({
  data,
  defaultCountry,
  onSent,
}: {
  data: ReceiptData;
  defaultCountry: CountryCode;
  onSent?: () => void;
}) {
  const [country, setCountry] = useState<CountryCode>(defaultCountry);
  const [raw, setRaw] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const options = useMemo(() => buildCountryOptions(defaultCountry), [defaultCountry]);

  useEffect(() => setCountry(defaultCountry), [defaultCountry]);

  const formatted = useMemo(() => new AsYouType(country).input(raw), [raw, country]);
  const parsed = useMemo(() => parsePhoneNumberFromString(raw, country), [raw, country]);
  const isValid = !!parsed?.isValid();

  const receiptUrl = isNativeMode()
    ? `https://sezapos.com/r/${data.transactionId}`
    : typeof window !== "undefined"
      ? `${window.location.origin}/r/${data.transactionId}`
      : `https://sezapos.com/r/${data.transactionId}`;

  const cur = data.store.currency ?? "USD";
  const sms = buildReceiptSms({
    storeName: data.store.name ?? "our store",
    receiptNumber: data.receiptNumber,
    total: fmtCurrency(data.total, cur),
    paymentMethod: data.paymentMethod.replace("_", " ").toUpperCase(),
    date: new Date(data.createdAt).toLocaleString(),
    link: receiptUrl,
  });

  const handleSend = async () => {
    if (!isValid || !parsed) {
      toast.error("Enter a valid phone number");
      return;
    }
    setSending(true);
    try {
      const e164 = parsed.number; // +E.164
      const res = await sendSms({
        to: e164,
        body: sms,
        saleId: data.transactionId,
        idempotencyKey: `receipt-${data.transactionId}-${e164}`,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSent(true);
      toast.success(
        res.queued
          ? "SMS receipt queued — it will send when the register reconnects"
          : res.alreadySent
            ? "Already sent to this number"
            : "SMS receipt sent",
      );
      onSent?.();
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-center gap-2 text-emerald-600 text-sm px-1">
        <CheckCircle2 className="size-4" /> Receipt saved for {formatted}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label className="text-xs">Customer phone</Label>
      <div className="flex gap-2">
        <Select value={country} onValueChange={(v) => setCountry(v as CountryCode)}>
          <SelectTrigger className="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {options.map((o) => (
              <SelectItem key={o.code} value={o.code}>
                {o.code} +{getCountryCallingCode(o.code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="tel"
          inputMode="tel"
          autoFocus
          placeholder="(555) 123-4567"
          value={formatted}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isValid && !sending) handleSend();
          }}
          disabled={sending}
        />
      </div>
      {raw && !isValid && (
        <p className="text-xs text-destructive">Not a valid number for the selected country.</p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={handleSend} disabled={sending || !isValid}>
          {sending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
          Send SMS
        </Button>
      </div>
    </div>
  );
}
