CREATE OR REPLACE FUNCTION public.rpc_round_reveal_mine(
  p_round_id UUID
)
RETURNS TABLE (
  ok BOOLEAN,
  phase TEXT,
  all_revealed BOOLEAN,
  revealed_position TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
  v_player_id UUID;
  v_position TEXT;
  v_new_phase TEXT;
  v_all_revealed BOOLEAN;
BEGIN
  SELECT r.room_id INTO v_room_id
  FROM public.rounds r
  WHERE r.id = p_round_id;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'round not found';
  END IF;

  SELECT p.id, p.position
  INTO v_player_id, v_position
  FROM public.players p
  WHERE p.room_id = v_room_id
    AND p.user_id = auth.uid()
    AND p.is_active = true
    AND p.position IS NOT NULL
  ORDER BY p.updated_at DESC, p.id DESC
  LIMIT 1;

  IF v_player_id IS NULL OR v_position IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rounds r
    WHERE r.id = p_round_id
      AND r.room_id = v_room_id
      AND r.status = 'active'
      AND r.phase IN ('wait_reveal', 'revealing')
  ) THEN
    RAISE EXCEPTION 'invalid round phase';
  END IF;

  UPDATE public.round_hands rh
  SET
    public_hand = (
      convert_from(decode(rh.encrypted_hand, 'base64'), 'utf8')::jsonb
    ),
    is_revealed = true,
    revealed_at = NOW(),
    revealed_by = v_player_id,
    updated_at = NOW()
  WHERE rh.round_id = p_round_id
    AND rh.room_id = v_room_id
    AND rh.position = v_position
    AND rh.owner_player_id = v_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.rounds r
  SET
    phase = CASE WHEN r.phase = 'wait_reveal' THEN 'revealing' ELSE r.phase END,
    reveal_started_at = CASE WHEN r.reveal_started_at IS NULL THEN NOW() ELSE r.reveal_started_at END,
    updated_at = NOW()
  WHERE r.id = p_round_id;

  SELECT COUNT(*) = 4
  INTO v_all_revealed
  FROM public.round_hands rh
  WHERE rh.round_id = p_round_id
    AND rh.room_id = v_room_id
    AND rh.is_revealed = true;

  IF v_all_revealed THEN
    UPDATE public.rounds r
    SET all_revealed = true, updated_at = NOW()
    WHERE r.id = p_round_id;
  END IF;

  SELECT r.phase INTO v_new_phase FROM public.rounds r WHERE r.id = p_round_id;

  INSERT INTO public.round_operation_logs (room_id, round_id, operator_player_id, action_type, payload)
  VALUES (v_room_id, p_round_id, v_player_id, 'reveal_self', jsonb_build_object('position', v_position));

  RETURN QUERY SELECT true, v_new_phase, COALESCE(v_all_revealed, false), v_position;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_round_reveal_mine(UUID) TO authenticated;

