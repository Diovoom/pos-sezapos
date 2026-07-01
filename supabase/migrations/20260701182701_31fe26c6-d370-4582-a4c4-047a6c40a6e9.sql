
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_pin boolean NOT NULL DEFAULT false;
