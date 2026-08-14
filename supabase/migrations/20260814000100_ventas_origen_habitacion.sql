-- Agrega 'habitacion' al enum de origen: faltaba la vía de cobro del
-- checkout de habitación (Mesas → Habitaciones → Cobrar), que hasta ahora
-- cerraba la comanda sin crear el registro de venta correspondiente, por
-- lo que esos cobros nunca aparecían en Centro de Ventas. Espejo del
-- enum RxDB (ventaSchema v5, ver src/db/rxdb.ts).
ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ventas_origen_check;
ALTER TABLE public.ventas ADD CONSTRAINT ventas_origen_check
  CHECK (origen IN ('mesa', 'reserva_restaurante', 'reserva_hotel', 'habitacion'));
