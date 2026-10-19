-- Hotel: conciliación de una reserva con el Centro de Ventas y con la ficha del cliente.
--
-- Al adoptar una reserva de Cloudbeds se puede enlazar (a mano, 1 a 1) con:
--   venta_id   = la venta `reserva_hotel` del Centro de Ventas donde se registran sus cobros. Los pagos viven SOLO en esa
--                venta: Cloudbeds y Ventas no se cruzan y los saldos no se sincronizan.
--   cliente_id = la ficha del cliente del POS (tabla `clientes`) con los datos del huésped unificados.
-- Ambos son opcionales (NULL = sin enlazar todavía). Son texto, igual que los id de `ventas` y `clientes`.
-- Una venta puede cubrir varias cabañas (un solo pagador para un grupo), por eso venta_id no es único.
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS venta_id text,
  ADD COLUMN IF NOT EXISTS cliente_id text;

CREATE INDEX IF NOT EXISTS hotel_reservas_venta_idx
  ON public.hotel_reservas (venta_id)
  WHERE venta_id IS NOT NULL;
