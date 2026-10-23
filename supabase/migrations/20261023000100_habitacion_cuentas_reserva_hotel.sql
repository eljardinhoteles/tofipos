-- Mesas › Habitaciones: la cuenta de una habitación guarda la reserva del Hotel de la que viene (una cuenta por habitación reservada).
-- Antes solo se enlazaba por `venta_id`, y una venta de grupo abre una sola habitación. Opcional: las cuentas existentes no cambian
-- (siguen sin reserva enlazada) y la app anterior ignora la columna. Se ejecuta ANTES de publicar la versión que la escribe.
ALTER TABLE public.habitacion_cuentas
  ADD COLUMN IF NOT EXISTS reserva_hotel_id text;

CREATE INDEX IF NOT EXISTS habitacion_cuentas_reserva_hotel_idx
  ON public.habitacion_cuentas (organization_id, reserva_hotel_id)
  WHERE reserva_hotel_id IS NOT NULL;
