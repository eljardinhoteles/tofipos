-- Hotel: una reserva de Cloudbeds solo puede estar enlazada UNA vez por organización (no en todo el sistema). Antes el índice era
-- global: adoptar una reserva en la organización de prueba impedía adoptarla en la real, porque las dos ven la misma cuenta de
-- Cloudbeds.
DROP INDEX IF EXISTS public.hotel_reservas_cloudbeds_idx;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_reservas_cloudbeds_idx
  ON public.hotel_reservas (organization_id, cloudbeds_reservation_id)
  WHERE cloudbeds_reservation_id IS NOT NULL;
