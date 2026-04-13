CREATE TABLE IF NOT EXISTS public.audio_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('bet_sfx')),
  bet_type TEXT NOT NULL CHECK (bet_type IN ('touzi', 'liangdao', 'sandao', 'cha', 'duizi', 'hong')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '300 milliseconds'),
  created_by UUID REFERENCES public.players(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audio_event_logs_room_scheduled
ON public.audio_event_logs(room_id, scheduled_at DESC);

ALTER TABLE public.audio_event_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audio_event_logs' AND policyname = 'Room Members Read Audio Events'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Room Members Read Audio Events"
      ON public.audio_event_logs
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.players p
          WHERE p.room_id = audio_event_logs.room_id
            AND p.user_id = auth.uid()
            AND p.is_active = true
        )
        OR EXISTS (
          SELECT 1
          FROM public.admin_emails a
          WHERE a.email = (auth.jwt() ->> 'email')
        )
      )
    $policy$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_log_bet_audio_event(
  p_round_id UUID,
  p_bet_type TEXT,
  p_amount INTEGER,
  p_locale TEXT DEFAULT 'zh-CN'
)
RETURNS TABLE (
  ok BOOLEAN,
  event_id UUID,
  scheduled_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
  v_player_id UUID;
  v_scheduled_at TIMESTAMPTZ := NOW() + INTERVAL '300 milliseconds';
  v_event_id UUID := gen_random_uuid();
BEGIN
  SELECT r.room_id INTO v_room_id
  FROM public.rounds r
  WHERE r.id = p_round_id;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'round not found';
  END IF;

  SELECT p.id INTO v_player_id
  FROM public.players p
  WHERE p.room_id = v_room_id
    AND p.user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  INSERT INTO public.audio_event_logs (
    id,
    room_id,
    round_id,
    event_type,
    bet_type,
    amount,
    locale,
    scheduled_at,
    created_by,
    payload
  )
  VALUES (
    v_event_id,
    v_room_id,
    p_round_id,
    'bet_sfx',
    p_bet_type,
    p_amount,
    COALESCE(NULLIF(p_locale, ''), 'zh-CN'),
    v_scheduled_at,
    v_player_id,
    jsonb_build_object(
      'bet_type', p_bet_type,
      'amount', p_amount,
      'locale', COALESCE(NULLIF(p_locale, ''), 'zh-CN')
    )
  );

  RETURN QUERY SELECT true, v_event_id, v_scheduled_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_log_bet_audio_event(UUID, TEXT, INTEGER, TEXT) TO authenticated;
