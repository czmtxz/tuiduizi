CREATE TABLE IF NOT EXISTS public.round_hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  position VARCHAR(10) NOT NULL CHECK (position IN ('banker', 'chumen', 'zhongmen', 'momen')),
  owner_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  encrypted_hand TEXT NOT NULL,
  encrypted_iv TEXT NOT NULL,
  encrypted_tag TEXT NOT NULL,
  public_hand JSONB,
  is_revealed BOOLEAN NOT NULL DEFAULT false,
  revealed_at TIMESTAMPTZ,
  revealed_by UUID REFERENCES public.players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, position)
);

CREATE TABLE IF NOT EXISTS public.round_operation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  operator_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'dice_done',
      'deal_start',
      'deal_finish',
      'reveal_single',
      'reveal_batch',
      'reveal_self',
      'settle_start',
      'settle_finish'
    )
  ),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rounds
ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'betting',
ADD COLUMN IF NOT EXISTS dealer_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reveal_mode TEXT,
ADD COLUMN IF NOT EXISTS all_revealed BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS dealt_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reveal_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rounds_phase_check'
  ) THEN
    ALTER TABLE public.rounds
    ADD CONSTRAINT rounds_phase_check
    CHECK (phase IN ('betting', 'dice_done', 'dealing', 'wait_reveal', 'revealing', 'settling', 'settled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rounds_reveal_mode_check'
  ) THEN
    ALTER TABLE public.rounds
    ADD CONSTRAINT rounds_reveal_mode_check
    CHECK (reveal_mode IS NULL OR reveal_mode IN ('single', 'batch'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rounds_room_phase ON public.rounds(room_id, phase);
CREATE INDEX IF NOT EXISTS idx_rounds_room_round_number ON public.rounds(room_id, round_number);
CREATE INDEX IF NOT EXISTS idx_round_hands_round_id ON public.round_hands(round_id);
CREATE INDEX IF NOT EXISTS idx_round_hands_room_id ON public.round_hands(room_id);
CREATE INDEX IF NOT EXISTS idx_round_hands_revealed ON public.round_hands(round_id, is_revealed);
CREATE INDEX IF NOT EXISTS idx_round_logs_room_created ON public.round_operation_logs(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_round_logs_round_created ON public.round_operation_logs(round_id, created_at DESC);

ALTER TABLE public.round_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_operation_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'round_operation_logs' AND policyname = 'Room Members Read Logs'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Room Members Read Logs"
      ON public.round_operation_logs
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.players p
          WHERE p.room_id = round_operation_logs.room_id
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

CREATE OR REPLACE VIEW public.vw_round_hands_public AS
SELECT
  room_id,
  round_id,
  position,
  is_revealed,
  public_hand,
  revealed_at
FROM public.round_hands;

GRANT SELECT ON public.vw_round_hands_public TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_get_round_hands_public(p_round_id UUID)
RETURNS TABLE (
  room_id UUID,
  round_id UUID,
  "position" TEXT,
  is_revealed BOOLEAN,
  public_hand JSONB,
  revealed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
BEGIN
  SELECT r.room_id INTO v_room_id
  FROM public.rounds r
  WHERE r.id = p_round_id;

  IF v_room_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.room_id = v_room_id
      AND p.user_id = auth.uid()
      AND p.is_active = true
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.admin_emails a
    WHERE a.email = (auth.jwt() ->> 'email')
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  SELECT
    h.room_id,
    h.round_id,
    h.position::TEXT,
    h.is_revealed,
    h.public_hand,
    h.revealed_at
  FROM public.round_hands h
  WHERE h.round_id = p_round_id
  ORDER BY CASE h.position
    WHEN 'banker' THEN 1
    WHEN 'chumen' THEN 2
    WHEN 'zhongmen' THEN 3
    WHEN 'momen' THEN 4
    ELSE 99
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_get_my_round_hand(p_round_id UUID)
RETURNS TABLE (
  room_id UUID,
  round_id UUID,
  "position" TEXT,
  owner_player_id UUID,
  encrypted_hand TEXT,
  encrypted_iv TEXT,
  encrypted_tag TEXT,
  public_hand JSONB,
  is_revealed BOOLEAN,
  revealed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  RETURN QUERY
  SELECT
    h.room_id,
    h.round_id,
    h.position::TEXT,
    h.owner_player_id,
    h.encrypted_hand,
    h.encrypted_iv,
    h.encrypted_tag,
    h.public_hand,
    h.is_revealed,
    h.revealed_at
  FROM public.round_hands h
  JOIN public.players p ON p.id = h.owner_player_id
  WHERE h.round_id = p_round_id
    AND p.user_id = v_user_id
    AND p.is_active = true
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_round_hands_public(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_my_round_hand(UUID) TO authenticated;

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
  v_is_banker BOOLEAN := false;
BEGIN
  SELECT p.id, (p.role = 'banker' AND p.position = 'banker' AND p.is_active = true)
  INTO v_player_id, v_is_banker
  FROM public.players p
  WHERE p.room_id = p_room_id
    AND p.user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL OR NOT v_is_banker THEN
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

  UPDATE public.rounds
  SET phase = 'wait_reveal', dealt_at = NOW()
  WHERE id = p_round_id
    AND phase = 'dealing';

  INSERT INTO public.round_operation_logs (room_id, round_id, operator_player_id, action_type, payload)
  VALUES (v_room_id, p_round_id, v_player_id, 'deal_finish', '{}'::jsonb);

  RETURN QUERY SELECT true, 'wait_reveal'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_round_reveal_single(
  p_round_id UUID,
  p_position TEXT
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
  v_all_revealed BOOLEAN;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.rounds r
    WHERE r.id = p_round_id
      AND r.phase IN ('wait_reveal', 'revealing')
  ) THEN
    RAISE EXCEPTION 'invalid round phase';
  END IF;

  UPDATE public.round_hands
  SET
    public_hand = convert_from(decode(encrypted_hand, 'base64'), 'UTF8')::jsonb,
    is_revealed = true,
    revealed_at = NOW(),
    revealed_by = v_player_id,
    updated_at = NOW()
  WHERE round_id = p_round_id
    AND position = p_position
    AND is_revealed = false;

  UPDATE public.rounds
  SET
    phase = 'revealing',
    reveal_mode = COALESCE(reveal_mode, 'single'),
    reveal_started_at = COALESCE(reveal_started_at, NOW())
  WHERE id = p_round_id;

  INSERT INTO public.round_operation_logs (room_id, round_id, operator_player_id, action_type, payload)
  VALUES (v_room_id, p_round_id, v_player_id, 'reveal_single', jsonb_build_object('position', p_position));

  SELECT COUNT(*) = 4 INTO v_all_revealed
  FROM public.round_hands
  WHERE round_id = p_round_id
    AND is_revealed = true;

  UPDATE public.rounds
  SET all_revealed = v_all_revealed
  WHERE id = p_round_id;

  RETURN QUERY SELECT true, 'revealing'::TEXT, v_all_revealed, p_position;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_round_reveal_batch(
  p_round_id UUID,
  p_positions TEXT[]
)
RETURNS TABLE (
  ok BOOLEAN,
  phase TEXT,
  all_revealed BOOLEAN,
  revealed_positions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
  v_player_id UUID;
  v_all_revealed BOOLEAN;
BEGIN
  IF array_length(p_positions, 1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'batch reveal requires 3 positions';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_positions) AS x WHERE x = 'banker') THEN
    RAISE EXCEPTION 'banker cannot be in batch reveal';
  END IF;

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

  UPDATE public.round_hands
  SET
    public_hand = convert_from(decode(encrypted_hand, 'base64'), 'UTF8')::jsonb,
    is_revealed = true,
    revealed_at = NOW(),
    revealed_by = v_player_id,
    updated_at = NOW()
  WHERE round_id = p_round_id
    AND position = ANY (p_positions)
    AND is_revealed = false;

  UPDATE public.rounds
  SET
    phase = 'revealing',
    reveal_mode = 'batch',
    reveal_started_at = COALESCE(reveal_started_at, NOW())
  WHERE id = p_round_id;

  INSERT INTO public.round_operation_logs (room_id, round_id, operator_player_id, action_type, payload)
  VALUES (v_room_id, p_round_id, v_player_id, 'reveal_batch', jsonb_build_object('positions', to_jsonb(p_positions)));

  SELECT COUNT(*) = 4 INTO v_all_revealed
  FROM public.round_hands
  WHERE round_id = p_round_id
    AND is_revealed = true;

  UPDATE public.rounds
  SET all_revealed = v_all_revealed
  WHERE id = p_round_id;

  RETURN QUERY SELECT true, 'revealing'::TEXT, v_all_revealed, p_positions;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_round_reveal_self(p_round_id UUID)
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
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.rpc_round_reveal_single(p_round_id, 'banker');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_round_settle(
  p_round_id UUID,
  p_winner_result JSONB
)
RETURNS JSONB
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

  INSERT INTO public.round_operation_logs (room_id, round_id, operator_player_id, action_type, payload)
  VALUES (v_room_id, p_round_id, v_player_id, 'settle_start', '{}'::jsonb);

  UPDATE public.rounds
  SET
    winner_result = p_winner_result,
    phase = 'settled',
    all_revealed = true,
    settled_at = NOW()
  WHERE id = p_round_id;

  INSERT INTO public.round_operation_logs (room_id, round_id, operator_player_id, action_type, payload)
  VALUES (v_room_id, p_round_id, v_player_id, 'settle_finish', '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'phase', 'settled');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_round_deal_start(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_round_deal_finish(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_round_reveal_single(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_round_reveal_batch(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_round_reveal_self(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_round_settle(UUID, JSONB) TO authenticated;
