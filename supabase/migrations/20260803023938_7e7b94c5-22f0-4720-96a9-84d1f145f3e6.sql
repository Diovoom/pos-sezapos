DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip enable rls: %', SQLERRM;
  END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "customer_display_read_own_store" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "customer_display_write_own_store" ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY "customer_display_read_own_store"
      ON realtime.messages FOR SELECT TO authenticated
      USING (
        realtime.topic() = 'customer-display:' || public.current_store_id()::text
      )$p$;
    EXECUTE $p$
      CREATE POLICY "customer_display_write_own_store"
      ON realtime.messages FOR INSERT TO authenticated
      WITH CHECK (
        realtime.topic() = 'customer-display:' || public.current_store_id()::text
      )$p$;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip realtime policies: %', SQLERRM;
  END;
END $$;