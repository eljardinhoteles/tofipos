ALTER TABLE public.comanda_items
ADD COLUMN IF NOT EXISTS cortesia_cantidad numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cortesia_motivo text;
