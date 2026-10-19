-- Hotel: historial de cambios de cada reserva (creada, fechas, tarifa, extras, datos del cliente, conciliación, cancelación…).
-- Es una lista de eventos [{ id, fecha, tipo, texto, usuario }] dentro de la propia reserva (igual que los extras): sin tabla
-- nueva. Se agrega siempre al final y nunca se edita. Si la migración no se ha ejecutado, la página funciona sin historial.
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS historial jsonb NOT NULL DEFAULT '[]'::jsonb;
