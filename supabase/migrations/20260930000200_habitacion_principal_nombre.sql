-- Nombre editable de la subcuenta "Principal" de una habitación.
-- NULL = se muestra "Principal".
ALTER TABLE public.habitacion_cuentas
  ADD COLUMN IF NOT EXISTS principal_nombre text;
