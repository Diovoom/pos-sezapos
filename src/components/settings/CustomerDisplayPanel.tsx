import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
  normalizeCustomerDisplaySettings,
  type CustomerDisplaySettings,
} from "@/lib/customer-display-preferences";
import { userFacingError } from "@/lib/errors/user-facing";
import { logAudit } from "@/lib/audit-log";

const PHOTO_SIZE = 720;
const MAX_DATA_URL_LENGTH = 280_000;

async function storePhotoDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
    throw new Error("Use PNG, JPG, or WEBP");
  }
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.max(0, Math.floor((bitmap.width - side) / 2));
  const sy = Math.max(0, Math.floor((bitmap.height - side) / 2));
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image could not be prepared");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

  let url = canvas.toDataURL("image/webp", 0.84);
  if (url.length > MAX_DATA_URL_LENGTH) url = canvas.toDataURL("image/jpeg", 0.8);
  if (url.length > MAX_DATA_URL_LENGTH) url = canvas.toDataURL("image/jpeg", 0.68);
  if (url.length > MAX_DATA_URL_LENGTH) {
    throw new Error("This picture is too large. Choose a smaller image.");
  }
  return url;
}

export function CustomerDisplayPanel() {
  const qc = useQueryClient();
  const photoRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<CustomerDisplaySettings>(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);

  const storeQuery = useQuery({
    queryKey: ["store", "customer-display-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("stores")
        .select("id,name,customer_display_settings")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; customer_display_settings?: unknown } | null;
    },
  });

  useEffect(() => {
    if (!storeQuery.data) return;
    setSettings(normalizeCustomerDisplaySettings(storeQuery.data.customer_display_settings));
  }, [storeQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!storeQuery.data?.id) throw new Error("Store could not be loaded");
      const normalized = normalizeCustomerDisplaySettings(settings);
      const { error } = await (supabase.from as any)("stores")
        .update({ customer_display_settings: normalized })
        .eq("id", storeQuery.data.id);
      if (error) throw error;
      await logAudit({
        action: "settings.customer_display.update",
        entity: "store",
        entity_id: storeQuery.data.id,
        details: {
          idleMode: normalized.idleMode,
          hasImage: !!normalized.imageUrl,
          textScale: normalized.textScale,
        },
      });
      return normalized;
    },
    onSuccess: (normalized) => {
      setSettings(normalized);
      toast.success("Customer display updated");
      void qc.invalidateQueries({ queryKey: ["store"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["store", "customer-display-settings"] });
    },
    onError: (error) => toast.error(userFacingError(error, "Customer display could not be updated")),
  });

  const pickPhoto = async () => {
    const file = photoRef.current?.files?.[0];
    if (photoRef.current) photoRef.current.value = "";
    if (!file) return;
    try {
      const imageUrl = await storePhotoDataUrl(file);
      setSettings((current) => ({ ...current, imageUrl, idleMode: "image" }));
    } catch (error) {
      toast.error(userFacingError(error, "Store photo could not be prepared"));
    }
  };

  const openCustomerDisplay = () => {
    const url = new URL("/customer-display", window.location.origin);
    if (storeQuery.data?.id) url.searchParams.set("store", storeQuery.data.id);
    window.open(url.toString(), "customer-display", "width=900,height=650");
  };

  const previewSize = Math.round(38 * settings.textScale);
  const imageSelected = settings.idleMode === "image" && !!settings.imageUrl;

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Customer display</CardTitle>
        <CardDescription>
          Customize the idle screen shown before checkout. Online registers refresh these settings automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-hidden rounded-2xl border bg-slate-950 text-white shadow-sm">
          <div className="border-b border-white/10 px-5 py-3 text-lg font-black">
            {storeQuery.data?.name || "Your store"}
          </div>
          <div className="grid min-h-72 place-items-center p-8 text-center">
            {imageSelected ? (
              <img
                src={settings.imageUrl ?? ""}
                alt="Store preview"
                className="max-h-52 max-w-52 rounded-2xl object-contain shadow-2xl"
              />
            ) : (
              <div
                className="max-w-full break-words font-black leading-[1.05]"
                style={{ fontSize: `${previewSize}px` }}
              >
                {settings.welcomeMessage || "Welcome"}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border p-4">
          <div>
            <Label>Idle screen</Label>
            <p className="text-xs text-muted-foreground">Choose a custom message or your store photo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={settings.idleMode === "message" ? "default" : "outline"}
              onClick={() => setSettings((current) => ({ ...current, idleMode: "message" }))}
            >
              Message
            </Button>
            <Button
              type="button"
              variant={settings.idleMode === "image" ? "default" : "outline"}
              onClick={() => setSettings((current) => ({ ...current, idleMode: "image" }))}
            >
              <ImageIcon className="mr-2 size-4" />
              Store photo
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border p-4">
          <div className="space-y-1">
            <Label htmlFor="customer-display-message">Welcome message</Label>
            <p className="text-xs text-muted-foreground">
              Example: Welcome to our store. This is shown when Message is selected.
            </p>
          </div>
          <Input
            id="customer-display-message"
            value={settings.welcomeMessage}
            onChange={(event) =>
              setSettings((current) => ({ ...current, welcomeMessage: event.target.value.slice(0, 48) }))
            }
            maxLength={48}
            placeholder="Welcome"
          />
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Message size</Label>
              <span className="text-sm font-semibold tabular-nums">{Math.round(settings.textScale * 100)}%</span>
            </div>
            <Slider
              value={[Math.round(settings.textScale * 100)]}
              min={80}
              max={180}
              step={10}
              onValueChange={(values) =>
                setSettings((current) => ({
                  ...current,
                  textScale: Math.min(1.8, Math.max(0.8, (values[0] ?? 100) / 100)),
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border p-4">
          <div>
            <Label>Store photo</Label>
            <p className="text-xs text-muted-foreground">
              SEZA crops the upload to a square, but the customer screen shows only the picture — no visible square frame.
            </p>
          </div>
          {settings.imageUrl ? (
            <img src={settings.imageUrl} alt="Store" className="size-32 rounded-2xl object-cover shadow-sm" />
          ) : null}
          <input
            ref={photoRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={() => void pickPhoto()}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => photoRef.current?.click()}>
              <Upload className="mr-2 size-4" />
              {settings.imageUrl ? "Change photo" : "Upload store photo"}
            </Button>
            {settings.imageUrl ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() =>
                  setSettings((current) => ({ ...current, imageUrl: null, idleMode: "message" }))
                }
              >
                <Trash2 className="mr-2 size-4" />
                Remove photo
              </Button>
            ) : null}
          </div>
          {settings.idleMode === "image" && !settings.imageUrl ? (
            <p className="text-xs font-medium text-amber-600">
              Upload a photo first. Until then, the welcome message is shown.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !storeQuery.data?.id}>
            {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save customer display
          </Button>
          <Button variant="outline" onClick={openCustomerDisplay} disabled={!storeQuery.data?.id}>
            Preview in new window
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
