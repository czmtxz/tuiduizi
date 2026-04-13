WITH ranked AS (
  SELECT
    id,
    room_id,
    position,
    joined_at,
    ROW_NUMBER() OVER (
      PARTITION BY room_id, position
      ORDER BY joined_at ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY room_id, position
      ORDER BY joined_at ASC, id ASC
    ) AS keeper_id
  FROM public.players
  WHERE position IS NOT NULL
),
losers AS (
  SELECT room_id, position, id AS loser_id, keeper_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.rooms r
SET banker_id = l.keeper_id
FROM losers l
WHERE r.id = l.room_id
  AND l.position = 'banker'
  AND r.banker_id = l.loser_id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY room_id, position
      ORDER BY joined_at ASC, id ASC
    ) AS rn
  FROM public.players
  WHERE position IS NOT NULL
)
UPDATE public.players p
SET position = NULL
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_players_one_banker_per_room
ON public.players (room_id)
WHERE position = 'banker';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_players_unique_position_per_room
ON public.players (room_id, position)
WHERE position IS NOT NULL;
