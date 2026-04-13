CREATE OR REPLACE FUNCTION public.rpc_round_deal_finish(p_round_id UUID)
RETURNS TABLE (
  ok BOOLEAN,
  phase TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
  v_player_id UUID;
BEGIN
  SELECT r.room_id INTO v_room_id FROM public.rounds r WHERE r.id = p_round_id;
  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'round not found';
  END IF;

  SELECT p.id INTO v_player_id
  FROM public.players p
  WHERE p.room_id = v_room_id
    AND p.user_id = auth.uid()
    AND p.role = 'banker'
    AND p.position = 'banker'
    AND p.is_active = true
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.rounds r
  SET phase = 'wait_reveal', dealt_at = NOW()
  WHERE r.id = p_round_id
    AND r.phase = 'dealing';

  INSERT INTO public.round_operation_logs (room_id, round_id, operator_player_id, action_type, payload)
  VALUES (v_room_id, p_round_id, v_player_id, 'deal_finish', '{}'::jsonb);

  RETURN QUERY SELECT true, 'wait_reveal'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_round_deal_finish(UUID) TO authenticated;

