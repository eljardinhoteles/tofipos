-- Hotel: reservas de varias cabañas como GRUPO en el POS, cada una independiente en Cloudbeds.
--
-- Cada cabaña es su propia fila (su propio id, código de Cloudbeds, tarifa y estado de sincronización): se puede
-- cancelar o cambiar una sola. `grupo_id` solo las enlaza entre sí en el POS. `grupo_etiqueta` es el texto que se
-- añade al apellido del huésped que se envía a Cloudbeds ("Grupo - CJ1,CP4,V10"), para encontrarlas allá también.
-- Las reservas de una sola cabaña dejan ambas columnas en NULL.
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS grupo_id uuid,
  ADD COLUMN IF NOT EXISTS grupo_etiqueta text;

CREATE INDEX IF NOT EXISTS hotel_reservas_grupo_idx
  ON public.hotel_reservas (organization_id, grupo_id)
  WHERE grupo_id IS NOT NULL;
