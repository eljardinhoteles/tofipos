-- La tabla menu_items nunca tuvo columna es_bebida (nunca se creó vía migración
-- versionada, quedó desalineada con el esquema local de RxDB). El cliente
-- siempre envía es_bebida (default false) al crear un producto, así que el
-- upsert de sync fallaba silenciosamente para TODO producto nuevo: se
-- guardaba en RxDB local pero nunca llegaba a Supabase ni a otros dispositivos.

ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS es_bebida boolean;
