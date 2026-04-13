CREATE TABLE IF NOT EXISTS public.voice_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  reporter_player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  target_player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  rtc_session_id UUID REFERENCES public.rtc_sessions(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 200),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES public.players(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_reports_room_status
ON public.voice_reports(room_id, status, created_at DESC);

ALTER TABLE public.voice_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'voice_reports' AND policyname = 'Reporters And Admins Read Voice Reports'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Reporters And Admins Read Voice Reports"
      ON public.voice_reports
      FOR SELECT
      USING (
        reporter_player_id IN (
          SELECT p.id FROM public.players p WHERE p.user_id = auth.uid()
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

CREATE OR REPLACE FUNCTION public.rpc_submit_voice_report(
  p_room_id UUID,
  p_target_player_id UUID,
  p_reason TEXT
)
RETURNS TABLE (
  ok BOOLEAN,
  report_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter_player_id UUID;
  v_rtc_session_id UUID;
  v_report_id UUID := gen_random_uuid();
BEGIN
  SELECT p.id INTO v_reporter_player_id
  FROM public.players p
  WHERE p.room_id = p_room_id
    AND p.user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;

  IF v_reporter_player_id IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF v_reporter_player_id = p_target_player_id THEN
    RAISE EXCEPTION 'cannot report self';
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

  SELECT rs.id INTO v_rtc_session_id
  FROM public.rtc_sessions rs
  WHERE rs.room_id = p_room_id
    AND rs.player_id = p_target_player_id
  ORDER BY rs.updated_at DESC
  LIMIT 1;

  INSERT INTO public.voice_reports (
    id,
    room_id,
    reporter_player_id,
    target_player_id,
    rtc_session_id,
    reason
  )
  VALUES (
    v_report_id,
    p_room_id,
    v_reporter_player_id,
    p_target_player_id,
    v_rtc_session_id,
    left(trim(p_reason), 200)
  );

  RETURN QUERY SELECT true, v_report_id, 'open'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_review_voice_report(
  p_report_id UUID,
  p_status TEXT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS TABLE (
  ok BOOLEAN,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
BEGIN
  v_admin_email := auth.jwt() ->> 'email';
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_emails a
    WHERE a.email = v_admin_email
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.voice_reports
  SET
    status = p_status,
    admin_note = p_admin_note,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_report_id;

  RETURN QUERY SELECT true, p_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_submit_voice_report(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_review_voice_report(UUID, TEXT, TEXT) TO authenticated;
