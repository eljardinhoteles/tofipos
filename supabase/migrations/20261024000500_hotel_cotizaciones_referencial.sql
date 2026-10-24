-- Cotización referencial: el cliente aún no tiene fechas. Se calcula con fechas de muestra (que se guardan para poder editarla) y el
-- documento NO las muestra: dice «fechas por definir» y que el precio es una referencia. Vale más tiempo (7 días) y no se puede convertir
-- en reserva sin elegir las fechas reales.
ALTER TABLE public.hotel_cotizaciones
  ADD COLUMN IF NOT EXISTS referencial boolean NOT NULL DEFAULT false;
