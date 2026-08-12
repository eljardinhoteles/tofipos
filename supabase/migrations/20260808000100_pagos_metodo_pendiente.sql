-- Centro de Ventas: el checkout de Mesas ya no elige método de pago al
-- cerrar la cuenta (solo cobra el total y libera la mesa) — el método real
-- (efectivo/tarjeta/transferencia/otros) se define después, al anclar el
-- cobro en Centro de Ventas. Espejo de pagoSchema v3 en src/db/rxdb.ts.
--
-- metodo_pago pasa a ser nullable: null mientras metodo_definido es false.
-- No es un método adicional del enum, es la ausencia de definición.

ALTER TABLE public.pagos
  ALTER COLUMN metodo_pago DROP NOT NULL;

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS metodo_definido boolean NOT NULL DEFAULT true;

-- Los pagos existentes ya tenían método elegido en el momento del cobro
-- (flujo previo), así que quedan con metodo_definido=true por el DEFAULT
-- de arriba. Solo los pagos nuevos (desde el checkout ya simplificado)
-- nacerán con metodo_definido=false.

CREATE INDEX IF NOT EXISTS idx_pagos_metodo_definido
  ON public.pagos (metodo_definido);
