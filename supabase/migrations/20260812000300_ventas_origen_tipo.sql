-- Separa el antiguo `origen` de 4 valores (mesa, reserva_restaurante,
-- reserva_hotel, credito_corporativo) en dos campos independientes:
--   origen: de dónde sale la venta   → 'mesa' | 'reserva_restaurante' | 'reserva_hotel'
--   tipo:   cómo se cobra            → 'directa' | 'credito'
-- Cualquier combinación es válida (ej. una mesa puede cobrarse directa o
-- quedar a crédito corporativo) — antes 'credito_corporativo' vivía
-- mezclado como un origen más, impidiendo esa combinación.
--
-- La tabla ventas nunca llegó a recibir datos reales (el desarrollo se
-- frenó por el límite de colecciones de RxDB antes del primer insert
-- exitoso), así que no hace falta migrar filas existentes.
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'directa';

-- Sin datos reales que migrar: se puede angostar el enum de origen
-- directamente. Si alguna fila quedara con 'credito_corporativo' (no
-- debería, ver comentario arriba), se reclasifica a origen='mesa' +
-- tipo='credito' antes del constraint, para no perder el registro.
UPDATE public.ventas SET tipo = 'credito', origen = 'mesa' WHERE origen = 'credito_corporativo';

ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ventas_origen_check;
ALTER TABLE public.ventas ADD CONSTRAINT ventas_origen_check
  CHECK (origen IN ('mesa', 'reserva_restaurante', 'reserva_hotel'));

ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ventas_tipo_check;
ALTER TABLE public.ventas ADD CONSTRAINT ventas_tipo_check
  CHECK (tipo IN ('directa', 'credito'));

CREATE INDEX IF NOT EXISTS idx_ventas_tipo ON public.ventas (tipo);
