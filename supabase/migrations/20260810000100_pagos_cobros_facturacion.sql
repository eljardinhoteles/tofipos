-- Centro de Ventas: 3er check de estado — conciliación con número de
-- factura del sistema contable externo, independiente del anclaje de
-- comprobante (2do check). Espejo de pagoSchema v5 / cobroReservaSchema v4
-- en src/db/rxdb.ts.

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS facturado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS numero_factura text,
  ADD COLUMN IF NOT EXISTS facturado_at timestamptz,
  ADD COLUMN IF NOT EXISTS facturado_por text;

ALTER TABLE public.cobros_reserva
  ADD COLUMN IF NOT EXISTS facturado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS numero_factura text,
  ADD COLUMN IF NOT EXISTS facturado_at timestamptz,
  ADD COLUMN IF NOT EXISTS facturado_por text;
