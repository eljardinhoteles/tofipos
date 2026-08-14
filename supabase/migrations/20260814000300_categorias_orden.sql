-- Add 'orden' column to 'categorias' table
ALTER TABLE public.categorias ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0;
