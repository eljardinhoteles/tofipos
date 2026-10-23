-- Hotel › Habitaciones: enlace opcional con la habitación de Mesas (la mesa del piso «Habitaciones» donde se abre su cuenta).
-- Va del lado del Hotel a propósito: las mesas y sus cuentas, comandas y tickets no se tocan. Con el enlace, al elegir una llegada en
-- Mesas se sugiere la habitación asignada (el personal puede abrir otra). Una mesa solo puede estar enlazada a una habitación.
ALTER TABLE public.hotel_habitaciones
  ADD COLUMN IF NOT EXISTS mesa_id text;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_habitaciones_mesa_idx
  ON public.hotel_habitaciones (organization_id, mesa_id)
  WHERE mesa_id IS NOT NULL;
