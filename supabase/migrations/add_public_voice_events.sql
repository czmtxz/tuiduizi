CREATE TABLE IF NOT EXISTS public.voice_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  text TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '300 milliseconds'),
  created_by UUID REFERENCES public.players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, round_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_voice_event_logs_room_scheduled
ON public.voice_event_logs(room_id, scheduled_at DESC);

ALTER TABLE public.voice_event_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'voice_event_logs' AND policyname = 'Room Members Read Voice Events'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Room Members Read Voice Events"
      ON public.voice_event_logs
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.players p
          WHERE p.room_id = voice_event_logs.room_id
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

CREATE OR REPLACE FUNCTION public.rpc_log_voice_event(
  p_round_id UUID,
  p_event_key TEXT,
  p_text TEXT,
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

  INSERT INTO public.voice_event_logs (
    id,
    room_id,
    round_id,
    event_key,
    text,
    locale,
    scheduled_at,
    created_by
  )
  VALUES (
    v_event_id,
    v_room_id,
    p_round_id,
    COALESCE(NULLIF(p_event_key, ''), 'public'),
    COALESCE(NULLIF(p_text, ''), '...'),
    COALESCE(NULLIF(p_locale, ''), 'zh-CN'),
    v_scheduled_at,
    v_player_id
  )
  ON CONFLICT (room_id, round_id, event_key) DO NOTHING;

  RETURN QUERY SELECT true, v_event_id, v_scheduled_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_log_voice_event(UUID, TEXT, TEXT, TEXT) TO authenticated;

