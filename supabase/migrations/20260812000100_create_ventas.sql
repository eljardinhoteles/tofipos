-- Centro de Ventas v2: modelo "Venta" — reemplaza el enfoque de pago/cobro
-- atómico e inmutable (pagos, cobros_reserva) por una unidad de negocio
-- (la venta) con un historial de movimientos. El monto total, el saldo y el
-- estado (anclado/facturado/anulado) se derivan sumando/inspeccionando los
-- movimientos, nunca son campos editados directo — así "aumentar", "pagar
-- parcial", "reembolsar" y "cambiar de estado" quedan todos trazables con
-- su propia fecha, en vez de flags sueltos sobre un monto fijo.
--
-- Las tablas pagos/cobros_reserva NO se tocan ni se migran: su histórico
-- queda intacto. Desde esta migración en adelante, todo cobro nuevo
-- (Mesas, Reservas, Centro de Ventas) crea una venta.
CREATE TABLE IF NOT EXISTS public.ventas (
  id uuid PRIMARY KEY,
  -- 'mesa' | 'reserva_restaurante' | 'reserva_hotel' | 'credito_corporativo'
  origen text NOT NULL,
  cliente_id uuid,
  -- Nombre libre cuando no hay cliente_id (comanda.cliente texto libre,
  -- huésped de reserva de hotel escrito a mano, etc.)
  cliente_nombre text,
  -- Descripción visible en la lista: "Mesa 3 · #45", "Reserva · Juan Pérez",
  -- "Reserva de hotel — María López", etc. Se fija al crear la venta.
  referencia text,
  -- Vínculo opcional al origen real cuando existe (comanda_id de Mesas).
  comanda_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid,
  organization_id uuid NOT NULL,
  _deleted boolean NOT NULL DEFAULT false,
  _modified timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_org ON public.ventas (organization_id);
CREATE INDEX IF NOT EXISTS idx_ventas_org_modified ON public.ventas (organization_id, _modified);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON public.ventas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_comanda ON public.ventas (comanda_id);
CREATE INDEX IF NOT EXISTS idx_ventas_origen ON public.ventas (origen);

ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for ventas" ON public.ventas;
CREATE POLICY "Allow all for ventas"
  ON public.ventas
  FOR ALL
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ventas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ventas;
  END IF;
END $$;

-- Historial de movimientos de una venta. Cada fila es un evento inmutable
-- con su propia fecha — nunca se edita, solo se agregan más.
CREATE TABLE IF NOT EXISTS public.venta_movimientos (
  id uuid PRIMARY KEY,
  venta_id uuid NOT NULL,
  -- 'ajuste'   → +/- al monto total (la venta inicial es un ajuste positivo)
  -- 'pago'     → abono contra el saldo pendiente
  -- 'reembolso'→ devolución total o parcial de lo ya pagado
  -- 'anclar'   → conciliación de caja/banco (sin monto)
  -- 'facturar' → conciliación contable, requiere numero_factura (sin monto)
  -- 'anular'   → la venta nunca debió contar (sin monto)
  tipo text NOT NULL,
  monto numeric(12, 2),
  metodo_pago text,
  -- 'efectivo' | 'tarjeta' | 'transferencia' | 'credito_agencia' | 'otros' | null
  tarjeta_red text,
  transferencia_banco text,
  transferencia_referencia text,
  motivo text,
  numero_factura text,
  comprobante_url text,
  fecha timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid,
  organization_id uuid NOT NULL,
  _deleted boolean NOT NULL DEFAULT false,
  _modified timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venta_movimientos_org ON public.venta_movimientos (organization_id);
CREATE INDEX IF NOT EXISTS idx_venta_movimientos_org_modified ON public.venta_movimientos (organization_id, _modified);
CREATE INDEX IF NOT EXISTS idx_venta_movimientos_venta ON public.venta_movimientos (venta_id);
CREATE INDEX IF NOT EXISTS idx_venta_movimientos_tipo ON public.venta_movimientos (tipo);

ALTER TABLE public.venta_movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for venta_movimientos" ON public.venta_movimientos;
CREATE POLICY "Allow all for venta_movimientos"
  ON public.venta_movimientos
  FOR ALL
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'venta_movimientos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.venta_movimientos;
  END IF;
END $$;
