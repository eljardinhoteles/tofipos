-- Hotel: reservas de varias habitaciones que vienen de Cloudbeds (WhatsApp, Booking, motor de reservas).
-- Cloudbeds las guarda como UNA reserva con varias habitaciones, pero el POS maneja una cabaña por registro y solo permite
-- enlazar un código de Cloudbeds a un registro (índice único hotel_reservas_cloudbeds_idx). Al adoptar un grupo se crea un
-- registro por cabaña, todos con el mismo `grupo_id`, y el código de Cloudbeds se guarda aquí (SIN restricción de unicidad)
-- en vez de `cloudbeds_reservation_id`: así la sincronización 1 a 1 con Cloudbeds no los toca.
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS cloudbeds_grupo_ref text;

CREATE INDEX IF NOT EXISTS hotel_reservas_cloudbeds_grupo_ref_idx
  ON public.hotel_reservas (organization_id, cloudbeds_grupo_ref)
  WHERE cloudbeds_grupo_ref IS NOT NULL;
