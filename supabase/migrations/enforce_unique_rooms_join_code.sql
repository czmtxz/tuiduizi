WITH ranked AS (
  SELECT
    id,
    join_code,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY join_code
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.rooms
  WHERE join_code IS NOT NULL
    AND join_code <> ''
),
dupes AS (
  SELECT id, join_code
  FROM ranked
  WHERE rn > 1
)
UPDATE public.rooms r
SET
  join_code = r.join_code || '_' || SUBSTRING(r.id::text, 1, 4),
  status = CASE WHEN r.status = 'playing' THEN 'finished' ELSE r.status END
FROM dupes d
WHERE r.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_rooms_join_code
ON public.rooms (join_code);

