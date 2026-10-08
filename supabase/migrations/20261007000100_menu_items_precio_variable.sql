-- Productos de precio variable: el precio del menú es solo referencia y se
-- puede cambiar al añadirlo a una comanda (antes de confirmar).
-- Aplicar ANTES de usar la opción en varios dispositivos: sin la columna el
-- push de menu_items se descarta.
ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS precio_variable boolean;
