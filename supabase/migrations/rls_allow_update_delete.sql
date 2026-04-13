DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rooms' AND policyname='Allow Update Access') THEN
    EXECUTE 'CREATE POLICY "Allow Update Access" ON public.rooms FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND policyname='Allow Update Access') THEN
    EXECUTE 'CREATE POLICY "Allow Update Access" ON public.players FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rounds' AND policyname='Allow Update Access') THEN
    EXECUTE 'CREATE POLICY "Allow Update Access" ON public.rounds FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bets' AND policyname='Allow Update Access') THEN
    EXECUTE 'CREATE POLICY "Allow Update Access" ON public.bets FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='card_distribution' AND policyname='Allow Update Access') THEN
    EXECUTE 'CREATE POLICY "Allow Update Access" ON public.card_distribution FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_records' AND policyname='Allow Update Access') THEN
    EXECUTE 'CREATE POLICY "Allow Update Access" ON public.game_records FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rooms' AND policyname='Allow Delete Access') THEN
    EXECUTE 'CREATE POLICY "Allow Delete Access" ON public.rooms FOR DELETE USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND policyname='Allow Delete Access') THEN
    EXECUTE 'CREATE POLICY "Allow Delete Access" ON public.players FOR DELETE USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rounds' AND policyname='Allow Delete Access') THEN
    EXECUTE 'CREATE POLICY "Allow Delete Access" ON public.rounds FOR DELETE USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bets' AND policyname='Allow Delete Access') THEN
    EXECUTE 'CREATE POLICY "Allow Delete Access" ON public.bets FOR DELETE USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='card_distribution' AND policyname='Allow Delete Access') THEN
    EXECUTE 'CREATE POLICY "Allow Delete Access" ON public.card_distribution FOR DELETE USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_records' AND policyname='Allow Delete Access') THEN
    EXECUTE 'CREATE POLICY "Allow Delete Access" ON public.game_records FOR DELETE USING (true)';
  END IF;
END $$;
