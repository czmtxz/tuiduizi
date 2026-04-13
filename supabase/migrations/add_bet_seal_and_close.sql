ALTER TABLE public.rounds
ADD COLUMN IF NOT EXISTS bet_done_chumen BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS bet_done_zhongmen BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS bet_done_momen BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS bet_closed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS bet_closed_by UUID REFERENCES public.players(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.rpc_round_bet_done(p_round_id UUID)
RETURNS TABLE (
  ok BOOLEAN,
  seat_pos TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
  v_player_id UUID;
  v_position TEXT;
BEGIN
  SELECT r.room_id INTO v_room_id
  FROM public.rounds r
  WHERE r.id = p_round_id;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'round not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.rounds r
    WHERE r.id = p_round_id
      AND (r.dice_points IS NOT NULL OR r.bet_closed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'betting closed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rounds r
    WHERE r.id = p_round_id
      AND r.status = 'active'
      AND r.phase = 'betting'
  ) THEN
    RAISE EXCEPTION 'invalid round phase';
  END IF;

  SELECT p.id, p.position
  INTO v_player_id, v_position
  FROM public.players p
  WHERE p.room_id = v_room_id
    AND p.user_id = auth.uid()
    AND p.is_active = true
    AND p.position IN ('chumen', 'zhongmen', 'momen')
  ORDER BY p.updated_at DESC, p.id DESC
  LIMIT 1;

  IF v_player_id IS NULL OR v_position IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.rounds r
  SET
    bet_done_chumen = CASE WHEN v_position = 'chumen' THEN true ELSE r.bet_done_chumen END,
    bet_done_zhongmen = CASE WHEN v_position = 'zhongmen' THEN true ELSE r.bet_done_zhongmen END,
    bet_done_momen = CASE WHEN v_position = 'momen' THEN true ELSE r.bet_done_momen END
  WHERE r.id = p_round_id;

  RETURN QUERY SELECT true, v_position;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_round_bet_close(p_round_id UUID)
RETURNS TABLE (
  ok BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
  v_banker_id UUID;
BEGIN
  SELECT r.room_id INTO v_room_id
  FROM public.rounds r
  WHERE r.id = p_round_id;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'round not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rounds r
    WHERE r.id = p_round_id
      AND r.status = 'active'
      AND r.phase = 'betting'
  ) THEN
    RAISE EXCEPTION 'invalid round phase';
  END IF;

  SELECT p.id INTO v_banker_id
  FROM public.players p
  WHERE p.room_id = v_room_id
    AND p.user_id = auth.uid()
    AND p.role = 'banker'
    AND p.position = 'banker'
    AND p.is_active = true
  LIMIT 1;

  IF v_banker_id IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.rounds r
  SET
    bet_done_chumen = true,
    bet_done_zhongmen = true,
    bet_done_momen = true,
    bet_closed_at = NOW(),
    bet_closed_by = v_banker_id
  WHERE r.id = p_round_id;

  RETURN QUERY SELECT true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_round_bet_done(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_round_bet_done(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_round_bet_close(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_round_bet_close(UUID) TO authenticated;

