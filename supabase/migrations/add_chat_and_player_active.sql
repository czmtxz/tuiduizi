ALTER TABLE players
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_players_room_active ON public.players(room_id, is_active);

CREATE TABLE IF NOT EXISTS room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  sender_name VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_messages_room_id ON public.room_messages(room_id, created_at);

ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_messages' AND policyname='Public Read Access') THEN
    EXECUTE 'CREATE POLICY "Public Read Access" ON public.room_messages FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_messages' AND policyname='Allow Insert Access') THEN
    EXECUTE 'CREATE POLICY "Allow Insert Access" ON public.room_messages FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='room_messages' AND policyname='Allow Delete Access') THEN
    EXECUTE 'CREATE POLICY "Allow Delete Access" ON public.room_messages FOR DELETE USING (true)';
  END IF;
END $$;
