-- Hotel: tipo de cama. Cada habitación define la lista de camas que puede llevar (p. ej. «Matrimonial», «2 individuales») y cada
-- reserva guarda cuál se eligió. Es información interna del POS: no se sincroniza con Cloudbeds ni afecta la disponibilidad.
ALTER TABLE public.hotel_habitaciones
  ADD COLUMN IF NOT EXISTS camas jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS cama text;
