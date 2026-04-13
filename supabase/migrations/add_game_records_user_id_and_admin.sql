ALTER TABLE public.game_records
ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS idx_game_records_user_id_created_at
ON public.game_records(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_users' AND policyname='Admin Self Read') THEN
    EXECUTE 'CREATE POLICY "Admin Self Read" ON public.admin_users FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;
