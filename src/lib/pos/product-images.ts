import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isOnlineNow } from "@/lib/offline/useOnline";

const BUCKET = "product-images";
const CACHE_NAME = "seza-product-images-v1";
const signedUrlCache = new Map<string, { url: string; expires: number }>();

function persistentCacheKey(value: string) {
  return new Request(`https://offline-images.sezapos.local/${encodeURIComponent(value)}`);
}

async function readPersistentImage(value: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(persistentCacheKey(value));
  return response ? response.blob() : null;
}

async function fetchAndPersistImage(value: string, downloadUrl: string): Promise<Blob> {
  const response = await fetch(downloadUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Image download failed (${response.status})`);
  const blob = await response.blob();
  if (typeof caches !== "undefined") {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      persistentCacheKey(value),
      new Response(blob, {
        headers: {
          "content-type": blob.type || "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable",
        },
      }),
    );
  }
  return blob;
}

async function resolveDownloadUrl(pathOrUrl: string): Promise<string | null> {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const cached = signedUrlCache.get(pathOrUrl);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pathOrUrl, 60 * 60);
  if (error || !data?.signedUrl) return null;
  signedUrlCache.set(pathOrUrl, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}

/**
 * Resolves a product image and keeps an actual image response in Cache Storage.
 * The stable cache key is independent of an expiring Supabase signed URL, so a
 * product that has been viewed online remains visible after an app restart in
 * airplane mode.
 */
export function useProductImageUrl(pathOrUrl: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const applyBlob = (blob: Blob) => {
      if (cancelled) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    };

    if (!pathOrUrl) {
      setUrl(null);
      return () => {};
    }

    void (async () => {
      const cached = await readPersistentImage(pathOrUrl).catch(() => null);
      if (cached) applyBlob(cached);

      if (!isOnlineNow()) return;

      const downloadUrl = await resolveDownloadUrl(pathOrUrl);
      if (!downloadUrl || cancelled) return;
      try {
        applyBlob(await fetchAndPersistImage(pathOrUrl, downloadUrl));
      } catch {
        // Some third-party image hosts block CORS. They can still render while
        // online, but cannot be persisted by the WebView cache.
        if (!cached && !cancelled) setUrl(downloadUrl);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pathOrUrl]);

  return url;
}

/** Upload a single image file, returns the storage path stored in `products.image_url`. */
export async function uploadProductImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
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
