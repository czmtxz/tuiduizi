CREATE TABLE IF NOT EXISTS public.voice_penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  target_player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.voice_reports(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('mute')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 200),
  created_by UUID REFERENCES public.players(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_penalties_room_target
ON public.voice_penalties(room_id, target_player_id, created_at DESC);

ALTER TABLE public.voice_penalties ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'voice_penalties' AND policyname = 'Admins And Self Read Voice Penalties'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins And Self Read Voice Penalties"
      ON public.voice_penalties
      FOR SELECT
      USING (
        target_player_id IN (
          SELECT p.id FROM public.players p WHERE p.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.admin_emails a WHERE a.email = (auth.jwt() ->> 'email')
        )
      )
    $policy$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_issue_voice_penalty(
  p_room_id UUID,
  p_target_player_id UUID,
  p_report_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT '语音违规',
  p_duration_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
  ok BOOLEAN,
  penalty_id UUID,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
  v_admin_player_id UUID;
  v_penalty_id UUID := gen_random_uuid();
  v_expires_at TIMESTAMPTZ := NOW() + make_interval(mins => GREATEST(1, LEAST(COALESCE(p_duration_minutes, 30), 1440)));
BEGIN
  v_admin_email := auth.jwt() ->> 'email';
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_emails a WHERE a.email = v_admin_email
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.id = p_target_player_id
      AND p.room_id = p_room_id
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'target player not found';
  END IF;

  SELECT p.id INTO v_admin_player_id
  FROM public.players p
  WHERE p.room_id = p_room_id
    AND p.user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.voice_penalties (
    id,
    room_id,
    target_player_id,
    report_id,
    action_type,
    reason,
    created_by,
    expires_at
  )
  VALUES (
    v_penalty_id,
    p_room_id,
    p_target_player_id,
    p_report_id,
    'mute',
    left(trim(COALESCE(NULLIF(p_reason, ''), '语音违规')), 200),
    v_admin_player_id,
    v_expires_at
  );

  RETURN QUERY SELECT true, v_penalty_id, v_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_revoke_voice_penalty(
  p_penalty_id UUID
)
RETURNS TABLE (
  ok BOOLEAN,
  revoked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
  v_revoked_at TIMESTAMPTZ := NOW();
BEGIN
  v_admin_email := auth.jwt() ->> 'email';
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_emails a WHERE a.email = v_admin_email
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.voice_penalties
  SET revoked_at = v_revoked_at
  WHERE id = p_penalty_id
    AND revoked_at IS NULL;

  RETURN QUERY SELECT true, v_revoked_at;
END;
$$;

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

  IF p_enabled AND EXISTS (
    SELECT 1
    FROM public.voice_penalties vp
    WHERE vp.room_id = p_room_id
      AND vp.target_player_id = v_player_id
      AND vp.revoked_at IS NULL
      AND (vp.expires_at IS NULL OR vp.expires_at > NOW())
  ) THEN
    RAISE EXCEPTION 'voice muted by admin';
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

GRANT EXECUTE ON FUNCTION public.rpc_issue_voice_penalty(UUID, UUID, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_voice_penalty(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_voice_session(UUID, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
