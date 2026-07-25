import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicReadRateLimit } from "@/lib/security/rate-limit";

export type BarcodeLookupResult = {
  barcode: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  description: string | null;
  source: "openfoodfacts" | "upcitemdb" | null;
};

const inputSchema = z.object({ barcode: z.string().trim().min(4).max(32) });

async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeLookupResult | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
      headers: { "User-Agent": "SEZAPOS/1.0 (+https://sezapos.com)" },
    });
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
    const p = json.product;
    return {
      barcode,
      name: p.product_name?.trim() || null,
      brand: p.brands?.split(",")[0]?.trim() || null,
      image_url: p.image_front_url || p.image_url || null,
      description: p.generic_name?.trim() || null,
      source: "openfoodfacts",
    };
  } catch {
    return null;
  }
}

async function lookupUpcItemDb(barcode: string): Promise<BarcodeLookupResult | null> {
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`);
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
    const off = await lookupOpenFoodFacts(data.barcode);
    if (off?.name) return off;
    const upc = await lookupUpcItemDb(data.barcode);
    if (upc?.name) return upc;
    return {
      barcode: data.barcode,
      name: null,
      brand: null,
      image_url: null,
      description: null,
      source: null,
    } satisfies BarcodeLookupResult;
  });
