ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS bet_step INTEGER NOT NULL DEFAULT 50,
ADD COLUMN IF NOT EXISTS touzi_min_bet INTEGER NOT NULL DEFAULT 50,
ADD COLUMN IF NOT EXISTS touzi_max_bet INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN IF NOT EXISTS cha_min_bet INTEGER NOT NULL DEFAULT 50,
ADD COLUMN IF NOT EXISTS cha_max_bet INTEGER NOT NULL DEFAULT 1000;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_bet_step_positive'
  ) THEN
    ALTER TABLE public.rooms
    ADD CONSTRAINT rooms_bet_step_positive
    CHECK (bet_step > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_touzi_bet_range'
  ) THEN
    ALTER TABLE public.rooms
    ADD CONSTRAINT rooms_touzi_bet_range
    CHECK (touzi_min_bet > 0 AND touzi_max_bet >= touzi_min_bet);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_cha_bet_range'
  ) THEN
    ALTER TABLE public.rooms
    ADD CONSTRAINT rooms_cha_bet_range
    CHECK (cha_min_bet > 0 AND cha_max_bet >= cha_min_bet);
  END IF;
END $$;
