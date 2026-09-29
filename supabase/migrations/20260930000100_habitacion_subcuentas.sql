-- Subcuentas de habitación: p. ej. una villa con 2 familias que llevan sus
-- consumos por separado. La cuenta principal es implícita
-- (comandas.habitacion_subcuenta_id NULL); las demás viven en
-- habitacion_cuentas.subcuentas como [{ "id": "...", "nombre": "..." }].
ALTER TABLE public.habitacion_cuentas
  ADD COLUMN IF NOT EXISTS subcuentas jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.comandas
  ADD COLUMN IF NOT EXISTS habitacion_subcuenta_id text;
