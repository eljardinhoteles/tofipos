-- comandas: override/snapshot de IVA por comanda puntual. Se guarda el %
-- de IVA activo al momento de crear la comanda (para que un cambio en el
-- IVA global no afecte comandas ya abiertas), y puede editarse a mano
-- desde el detalle de la comanda (p. ej. dejarla en 0%/exento). NULL =
-- sigue el IVA global activo en vivo (comportamiento histórico).
ALTER TABLE public.comandas
  ADD COLUMN IF NOT EXISTS iva_porcentaje numeric,
  ADD COLUMN IF NOT EXISTS iva_precios_con_iva boolean;
