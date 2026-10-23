-- Hotel: soporte de DOS modelos de inventario de Cloudbeds.
--   Modelo A (el actual): cada cabaña es un tipo de habitación con UNA unidad  → `cloudbeds_room_id` queda NULL.
--   Modelo B: un tipo de habitación con VARIAS unidades (Matrimonial #2, #4, #5, #11) → una habitación del POS por unidad,
--             con su `cloudbeds_room_id` (el `roomID` de Cloudbeds, p. ej. «214003459350720-2»).
-- Las filas y reservas existentes no cambian: sin unidad se comportan como siempre.

ALTER TABLE public.hotel_habitaciones
  ADD COLUMN IF NOT EXISTS cloudbeds_room_id text;

-- Antes: un tipo → una habitación. Ahora: una habitación sin unidad por tipo (modelo A) y una habitación por unidad (modelo B).
DROP INDEX IF EXISTS public.hotel_habitaciones_cloudbeds_idx;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_habitaciones_tipo_sin_unidad_idx
  ON public.hotel_habitaciones (organization_id, cloudbeds_room_type_id)
  WHERE cloudbeds_room_type_id IS NOT NULL AND cloudbeds_room_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_habitaciones_unidad_idx
  ON public.hotel_habitaciones (organization_id, cloudbeds_room_type_id, cloudbeds_room_id)
  WHERE cloudbeds_room_id IS NOT NULL;

-- La reserva guarda la unidad (roomID de Cloudbeds) donde está alojada; NULL = modelo A (la única unidad del tipo).
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS room_id text;

CREATE INDEX IF NOT EXISTS hotel_reservas_unidad_idx
  ON public.hotel_reservas (organization_id, room_type_id, room_id);
