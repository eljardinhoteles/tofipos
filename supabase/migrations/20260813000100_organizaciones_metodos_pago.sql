-- Configuración de "Métodos de pago" (Ajustes) — listas administrables de
-- bancos destino (para transferencias) y redes de tarjeta (para pagos con
-- TC), usadas al registrar un pago en el Centro de Ventas. Viven en la
-- propia tabla organizaciones (jsonb de strings) en vez de una colección
-- RxDB nueva: RxDB community ya está en el límite de 13 colecciones
-- locales, y esta configuración se lee/escribe directo contra Supabase
-- (mismo patrón que el resto de AjustesOrganizacion, sin sync offline).
ALTER TABLE public.organizaciones
  ADD COLUMN IF NOT EXISTS bancos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.organizaciones
  ADD COLUMN IF NOT EXISTS redes_tarjeta jsonb NOT NULL DEFAULT '[]'::jsonb;
