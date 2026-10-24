-- Amenidades y vista por habitación (información interna del POS; no va a Cloudbeds). Salen en las cotizaciones y en la hoja de la reserva.
ALTER TABLE public.hotel_habitaciones
  ADD COLUMN IF NOT EXISTS vista text,
  ADD COLUMN IF NOT EXISTS amenidades text[] NOT NULL DEFAULT '{}';
