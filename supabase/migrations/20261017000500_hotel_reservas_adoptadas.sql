-- Hotel: reservas que ya existían en Cloudbeds y se «adoptan» para gestionarlas desde el POS.
--
-- Adoptar NO cambia nada en Cloudbeds: solo crea aquí un registro enlazado a la reserva existente (por su
-- `cloudbeds_reservation_id`, que es único). Así se pueden añadir extras, fijar una tarifa manual y, según la fuente,
-- cambiar fechas o cancelar.
--   adoptada        = true si no la creó el POS
--   fuente_nombre   = fuente en Cloudbeds (Walk-In, Booking.com…)
--   fuente_externa  = true si viene de un canal externo (en Cloudbeds su fuente empieza por «ss-»: Booking, Expedia…).
--                     Las fechas y la cancelación de esas las controla el canal, así que el POS no las modifica.
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS adoptada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fuente_nombre text,
  ADD COLUMN IF NOT EXISTS fuente_externa boolean NOT NULL DEFAULT false;
