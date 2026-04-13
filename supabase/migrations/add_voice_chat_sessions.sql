CREATE TABLE IF NOT EXISTS public.rtc_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  rtc_room_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('off', 'connecting', 'on')),
  muted BOOLEAN NOT NULL DEFAULT false,
  mic_permission TEXT NOT NULL DEFAULT 'unknown' CHECK (mic_permission IN ('unknown', 'granted', 'denied')),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_rtc_sessions_room_id ON public.rtc_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_rtc_sessions_room_status ON public.rtc_sessions(room_id, status);

ALTER TABLE public.rtc_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rtc_sessions' AND policyname = 'Room Members Read RTC Sessions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Room Members Read RTC Sessions"
      ON public.rtc_sessions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.players p
          WHERE p.room_id = rtc_sessions.room_id
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

CREATE OR REPLACE FUNCTION public.rpc_upsert_voice_session(
  p_room_id UUID,
  p_enabled BOOLEAN,
  p_muted BOOLEAN DEFAULT false,
  p_mic_permission TEXT DEFAULT 'unknown'
)
RETURNS TABLE (
  ok BOOLEAN,
  status TEXT,
  muted BOOLEAN,
  rtc_room_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_rtc_room_id TEXT;
  v_status TEXT;
BEGIN
  SELECT p.id INTO v_player_id
  FROM public.players p
  WHERE p.room_id = p_room_id
    AND p.user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  v_rtc_room_id := 'room-' || replace(p_room_id::text, '-', '');
  v_status := CASE WHEN p_enabled THEN 'on' ELSE 'off' END;

  INSERT INTO public.rtc_sessions (
    room_id,
    player_id,
    rtc_room_id,
    status,
    muted,
    mic_permission,
    joined_at,
    left_at,
    updated_at
  )
  VALUES (
    p_room_id,
    v_player_id,
    v_rtc_room_id,
    v_status,
    COALESCE(p_muted, false),
    COALESCE(NULLIF(p_mic_permission, ''), 'unknown'),
    CASE WHEN p_enabled THEN NOW() ELSE NULL END,
    CASE WHEN p_enabled THEN NULL ELSE NOW() END,
    NOW()
  )
  ON CONFLICT (room_id, player_id)
  DO UPDATE SET
    rtc_room_id = EXCLUDED.rtc_room_id,
    status = EXCLUDED.status,
    muted = EXCLUDED.muted,
    mic_permission = EXCLUDED.mic_permission,
    joined_at = CASE
      WHEN EXCLUDED.status = 'on' AND rtc_sessions.joined_at IS NULL THEN NOW()
      ELSE rtc_sessions.joined_at
    END,
    left_at = CASE
      WHEN EXCLUDED.status = 'off' THEN NOW()
      ELSE NULL
    END,
    updated_at = NOW();

  RETURN QUERY SELECT true, v_status, COALESCE(p_muted, false), v_rtc_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_leave_voice_session(p_room_id UUID)
RETURNS TABLE (
  ok BOOLEAN,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ok, status
  FROM public.rpc_upsert_voice_session(p_room_id, false, true, 'unknown');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_upsert_voice_session(UUID, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_leave_voice_session(UUID) TO authenticated;
