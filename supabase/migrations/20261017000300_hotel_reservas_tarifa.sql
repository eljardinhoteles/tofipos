-- Hotel: tarifa del POS distinta a la de Cloudbeds (descuentos, cortesías).
--
-- Cloudbeds recibe SIEMPRE su tarifa estándar; el POS guarda y muestra la tarifa elegida:
--   total_estadia    = lo que el POS muestra y cobra (la de Cloudbeds o una manual)
--   total_cloudbeds  = lo que Cloudbeds tiene registrado (referencia)
--   tarifa_manual    = true cuando total_estadia se fijó a mano y ya no sigue a Cloudbeds
-- El desfase entre ambos es aceptado: lo que debe coincidir siempre es la ocupación y la disponibilidad.
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS total_cloudbeds numeric(12, 2),
  ADD COLUMN IF NOT EXISTS tarifa_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tarifa_motivo text;

-- Las reservas anteriores usaban la tarifa de Cloudbeds tal cual.
UPDATE public.hotel_reservas SET total_cloudbeds = total_estadia WHERE total_cloudbeds IS NULL;
