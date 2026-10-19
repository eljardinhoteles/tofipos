-- Hotel: qué incluye un plan de alimentación para NIÑOS, distinto de lo que incluye para adultos (p. ej. adultos «Desayuno y cena»,
-- niños «Desayuno y merienda»). `descripcion` pasa a ser lo que incluye para adultos; `incluye_nino` lo de los niños. Los planes ya
-- creados copian su descripción a los niños, igual que se comportaban hasta ahora.
ALTER TABLE public.hotel_planes_alimentacion
  ADD COLUMN IF NOT EXISTS incluye_nino text;

UPDATE public.hotel_planes_alimentacion
  SET incluye_nino = descripcion
  WHERE incluye_nino IS NULL AND descripcion IS NOT NULL;
