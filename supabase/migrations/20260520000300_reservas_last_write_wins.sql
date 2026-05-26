ALTER TABLE public.reservas
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_reservas_org_updated
  ON public.reservas (organization_id, updated_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reservas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservas;
  END IF;
END $$;
