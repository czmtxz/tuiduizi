CREATE OR REPLACE FUNCTION public.cleanup_inactive_rooms()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  WITH candidates AS (
    SELECT
      r.id,
      GREATEST(
        COALESCE(r.updated_at, r.created_at),
        COALESCE((SELECT MAX(p.updated_at) FROM public.players p WHERE p.room_id = r.id AND p.is_active = true), 'epoch'::timestamptz),
        COALESCE((SELECT MAX(m.created_at) FROM public.room_messages m WHERE m.room_id = r.id), 'epoch'::timestamptz),
        COALESCE((SELECT MAX(ro.created_at) FROM public.rounds ro WHERE ro.room_id = r.id), 'epoch'::timestamptz),
        COALESCE((
          SELECT MAX(b.placed_at)
          FROM public.bets b
          JOIN public.rounds ro2 ON ro2.id = b.round_id
          WHERE ro2.room_id = r.id
        ), 'epoch'::timestamptz),
        COALESCE((SELECT MAX(i.created_at) FROM public.room_invites i WHERE i.room_id = r.id), 'epoch'::timestamptz)
      ) AS last_activity
    FROM public.rooms r
    WHERE r.status IN ('waiting', 'playing')
  ), to_delete AS (
    SELECT id
    FROM candidates
    WHERE last_activity < (NOW() - INTERVAL '5 minutes')
  ), deleted AS (
    DELETE FROM public.rooms r
    USING to_delete d
    WHERE r.id = d.id
    RETURNING r.id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;
