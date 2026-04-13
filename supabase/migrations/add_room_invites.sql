CREATE TABLE IF NOT EXISTS public.room_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  join_code VARCHAR(16) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  inviter_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  max_bet INTEGER,
  bet_step INTEGER,
  touzi_min_bet INTEGER,
  touzi_max_bet INTEGER,
  cha_min_bet INTEGER,
  cha_max_bet INTEGER,
  allow_hong BOOLEAN,
  hong_min_bet INTEGER,
  hong_max_bet INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_room_invites_status_created
ON public.room_invites(status, created_at DESC);

ALTER TABLE public.room_invites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_invites' AND policyname='Public Read Access') THEN
    EXECUTE 'CREATE POLICY "Public Read Access" ON public.room_invites FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_invites' AND policyname='Allow Insert Access') THEN
    EXECUTE 'CREATE POLICY "Allow Insert Access" ON public.room_invites FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_invites' AND policyname='Allow Update Access') THEN
    EXECUTE 'CREATE POLICY "Allow Update Access" ON public.room_invites FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_invites' AND policyname='Allow Delete Access') THEN
    EXECUTE 'CREATE POLICY "Allow Delete Access" ON public.room_invites FOR DELETE USING (true)';
  END IF;
END $$;
