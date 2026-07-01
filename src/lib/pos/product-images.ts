import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "product-images";
const cache = new Map<string, { url: string; expires: number }>();

/**
 * Returns a short-lived signed URL for a private product image.
 * Accepts either a storage path or a full https URL (returned as-is for
 * remote lookup images such as Open Food Facts).
 */
export function useProductImageUrl(pathOrUrl: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => {
    if (!pathOrUrl) return null;
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const c = cache.get(pathOrUrl);
    return c && c.expires > Date.now() ? c.url : null;
  });

  useEffect(() => {
    if (!pathOrUrl) return setUrl(null);
    if (/^https?:\/\//i.test(pathOrUrl)) return setUrl(pathOrUrl);
    const c = cache.get(pathOrUrl);
    if (c && c.expires > Date.now()) return setUrl(c.url);
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(pathOrUrl, 60 * 60);
      if (cancelled || !data?.signedUrl) return;
      cache.set(pathOrUrl, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
      setUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [pathOrUrl]);

  return url;
}

/** Upload a single image file, returns the storage path stored in `products.image_url`. */
export async function uploadProductImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Download a remote image URL (e.g. Open Food Facts) and store it in the bucket. */
export async function importRemoteProductImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
    const file = new File([blob], `imported.${ext}`, { type: blob.type });
    return await uploadProductImage(file);
  } catch {
    return null;
  }
}
