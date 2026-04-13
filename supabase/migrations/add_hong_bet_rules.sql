ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS allow_hong BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS hong_min_bet INTEGER NOT NULL DEFAULT 50,
ADD COLUMN IF NOT EXISTS hong_max_bet INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE rooms
DROP CONSTRAINT IF EXISTS rooms_hong_bet_range_check;

ALTER TABLE rooms
ADD CONSTRAINT rooms_hong_bet_range_check
CHECK (
  hong_min_bet > 0
  AND hong_max_bet >= hong_min_bet
  AND (NOT allow_hong OR (hong_min_bet <= max_bet AND hong_max_bet <= max_bet))
);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.bets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%bet_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.bets DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.bets
ADD CONSTRAINT bets_bet_type_check
CHECK (bet_type IN ('touzi', 'liangdao', 'sandao', 'cha', 'duizi', 'hong'));
