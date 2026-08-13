-- comanda_items: anulación puntual de un ítem ya confirmado/enviado a
-- cocina (se acabó el insumo, error de cocina). El ítem nunca se borra —
-- queda visible tachado con su motivo, para trazabilidad. Espejo de
-- RxPago/RxVentaMovimiento (mismo patrón anulado/anulado_motivo/anulado_at/anulado_por).
ALTER TABLE public.comanda_items
  ADD COLUMN IF NOT EXISTS anulado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulado_motivo text,
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por uuid;

CREATE INDEX IF NOT EXISTS idx_comanda_items_anulado
  ON public.comanda_items (anulado);
