import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicReadRateLimit } from "@/lib/security/rate-limit";

export type BarcodeLookupResult = {
  barcode: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  description: string | null;
  source: "openfoodfacts" | "openbeautyfacts" | "openpetfoodfacts" | "openproductsfacts" | "openlibrary" | "upcitemdb" | null;
};

const inputSchema = z.object({ barcode: z.string().trim().min(4).max(32) });

async function lookupOpenFacts(
  barcode: string,
  hostname: string,
  source: Exclude<BarcodeLookupResult["source"], "upcitemdb" | "openlibrary" | null>,
): Promise<BarcodeLookupResult | null> {
  try {
    const res = await fetch(
      `https://${hostname}/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { headers: { "User-Agent": "SEZAPOS/1.0 (+https://sezapos.com)" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        brands?: string;
        image_front_url?: string;
        image_url?: string;
        generic_name?: string;
      };
    };
    if (json.status !== 1 || !json.product) return null;
    const product = json.product;
    return {
      barcode,
      name: product.product_name?.trim() || null,
      brand: product.brands?.split(",")[0]?.trim() || null,
      image_url: product.image_front_url || product.image_url || null,
      description: product.generic_name?.trim() || null,
      source,
    };
  } catch {
    return null;
  }
}

async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeLookupResult | null> {
  return lookupOpenFacts(barcode, "world.openfoodfacts.org", "openfoodfacts");
}

async function lookupOpenLibrary(barcode: string): Promise<BarcodeLookupResult | null> {
  if (!/^(97[89])?\d{9}[\dX]$/i.test(barcode)) return null;
  try {
    const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(barcode)}&format=json&jscmd=data`);
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, { title?: string; authors?: Array<{ name?: string }>; cover?: { medium?: string; large?: string } }>;
    const book = json[`ISBN:${barcode}`];
    if (!book?.title) return null;
    return {
      barcode,
      name: book.title.trim(),
      brand: book.authors?.[0]?.name?.trim() || null,
      image_url: book.cover?.large || book.cover?.medium || null,
      description: null,
      source: "openlibrary",
    };
  } catch {
    return null;
  }
}

async function lookupUpcItemDb(barcode: string): Promise<BarcodeLookupResult | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: Array<{ title?: string; brand?: string; images?: string[]; description?: string }>;
    };
    const item = json.items?.[0];
    if (!item) return null;
    return {
      barcode,
      name: item.title?.trim() || null,
      brand: item.brand?.trim() || null,
      image_url: item.images?.[0] || null,
      description: item.description?.trim() || null,
      source: "upcitemdb",
    };
  } catch {
    return null;
  }
}

export const lookupBarcode = createServerFn({ method: "POST" })
  .middleware([publicReadRateLimit])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const lookups = [
      () => lookupOpenFoodFacts(data.barcode),
      () => lookupOpenFacts(data.barcode, "world.openbeautyfacts.org", "openbeautyfacts"),
      () => lookupOpenFacts(data.barcode, "world.openpetfoodfacts.org", "openpetfoodfacts"),
      () => lookupOpenFacts(data.barcode, "world.openproductsfacts.org", "openproductsfacts"),
      () => lookupOpenLibrary(data.barcode),
      () => lookupUpcItemDb(data.barcode),
    ];
    for (const run of lookups) {
      const result = await run();
      if (result?.name) return result;
    }
    return {
      barcode: data.barcode,
      name: null,
      brand: null,
      image_url: null,
      description: null,
      source: null,
    } satisfies BarcodeLookupResult;
  });
