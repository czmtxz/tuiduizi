ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS voice_provider TEXT NOT NULL DEFAULT 'auto';

UPDATE public.app_settings
SET voice_provider = COALESCE(NULLIF(voice_provider, ''), 'auto')
WHERE id = 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_settings_voice_provider_check'
  ) THEN
    ALTER TABLE public.app_settings
    ADD CONSTRAINT app_settings_voice_provider_check
    CHECK (voice_provider IN ('auto', 'agora', 'livekit', 'browser'));
  END IF;
END $$;

