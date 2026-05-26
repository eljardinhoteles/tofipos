ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.pagos
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_clientes_org_updated
  ON public.clientes (organization_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_pagos_org_updated
  ON public.pagos (organization_id, updated_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'clientes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pagos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pagos;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'comanda_item_deletes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comanda_item_deletes;
  END IF;
END $$;
