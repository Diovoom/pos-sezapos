-- Revoke anon EXECUTE on SECURITY DEFINER function
REVOKE EXECUTE ON FUNCTION public.record_legal_acceptance(text, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_legal_acceptance(text, text, timestamptz, text) TO authenticated;

-- Remove device_registrations from realtime publication to prevent secret_hash leakage
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'device_registrations'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.device_registrations;
  END IF;
END $$;