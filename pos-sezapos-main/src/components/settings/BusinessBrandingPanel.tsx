import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreBranding } from "@/hooks/useStoreBranding";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { logAudit } from "@/lib/audit-log";

const MAX_DIM = 512;
const MAX_BYTES = 220_000;

async function fileToResizedDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
    throw new Error("Use PNG, JPG, or WEBP");
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  let url = canvas.toDataURL("image/png");
  if (url.length > MAX_BYTES) url = canvas.toDataURL("image/webp", 0.9);
  if (url.length > MAX_BYTES) url = canvas.toDataURL("image/jpeg", 0.85);
  return url;
}

export function BusinessBrandingPanel() {
  const qc = useQueryClient();
  const { data } = useStoreBranding();
  const storeId = data?.storeId;
  const primaryRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState<null | "primary" | "receipt" | "text">(null);
  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    if (data?.displayText) setDisplayText(data.displayText);
  }, [data?.displayText]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["store-branding"] });
    void qc.invalidateQueries({ queryKey: ["store"] });
    void qc.invalidateQueries({ queryKey: ["me"] });
  };

  const save = async (
    field: "logo_url" | "receipt_logo_url" | "pos_display_name",
    value: string | null,
  ) => {
    if (!storeId) return;
    const kind = field === "logo_url" ? "primary" : field === "receipt_logo_url" ? "receipt" : "text";
    setSaving(kind);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("stores")
      .update({ [field]: value })
      .eq("id", storeId);
    setSaving(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(field === "pos_display_name" ? "Fallback text updated" : value ? "Logo updated" : "Logo removed");
    void logAudit({
      action: "settings.branding.update",
      entity: "store",
      entity_id: storeId,
      details: { field, cleared: !value },
    });
    refresh();
  };

  const onPick = async (field: "logo_url" | "receipt_logo_url", input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const url = await fileToResizedDataUrl(file);
      await save(field, url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const LogoTile = ({
    label,
    description,
    url,
    field,
    inputRef,
    busy,
  }: {
    label: string;
    description: string;
    url: string;
    field: "logo_url" | "receipt_logo_url";
    inputRef: React.RefObject<HTMLInputElement | null>;
    busy: boolean;
  }) => (
    <div className="rounded-lg border p-4 flex gap-4 items-start">
      <div className="size-24 rounded-lg bg-white border grid place-items-center overflow-hidden shrink-0">
        {url ? (
          <img src={url} alt={label} className="max-w-full max-h-full object-contain" />
        ) : (
          <div className="size-full grid place-items-center bg-primary text-primary-foreground font-black text-2xl">
            {displayText || "S"}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => onPick(field, e.currentTarget)}
          />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy || !storeId}>
            {busy ? <Loader2 className="size-3.5 mr-2 animate-spin" /> : <Upload className="size-3.5 mr-2" />}
            Upload
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busy || !storeId}
            onClick={() => save(field, null)}
          >
            <Trash2 className="size-3.5 mr-2" /> Remove
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Branding</CardTitle>
        <CardDescription>
          Branding is stored in the cloud. Online Android registers refresh automatically when you save a change—no APK rebuild required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-4 space-y-3">
          <div>
            <Label htmlFor="pos-display-text">Text shown when no logo is uploaded</Label>
            <p className="text-xs text-muted-foreground">Use 1–4 short characters, for example EVS, DM, or S.</p>
          </div>
          <div className="flex gap-2 max-w-sm">
            <Input
              id="pos-display-text"
              value={displayText}
              maxLength={4}
              onChange={(e) => setDisplayText(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
              placeholder="EVS"
            />
            <Button
              onClick={() => save("pos_display_name", displayText.trim() || null)}
              disabled={!storeId || saving === "text"}
            >
              {saving === "text" && <Loader2 className="size-4 mr-2 animate-spin" />}
              Save text
            </Button>
          </div>
        </div>

        <LogoTile
          label="Primary logo"
          description="Shown in the POS header, loading screen, customer display and Android app."
          url={data?.hasCustomLogo ? data.logoUrl : ""}
          field="logo_url"
          inputRef={primaryRef}
          busy={saving === "primary"}
        />
        <LogoTile
          label="Receipt logo"
          description="Printed and emailed with every receipt. Falls back to the primary logo when empty."
          url={data?.receiptLogoUrl && data.hasCustomLogo ? data.receiptLogoUrl : ""}
          field="receipt_logo_url"
          inputRef={receiptRef}
          busy={saving === "receipt"}
        />
        {!data?.hasCustomLogo && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ImageIcon className="size-4" /> The fallback text above is currently used in the POS header.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
