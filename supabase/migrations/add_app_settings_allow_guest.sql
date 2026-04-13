CREATE TABLE IF NOT EXISTS public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  allow_guest BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id = 1) THEN
    INSERT INTO public.app_settings (id, allow_guest) VALUES (1, true);
  END IF;
END $$;

CREATE POLICY "Public Read App Settings" ON public.app_settings
  FOR SELECT
  USING (true);

CREATE POLICY "Admin Update App Settings" ON public.app_settings
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'email') = '89348464@qq.com'
    OR EXISTS (
      SELECT 1 FROM public.admin_emails a
      WHERE a.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = '89348464@qq.com'
    OR EXISTS (
      SELECT 1 FROM public.admin_emails a
      WHERE a.email = (auth.jwt() ->> 'email')
    )
  );

