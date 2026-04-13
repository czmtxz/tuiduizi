CREATE TABLE IF NOT EXISTS public.admin_emails (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_emails' AND policyname='Admin Self Read') THEN
    EXECUTE 'CREATE POLICY "Admin Self Read" ON public.admin_emails FOR SELECT USING ((auth.jwt() ->> ''email'') = email OR (auth.jwt() ->> ''email'') = ''89348464@qq.com'')';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_emails' AND policyname='Super Admin Manage') THEN
    EXECUTE 'CREATE POLICY "Super Admin Manage" ON public.admin_emails FOR ALL USING ((auth.jwt() ->> ''email'') = ''89348464@qq.com'') WITH CHECK ((auth.jwt() ->> ''email'') = ''89348464@qq.com'')';
  END IF;
END $$;
