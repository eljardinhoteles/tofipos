-- URL pública (https) del logo de la organización: sale en el encabezado de los correos a los huéspedes.
ALTER TABLE public.organizaciones
  ADD COLUMN IF NOT EXISTS logo_url text;
