-- Auditoría de anulación de comandas: quién y cuándo. `motivo_anulacion` ya existía.
ALTER TABLE public.comandas
  ADD COLUMN IF NOT EXISTS anulada_por text,
  ADD COLUMN IF NOT EXISTS anulada_at timestamptz;
