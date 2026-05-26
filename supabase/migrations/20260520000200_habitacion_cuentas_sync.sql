CREATE TABLE IF NOT EXISTS public.habitacion_cuentas (
  id uuid PRIMARY KEY,
  mesa_id uuid NOT NULL,
  huesped text NOT NULL,
  cliente_id uuid,
  check_in date NOT NULL,
  check_out date,
  estado text NOT NULL DEFAULT 'activa',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  organization_id uuid NOT NULL
);

ALTER TABLE public.habitacion_cuentas
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_habitacion_cuentas_org
  ON public.habitacion_cuentas (organization_id);

CREATE INDEX IF NOT EXISTS idx_habitacion_cuentas_mesa
  ON public.habitacion_cuentas (mesa_id);

CREATE INDEX IF NOT EXISTS idx_habitacion_cuentas_estado
  ON public.habitacion_cuentas (estado);

ALTER TABLE public.habitacion_cuentas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for habitacion cuentas" ON public.habitacion_cuentas;
CREATE POLICY "Allow all for habitacion cuentas"
  ON public.habitacion_cuentas
  FOR ALL
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'habitacion_cuentas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.habitacion_cuentas;
  END IF;
END $$;
