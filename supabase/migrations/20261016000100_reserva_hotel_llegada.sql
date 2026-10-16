-- Reserva de hotel: fecha de llegada y de salida en la venta, y vínculo de la cuenta de habitación con la venta de la
-- que viene. La llegada alimenta las tarjetas de «Llegadas» de Mesas › Hotel; el vínculo hace que la tarjeta
-- desaparezca cuando ya se abrió la cuenta (una venta abre una sola habitación).
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS llegada date,
  ADD COLUMN IF NOT EXISTS salida date;

ALTER TABLE public.habitacion_cuentas
  ADD COLUMN IF NOT EXISTS venta_id uuid;

CREATE INDEX IF NOT EXISTS idx_habitacion_cuentas_venta ON public.habitacion_cuentas (venta_id);
