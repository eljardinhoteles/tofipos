-- Hotel: una venta del Centro de Ventas puede cubrir varias cabañas (reserva de grupo), así que venta_id NO debe ser único.
-- La migración 20261018000100 lo declara como índice normal, pero `IF NOT EXISTS` conservó un índice ÚNICO con el mismo nombre
-- que ya existía en la base: la segunda cabaña de un grupo fallaba con «duplicate key value violates unique constraint
-- hotel_reservas_venta_idx» y quedaba sin enlazar. Se recrea como índice normal (no cambia ningún dato).
DROP INDEX IF EXISTS public.hotel_reservas_venta_idx;
CREATE INDEX hotel_reservas_venta_idx
  ON public.hotel_reservas (venta_id)
  WHERE venta_id IS NOT NULL;
