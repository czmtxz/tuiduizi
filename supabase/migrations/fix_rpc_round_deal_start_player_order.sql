CREATE OR REPLACE FUNCTION public.rpc_round_deal_start(
  p_room_id UUID,
  p_round_id UUID,
  p_hands JSONB
)
RETURNS TABLE (
  ok BOOLEAN,
  phase TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT p.id
  INTO v_player_id
  FROM public.players p
  WHERE p.room_id = p_room_id
    AND p.user_id = auth.uid()
    AND p.role = 'banker'
    AND p.position = 'banker'
    AND p.is_active = true
  ORDER BY p.updated_at DESC, p.id DESC
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rounds r
    WHERE r.id = p_round_id
      AND r.room_id = p_room_id
      AND r.phase = 'dice_done'
      AND r.status = 'active'
  ) THEN
    RAISE EXCEPTION 'invalid round phase';
  END IF;

  DELETE FROM public.round_hands WHERE round_id = p_round_id;

  INSERT INTO public.round_hands (
    room_id,
    round_id,
    position,
    owner_player_id,
    encrypted_hand,
    encrypted_iv,
    encrypted_tag,
    public_hand,
    is_revealed
  )
  SELECT
    p_room_id,
    p_round_id,
    (x ->> 'position')::VARCHAR(10),
    NULLIF(x ->> 'owner_player_id', '')::UUID,
    x ->> 'encrypted_hand',
    COALESCE(x ->> 'encrypted_iv', ''),
    COALESCE(x ->> 'encrypted_tag', ''),
    NULL,
    false
  FROM jsonb_array_elements(p_hands) AS x;

  UPDATE public.rounds
  SET
    phase = 'dealing',
    reveal_mode = NULL,
    all_revealed = false
  WHERE id = p_round_id;

  INSERT INTO public.round_operation_logs (room_id, round_id, operator_player_id, action_type, payload)
  VALUES (p_room_id, p_round_id, v_player_id, 'deal_start', jsonb_build_object('count', jsonb_array_length(p_hands)));

  RETURN QUERY SELECT true, 'dealing'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_round_deal_start(UUID, UUID, JSONB) TO authenticated;
