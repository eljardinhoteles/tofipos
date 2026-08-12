-- Centro de Ventas: "Registrar Anticipo de Reserva" pasa a ser "Registrar
-- Transacción" — se agregan metadatos opcionales de contexto, visibles para
-- cualquier tipo de transacción (no solo reservas de hotel). Espejo de
-- cobroReservaSchema v3 en src/db/rxdb.ts.

ALTER TABLE public.cobros_reserva
  ADD COLUMN IF NOT EXISTS check_in date,
  ADD COLUMN IF NOT EXISTS check_out date,
  ADD COLUMN IF NOT EXISTS descripcion text;
