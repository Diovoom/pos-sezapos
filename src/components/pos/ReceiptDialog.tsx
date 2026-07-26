import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, Mail, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import { Receipt, type ReceiptData } from "./Receipt";
import { SmsReceiptPanel } from "./SmsReceiptPanel";
import { toast } from "sonner";
import { sendTransactionalEmail } from "@/lib/email/send";
import { supabase } from "@/integrations/supabase/client";
import type { CountryCode } from "libphonenumber-js";
import { isNativeMode } from "@/lib/native";
import { autoPrintOnComplete, reprintReceipt, openDrawerAfterCashSale, openDrawerAfterCashRefund } from "@/lib/hardware/native-receipt";


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ReceiptDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: ReceiptData | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<"sent" | "queued" | null>(null);

  // Fetch SMS default country for the store when needed (owner/manager can read).
  const { data: smsSettings } = useQuery({
    queryKey: ["sms-settings-default-country"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sms_settings")
        .select("default_country, enabled")
        .maybeSingle();
      return data as { default_country: string; enabled: boolean } | null;
    },
    staleTime: 5 * 60_000,
  });
  const defaultCountry = ((smsSettings?.default_country as CountryCode) || "US") as CountryCode;

  // Reset panel state when dialog opens for a new receipt
  useEffect(() => {
    if (open) {
      setEmailOpen(false);
      setSmsOpen(false);
      setEmail("");
      setSending(false);
      setDeliveryStatus(null);
    }
  }, [open, data?.transactionId]);

  // Native APK only: auto-print and (cash) auto-open drawer once per sale.
  // Never throws — hardware failure must never fail a completed sale.
  useEffect(() => {
    if (!open || !data || !isNativeMode()) return;
    let cancelled = false;
    (async () => {
      const p = await autoPrintOnComplete(data);
      if (cancelled) return;
      if (!p.ok && p.reason === "driver_error") toast.error("Printer error — receipt not printed");
      const d = data.refund
        ? await openDrawerAfterCashRefund(data)
        : await openDrawerAfterCashSale(data);
      if (cancelled) return;
      if (!d.ok && d.reason === "driver_error") toast.error("Cash drawer failed to open");
    })().catch(() => { /* safe-fail */ });
    return () => { cancelled = true; };
  }, [open, data?.transactionId]);


  const handlePrint = () => {
    if (!ref.current) return;

    const html = ref.current.outerHTML;
    // Reuse the same compiled application styles in the print window so the
    // physical print preview matches the receipt shown inside the POS dialog.
    const appStyles = Array.from(
      document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'),
    )
      .map((node) => node.outerHTML)
      .join("\n");
    const w = window.open("", "_blank", "width=380,height=700");

    if (!w) {
      toast.error("Popup blocked. Allow popups to print.");
      return;
    }

    w.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt</title>
          ${appStyles}
          <style>
            @page { size: 80mm auto; margin: 0; }
            html, body {
              width: 80mm !important;
              min-height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
            }
            body {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
                "Liberation Mono", "Courier New", monospace;
            }
            .receipt-print {
              box-sizing: border-box !important;
              width: 80mm !important;
              max-width: 80mm !important;
              min-height: 0 !important;
              height: auto !important;
              margin: 0 !important;
              padding: 3mm 4mm 2mm !important;
              color: #000 !important;
              background: #fff !important;
              overflow: visible !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .receipt-print, .receipt-print * { box-sizing: border-box !important; }
          </style>
        </head>
        <body>
          ${html}
          <script>
            window.addEventListener("load", () => {
              window.focus();
              window.print();
            });
            window.addEventListener("afterprint", () => {
              try {
                window.opener?.localStorage.setItem("pos.hw.printer.status", "connected");
                window.opener?.localStorage.setItem("pos.hw.printer.lastSeen", String(Date.now()));
                // RP80 cash drawers connect through the printer's RJ-11 port.
                window.opener?.localStorage.setItem("pos.hw.drawer.status", "connected");
                window.opener?.localStorage.setItem("pos.hw.drawer.lastSeen", String(Date.now()));
                window.opener?.dispatchEvent(new Event("seza-hardware-status"));
              } catch {}
              window.close();
            });
          <\/script>
        </body>
      </html>
    `);
    w.document.close();
  };

  const handleEmailSend = async () => {
    if (!data) return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSending(true);
    try {
      const res = await sendTransactionalEmail({
        templateName: "receipt",
        recipientEmail: trimmed,
        idempotencyKey: `receipt-${data.transactionId}-${trimmed.toLowerCase()}`,
        templateData: {
          storeName: data.store.name ?? undefined,
          storeAddress: data.store.address ?? undefined,
          storePhone: data.store.phone ?? undefined,
          storeEmail: data.store.email ?? undefined,
          currency: data.store.currency ?? "USD",
          receiptNumber: data.receiptNumber,
          transactionId: data.transactionId,
          cashierName: data.cashierName,
          customerName: data.customerName,
          createdAt:
            typeof data.createdAt === "string"
              ? data.createdAt
              : data.createdAt.toISOString(),
          lines: data.lines,
          subtotal: data.subtotal,
          tax: data.tax,
          discount: data.discount ?? 0,
          total: data.total,
          paymentMethod: data.paymentMethod,
          cardBrand: data.cardBrand,
          last4: data.last4,
          amountTendered: data.amountTendered,
          changeDue: data.changeDue,
          returnPolicy: data.store.return_policy ?? undefined,
          thankYou: data.store.receipt_footer ?? undefined,
        },
      });
      if (!res.ok) {
        toast.error(`Failed to send receipt: ${res.error}`);
        return;
      }
      setDeliveryStatus(res.queued ? "queued" : "sent");
      toast.success(res.queued ? "Receipt queued — it will send when the register reconnects" : "Receipt sent successfully");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle>Receipt</DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"
            aria-label="Close without receipt"
          >
            No receipt
          </button>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto bg-muted/40 py-4">
          {data && <Receipt ref={ref} data={data} />}
        </div>

        {emailOpen && (
          <div className="p-4 border-t bg-background space-y-3">
            {deliveryStatus ? (
              <div className="flex items-center gap-2 text-emerald-600 text-sm">
                <CheckCircle2 className="size-4" />
                {deliveryStatus === "queued" ? "Queued for" : "Sent to"} {email}
              </div>
            ) : (
              <>
                <Label htmlFor="receipt-email" className="text-xs">
                  Customer email
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="receipt-email"
                    type="email"
                    autoFocus
                    placeholder="customer@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEmailSend();
                    }}
                    disabled={sending}
                  />
                  <Button onClick={handleEmailSend} disabled={sending || !email}>
                    {sending ? <Loader2 className="size-4 animate-spin" /> : "Send"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {smsOpen && data && (
          <div className="p-4 border-t bg-background">
            <SmsReceiptPanel data={data} defaultCountry={defaultCountry} />
          </div>
        )}

        <div className="p-4 border-t bg-surface/40 grid grid-cols-3 gap-2">
          <Button
            variant={emailOpen ? "default" : "outline"}
            onClick={() => {
              setEmailOpen((v) => !v);
              setSmsOpen(false);
              setDeliveryStatus(null);
            }}
          >
            <Mail className="size-4" /> Email
          </Button>
          <Button
            variant={smsOpen ? "default" : "outline"}
            onClick={() => {
              setSmsOpen((v) => !v);
              setEmailOpen(false);
            }}
          >
            <MessageSquare className="size-4" /> SMS
          </Button>
          <Button
            onClick={async () => {
              if (!isNativeMode()) return handlePrint();
              if (!data) return;
              const r = await reprintReceipt(data);
              if (r.ok) toast.success("Reprint sent to printer");
              else if (r.reason === "no_driver") toast.error("No printer configured");
              else if (r.reason === "not_ready") toast.error("Printer not connected");
              else toast.error("Printer error");
            }}
          >
            <Printer className="size-4" /> {isNativeMode() && data ? "Reprint" : "Print"}
          </Button>

        </div>
      </DialogContent>
    </Dialog>
  );
}
