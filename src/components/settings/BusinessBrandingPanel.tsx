import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreBranding } from "@/hooks/useStoreBranding";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { logAudit } from "@/lib/audit-log";

const MAX_DIM = 512;
const MAX_BYTES = 220_000; // ~220KB data URL

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
  // PNG preserves transparency for logos.
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
  const [saving, setSaving] = useState<null | "primary" | "receipt">(null);

  const save = async (field: "logo_url" | "receipt_logo_url", value: string | null) => {
    if (!storeId) return;
    setSaving(field === "logo_url" ? "primary" : "receipt");
    const patch: Record<string, string | null> = { [field]: value };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("stores").update(patch).eq("id", storeId);
    setSaving(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(value ? "Logo updated" : "Logo removed");
    void logAudit({ action: "settings.branding.update", entity: "store", entity_id: storeId, details: { field, cleared: !value } });
    qc.invalidateQueries({ queryKey: ["store-branding"] });
    qc.invalidateQueries({ queryKey: ["me"] });
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
    inputRef: React.RefObject<HTMLInputElement>;
    busy: boolean;
  }) => (
    <div className="rounded-lg border p-4 flex gap-4 items-start">
      <div className="size-24 rounded-lg bg-white border grid place-items-center overflow-hidden shrink-0">
        {url ? (
          <img src={url} alt={label} className="max-w-full max-h-full object-contain" />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" />
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
          One logo across POS header, loading screen, receipts, customer display, dashboard,
          and the Android app. PNG, JPG or WEBP up to ~1&nbsp;MB. Automatically resized.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
      </CardContent>
    </Card>
  );
}
