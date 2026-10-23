-- Registro de mascotas por reserva: { tipo, tamano, comentario? }. NULL = sin mascota. Es solo del POS (no va a Cloudbeds).
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS mascota jsonb;
