-- Vigencia opcional de una tasa de IVA (p. ej. 8% en feriados).
-- Solo se usa para avisar al personal cuándo cambiar el IVA (sistema, comandas
-- abiertas y terminal de tarjetas); no activa ni desactiva tasas por sí sola.
ALTER TABLE public.ajustes_iva
  ADD COLUMN IF NOT EXISTS vigente_desde date,
  ADD COLUMN IF NOT EXISTS vigente_hasta date;
