-- Reparto del valor de un plato entre subcomandas (p. ej. amigos que se dividen
-- lo del cumpleañero). La columna guarda un JSON con la marca del reparto:
--   origen: {"tipo":"origen","precio":30,"cantidad":1,"partes":[{"id":"…","comanda_id":"…"}]}
--   parte:  {"tipo":"parte","origen":"<id del ítem de origen>","n":3}
-- Las líneas "parte" no se envían a cocina; el ítem "origen" queda a $0 en su cuenta.
ALTER TABLE public.comanda_items
  ADD COLUMN IF NOT EXISTS reparto text;
