-- Hotel: notas de la reserva. Lista de notas cortas [{ id, texto, extra_id?, extra?, fecha, usuario }] dentro de la propia reserva
-- (igual que los extras y el historial): sirven para organizar actividades (horario de un tour), avisar una alergia, etc. Cada nota
-- puede ir ligada a un extra o ser general. Es información interna del POS: no se sincroniza con Cloudbeds.
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS notas_items jsonb NOT NULL DEFAULT '[]'::jsonb;
