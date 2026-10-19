-- Hotel: un plan de alimentación puede estar INCLUIDO en la tarifa (no se cobra aparte) o tener PRECIO (se cobra por adulto y por niño
-- por noche y se suma a la reserva como un extra que se recalcula con las fechas y los huéspedes). Los planes ya creados quedan como
-- incluidos, igual que se comportaban hasta ahora.
ALTER TABLE public.hotel_planes_alimentacion
  ADD COLUMN IF NOT EXISTS incluido boolean NOT NULL DEFAULT true;
