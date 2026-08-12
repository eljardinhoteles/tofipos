-- Centro de Ventas: cobros de reserva de hotel (anticipos, pagos totales,
-- créditos de agencia). Separada de `pagos` porque una reserva no tiene
-- comanda propia al momento de cobrar el anticipo. Replica vía RxDB
-- (rxdb-supabase), por eso necesita las columnas _deleted/_modified que
-- el plugin usa como campo de borrado lógico y checkpoint respectivamente.
CREATE TABLE IF NOT EXISTS public.cobros_reserva (
  id uuid PRIMARY KEY,
  reserva_id text NOT NULL,
  cliente_id uuid,
  monto numeric(12, 2) NOT NULL,
  metodo_pago text NOT NULL DEFAULT 'efectivo',
  -- 'efectivo' | 'tarjeta' | 'transferencia' | 'credito_agencia' | 'otros'
  tipo text NOT NULL DEFAULT 'anticipo',
  -- 'anticipo' | 'pago_total' | 'credito'
  tarjeta_red text,
  transferencia_banco text,
  transferencia_referencia text,
  fecha timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid,
  anclado boolean NOT NULL DEFAULT false,
  anclado_at timestamptz,
  anclado_por uuid,
  organization_id uuid NOT NULL,
  _deleted boolean NOT NULL DEFAULT false,
  _modified timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobros_reserva_org
  ON public.cobros_reserva (organization_id);

CREATE INDEX IF NOT EXISTS idx_cobros_reserva_reserva
  ON public.cobros_reserva (reserva_id);

CREATE INDEX IF NOT EXISTS idx_cobros_reserva_cliente
  ON public.cobros_reserva (cliente_id);

CREATE INDEX IF NOT EXISTS idx_cobros_reserva_org_modified
  ON public.cobros_reserva (organization_id, _modified);

CREATE INDEX IF NOT EXISTS idx_cobros_reserva_anclado
  ON public.cobros_reserva (anclado);

ALTER TABLE public.cobros_reserva ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for cobros_reserva" ON public.cobros_reserva;
CREATE POLICY "Allow all for cobros_reserva"
  ON public.cobros_reserva
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
      AND tablename = 'cobros_reserva'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cobros_reserva;
  END IF;
END $$;
