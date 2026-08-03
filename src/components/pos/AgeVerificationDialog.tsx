import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ScanLine,
  CheckCircle2,
  Calendar,
  Camera,
  KeyRound,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";
import {
  ManagerOverrideDialog,
  type ManagerOverrideResult,
} from "@/components/pos/ManagerOverrideDialog";
import {
  parseIdBarcode,
  evaluateId,
  evaluateManualDob,
  maskDocumentNumber,
  maskFullName,
  type AgeVerificationSettings,
  type ParsedID,
  type VerificationOutcome,
} from "@/lib/age-verification";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-log";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type RestrictedItem = {
  product_id: string;
  name: string;
  min_age: number;
  category?: string | null;
};

export type SuccessfulVerification = {
  method: "id_scan" | "manual" | "override";
  minAge: number;
  ageYears: number;
  masked: {
    name?: string;
    doc?: string;
    expires?: string;
    dob?: string;
  };
};

export function AgeVerificationDialog({
  open,
  onOpenChange,
  items,
  settings,
  storeId,
  onVerified,
  onRemoveRestricted,
  onCancelSale,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: RestrictedItem[];
  settings: AgeVerificationSettings;
  storeId?: string | null;
  onVerified: (v: SuccessfulVerification) => void;
  onRemoveRestricted: () => void;
  onCancelSale: () => void;
}) {
  const requiredAge = items.reduce((m, i) => Math.max(m, i.min_age || 21), 0);
  const [mode, setMode] = useState<"choose" | "scan" | "manual" | "result">("choose");
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);
  const [parsed, setParsed] = useState<ParsedID | null>(null);
  const [manualDob, setManualDob] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    (window as any).__SEZA_ID_SCAN_ACTIVE__ = true;
    return () => { (window as any).__SEZA_ID_SCAN_ACTIVE__ = false; };
  }, [open]);
  const [managerOpen, setManagerOpen] = useState(false);
  const [manualManagerOk, setManualManagerOk] = useState<ManagerOverrideResult | null>(null);
  const [manualMode, setManualMode] = useState<"manual" | "override">("manual");
  const [saving, setSaving] = useState(false);
  const wedgeRef = useRef<HTMLInputElement>(null);
  const [wedge, setWedge] = useState("");
  const seenCodesRef = useRef<Set<string>>(new Set());
  const [scanNote, setScanNote] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode("choose");
      setOutcome(null);
      setParsed(null);
      setManualDob("");
      setManualManagerOk(null);
      setWedge("");
      setScanNote(null);
      seenCodesRef.current = new Set();
    }
  }, [open]);

  // Keyboard-wedge USB barcode scanner: focus a hidden input while dialog is up
  useEffect(() => {
    if (!open || (mode !== "choose" && mode !== "scan")) return;
    const focus = () => wedgeRef.current?.focus();
    const t = setTimeout(focus, 80);
    window.addEventListener("pointerdown", focus);
    return () => { clearTimeout(t); window.removeEventListener("pointerdown", focus); };
  }, [open, mode]);

  const handleParsed = (raw: string) => {
    const p = parseIdBarcode(raw);
    setParsed(p);
    if (p.format === "unknown") {
      toast.error("Unrecognized ID barcode format. Try again or use manual entry.");
      return;
    }
    const r = evaluateId(p, requiredAge);
    if (r.ok) {
      void finalize({
        method: "id_scan",
        minAge: requiredAge,
        ageYears: r.ageYears,
        parsed: p,
      });
    } else {
      setOutcome(r);
      setMode("result");
      void logEvent({
        method: "id_scan",
        result:
          r.reason === "underage"
            ? "underage"
            : r.reason === "expired_id"
              ? "expired_id"
              : "rejected",
        parsed: p,
      });
    }
  };

  const handleWedgeSubmit = () => {
    const v = wedge.trim();
    if (!v) return;
    setWedge("");
    handleParsed(v);
  };

  const finalize = async (data: {
    method: "id_scan" | "manual" | "override";
    minAge: number;
    ageYears: number;
    parsed?: ParsedID;
    dobIso?: string;
    manager?: ManagerOverrideResult | null;
  }) => {
    setSaving(true);
    try {
      await logEvent({
        method: data.method,
        result: "approved",
        parsed: data.parsed,
        dobIso: data.dobIso,
        manager: data.manager,
      });
      const masked = data.parsed
        ? {
            name: maskFullName(data.parsed.fullName),
            doc: maskDocumentNumber(data.parsed.documentNumber),
            expires: data.parsed.expires?.toISOString().slice(0, 10),
            dob: data.parsed.dob?.toISOString().slice(0, 10),
          }
        : { dob: data.dobIso };
      onVerified({
        method: data.method,
        minAge: data.minAge,
        ageYears: data.ageYears,
        masked,
      });
      setOutcome({ ok: true, ageYears: data.ageYears });
      setMode("result");
    } finally {
      setSaving(false);
    }
  };

  const logEvent = async (e: {
    method: "id_scan" | "manual" | "override";
    result: "approved" | "rejected" | "expired_id" | "underage";
    parsed?: ParsedID;
    dobIso?: string;
    manager?: ManagerOverrideResult | null;
  }) => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        store_id: storeId ?? null,
        cashier_id: u.user?.id ?? null,
        cashier_email: u.user?.email ?? null,
        product_ids: items.map((i) => i.product_id),
        min_age: requiredAge,
        method: e.method,
        result: e.result,
        customer_dob: e.parsed?.dob?.toISOString().slice(0, 10) ?? e.dobIso ?? null,
        id_expires_on: e.parsed?.expires?.toISOString().slice(0, 10) ?? null,
        id_document_last4: maskDocumentNumber(e.parsed?.documentNumber) ?? null,
        id_full_name_masked: maskFullName(e.parsed?.fullName) ?? null,
        manager_override_id: e.manager?.manager_id ?? null,
        override_reason: (e.manager as unknown as { reason?: string })?.reason ?? null,
        raw_meta: { format: e.parsed?.format ?? "manual" },
      };

      await (supabase.from as any)("age_verifications").insert(payload);
      void logAudit({
        action: "override.granted",
        entity: "age_verification",
        details: {
          method: e.method,
          result: e.result,
          min_age: requiredAge,
          items: items.length,
          manager_override: !!e.manager,
        },
      });
    } catch (err) {
      // best-effort; do not block checkout

      console.warn("[age-verification] failed to log", err);
    }
  };

  const submitManual = async () => {
    if (!manualDob) return toast.error("Enter a date of birth");
    // Owners and managers who are currently signed in are trusted to enter
    // a DOB manually without a second manager PIN prompt.
    let trustedManager = manualManagerOk;
    if (settings.requireManagerForManual && !trustedManager) {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          const { data: roleRows } = await (supabase as any)
            .from("user_roles")
            .select("role")
            .eq("user_id", u.user.id);
          const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
          if (roles.some((r) => r === "owner" || r === "admin" || r === "manager")) {
            trustedManager = { manager_id: u.user.id, manager_name: u.user.email ?? "manager" };
            setManualManagerOk(trustedManager);
          }
        }
      } catch {
        /* fall through to prompt */
      }
    }
    if (settings.requireManagerForManual && !trustedManager) {
      setManagerOpen(true);
      return;
    }
    const r = evaluateManualDob(manualDob, requiredAge);
    if (r.ok) {
      await finalize({
        method: trustedManager ? "override" : "manual",
        minAge: requiredAge,
        ageYears: r.ageYears,
        dobIso: manualDob,
        manager: trustedManager,
      });
    } else {
      setOutcome(r);
      setMode("result");
      await logEvent({
        method: "manual",
        result: r.reason === "underage" ? "underage" : "rejected",
        dobIso: manualDob,
        manager: trustedManager,
      });
    }
  };

  const submitOverride = (m: ManagerOverrideResult) => {
    void finalize({
      method: "override",
      minAge: requiredAge,
      ageYears: requiredAge, // override attests eligibility
      manager: m,
    });
  };

  useEffect(() => {
    if (mode !== "result" || !outcome) return;
    const delay = outcome.ok ? 1_000 : 3_000;
    const timer = window.setTimeout(() => {
      if (outcome.ok) {
        onOpenChange(false);
      } else {
        setMode("choose");
        setOutcome(null);
        setParsed(null);
        setWedge("");
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [mode, outcome, onOpenChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <div className="border-b bg-background p-6">
            <DialogHeader className="text-left">
              <DialogTitle className="text-2xl">Age verification required</DialogTitle>
              <DialogDescription className="mt-1">
                This sale cannot continue until the customer's age is verified.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-warning/10 border-warning/40 text-warning">
                Minimum age: {requiredAge}+
              </Badge>
              {items.slice(0, 4).map((i) => (
                <Badge key={i.product_id} variant="outline" className="bg-card">
                  {i.name}
                </Badge>
              ))}
              {items.length > 4 && (
                <Badge variant="outline" className="bg-card">
                  +{items.length - 4} more
                </Badge>
              )}
            </div>
          </div>

          <div className="p-6">
            {mode === "choose" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ActionCard
                    icon={ScanLine}
                    title="Scan government ID"
                    subtitle="USB scanner or 2D barcode reader"
                    onClick={() => {
                      setMode("scan");
                      setScanNote("ID scanner ready. Scan the barcode on the back of the ID.");
                      window.setTimeout(() => wedgeRef.current?.focus(), 60);
                    }}
                    accent
                  />
                  <ActionCard
                    icon={Camera}
                    title="Use camera"
                    subtitle="Scan the barcode on the back of the ID"
                    onClick={() => setScannerOpen(true)}
                  />
                  {settings.allowManualEntry && (
                    <ActionCard
                      icon={Calendar}
                      title="Enter date of birth"
                      subtitle={
                        settings.requireManagerForManual
                          ? "Manager approval required"
                          : "Manual entry"
                      }
                      onClick={() => {
                        setManualMode("manual");
                        setMode("manual");
                      }}
                    />
                  )}
                  <ActionCard
                    icon={Trash2}
                    title="Remove restricted item"
                    subtitle="Continue without age-restricted products"
                    onClick={() => {
                      onRemoveRestricted();
                      onOpenChange(false);
                    }}
                    danger
                  />
                </div>

                {/* Hidden wedge target for USB HID scanners */}
                <div className="mt-6 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-primary animate-pulse" />
                    Ready - scan an ID with your USB scanner now, or choose an option above.
                  </div>
                  {settings.allowManualEntry && (
                    <button
                      type="button"
                      className="underline hover:text-foreground"
                      onClick={() => {
                        setManualMode("manual");
                        setMode("manual");
                      }}
                    >
                      Camera scan isn't working?
                    </button>
                  )}
                </div>
                <Input
                  ref={wedgeRef}
                  value={wedge}
                  onChange={(e) => setWedge(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleWedgeSubmit();
                    }
                  }}
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                />

                <div className="mt-6 flex justify-between border-t pt-4">
                  <Button variant="ghost" onClick={onCancelSale}>
                    <X className="size-4 mr-1" /> Cancel sale
                  </Button>
                </div>
              </>
            )}

            {mode === "scan" && (
              <div className="space-y-5 text-center">
                <div className="mx-auto grid size-20 place-items-center rounded-full bg-primary/10 text-primary">
                  <ScanLine className="size-10" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Scanner ready</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Scan the barcode on the back of the government ID. Product scanning is paused until this ID check finishes.</p>
                </div>
                <Input
                  ref={wedgeRef}
                  value={wedge}
                  onChange={(e) => setWedge(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleWedgeSubmit(); } }}
                  className="mx-auto max-w-xl font-mono"
                  autoComplete="off"
                  aria-label="Government ID scanner input"
                />
                {scanNote ? <p className="text-sm text-primary">{scanNote}</p> : null}
                <div className="flex justify-center gap-2">
                  <Button variant="outline" onClick={() => { setMode("choose"); setWedge(""); }}>Back</Button>
                  <Button onClick={handleWedgeSubmit} disabled={!wedge.trim()}>Verify scanned ID</Button>
                </div>
              </div>
            )}

            {mode === "manual" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Date of birth</Label>
                  <Input
                    type="date"
                    value={manualDob}
                    onChange={(e) => setManualDob(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="text-lg h-12"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Age at today's date will be calculated automatically.
                  </p>
                </div>
                {settings.requireManagerForManual && !manualManagerOk && (
                  <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm flex items-center gap-2">
                    <KeyRound className="size-4 text-warning" />
                    Manager approval will be requested when you submit.
                  </div>
                )}
                {manualManagerOk && (
                  <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-success" />
                    Approved by {manualManagerOk.manager_name}
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t">
                  <Button variant="ghost" onClick={() => setMode("choose")}>
                    Back
                  </Button>
                  <Button onClick={submitManual} disabled={saving || !manualDob}>
                    {saving && <Loader2 className="size-4 animate-spin mr-2" />}
                    Verify age
                  </Button>
                </div>
              </div>
            )}

            {mode === "result" && outcome && (
              <ResultView
                outcome={outcome}
                parsed={parsed}
                requiredAge={requiredAge}
                onRetry={() => {
                  setMode("choose");
                  setOutcome(null);
                  setParsed(null);
                }}
                onRemove={() => {
                  onRemoveRestricted();
                  onOpenChange(false);
                }}
                onCancel={onCancelSale}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={(v) => {
          setScannerOpen(v);
          if (!v) setScanNote(null);
        }}
        title="Scan ID barcode"
        formats={["PDF_417", "QR_CODE", "DATA_MATRIX"]}
        hint="Align the barcode on the back of the ID with the red line. Hold steady 4–6 inches away."
        note={scanNote}
        onDetected={(code) => {
          const p = parseIdBarcode(code);
          if (p.format === "unknown") {
            if (!seenCodesRef.current.has(code)) {
              seenCodesRef.current.add(code);
              toast.error("Barcode read, but not a recognized government ID.");
              setScanNote(
                "Barcode read but not recognized as a government ID. Scan the barcode on the back of the ID, or use manual entry.",
              );
            }
            return; // keep camera open
          }
          setScannerOpen(false);
          setScanNote(null);
          handleParsed(code);
        }}
      />

      <ManagerOverrideDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        action="age_verification.manual_entry"
        description="Manual date-of-birth entry requires manager approval."
        details={{ min_age: requiredAge, items: items.length }}
        onApprove={(m) => {
          setManualManagerOk(m);
          if (manualMode === "override" || !manualDob) {
            // If no DOB yet, allow override-only approval
            submitOverride(m);
          } else {
            void submitManual();
          }
        }}
      />
    </>
  );
}

function ActionCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
  accent,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left p-4 rounded-xl border-2 transition-all hover:shadow-md active:scale-[0.98]",
        accent && "border-primary/60 bg-primary/5 hover:border-primary",
        danger && "border-destructive/40 bg-destructive/5 hover:border-destructive/70",
        !accent && !danger && "hover:border-primary/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "size-10 rounded-lg grid place-items-center shrink-0",
            accent
              ? "bg-primary text-primary-foreground"
              : danger
                ? "bg-destructive/15 text-destructive"
                : "bg-muted",
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

function ResultView({
  outcome,
  parsed,
  requiredAge,
}: {
  outcome: VerificationOutcome;
  parsed: ParsedID | null;
  requiredAge: number;
  onRetry: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  if (outcome.ok) {
    return (
      <div className="py-10">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-4 text-center text-xl font-bold text-emerald-800">
          Age verified
        </div>
      </div>
    );
  }

  const expired = outcome.reason === "expired_id";
  const title = expired ? "ID expired" : outcome.reason === "underage" ? "Under age" : "ID could not be verified";
  const detail = expired
    ? `Expired ${parsed?.expires?.toISOString().slice(0, 10) ?? ""}`
    : outcome.reason === "underage"
      ? `Minimum age is ${requiredAge}. Customer age is ${outcome.ageYears ?? "unknown"}.`
      : "Scan the barcode on the back of the ID again or use manual date of birth.";

  return (
    <div className="py-10">
      <div
        className={cn(
          "rounded-lg border px-5 py-4 text-center",
          expired
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-red-300 bg-red-50 text-red-800",
        )}
      >
        <div className="text-xl font-bold">{title}</div>
        <div className="mt-1 text-sm">{detail}</div>
      </div>
    </div>
  );
}
