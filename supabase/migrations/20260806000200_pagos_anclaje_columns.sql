-- Centro de Ventas: columnas de detalle de comprobante y anclaje para
-- `pagos`, espejo de la extensión de pagoSchema en RxDB (src/db/rxdb.ts).
-- Se completan después del cobro, en la pestaña "Anclar Pendientes" — no en
-- el checkout, para no interrumpir el servicio en el punto de venta.
ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS tarjeta_red text,
  ADD COLUMN IF NOT EXISTS transferencia_banco text,
  ADD COLUMN IF NOT EXISTS transferencia_referencia text,
  ADD COLUMN IF NOT EXISTS anclado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anclado_at timestamptz,
  ADD COLUMN IF NOT EXISTS anclado_por uuid;

CREATE INDEX IF NOT EXISTS idx_pagos_anclado
  ON public.pagos (anclado);

CREATE INDEX IF NOT EXISTS idx_pagos_metodo_pago
  ON public.pagos (metodo_pago);
