-- Add missing columns to 'categorias' table to enable syncing of UI settings
ALTER TABLE public.categorias 
ADD COLUMN IF NOT EXISTS icono text,
ADD COLUMN IF NOT EXISTS es_comida_incluida boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS imprimir_primero boolean NOT NULL DEFAULT false;
