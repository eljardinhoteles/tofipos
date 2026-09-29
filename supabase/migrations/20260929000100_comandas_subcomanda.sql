-- comandas: Mesa Múltiple. Una subcomanda es una comanda normal de la mesa
-- con un nombre libre informativo (persona/cabaña). NULL = comanda normal.
ALTER TABLE public.comandas
  ADD COLUMN IF NOT EXISTS subcomanda_nombre text;
