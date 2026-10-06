-- Owner-managed checkout Quick Keys.
-- Additive only: existing products keep their current Favorites/category behavior.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_quick_key boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quick_key_order integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_quick_key_order_nonnegative'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_quick_key_order_nonnegative
      CHECK (quick_key_order >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_store_quick_keys
  ON public.products (store_id, quick_key_order, name)
  WHERE is_quick_key = true;

COMMENT ON COLUMN public.products.is_quick_key IS
  'When true, the product appears in the POS Quick Keys tab before Favorites.';
COMMENT ON COLUMN public.products.quick_key_order IS
  'Merchant-controlled ordering for products shown in the POS Quick Keys tab.';
