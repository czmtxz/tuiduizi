DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'players'
      AND policyname = 'Public Read Access'
  ) THEN
    EXECUTE 'CREATE POLICY "Public Read Access" ON public.players FOR SELECT USING (true)';
  END IF;
END $$;

