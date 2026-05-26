-- Agregar columnas para autenticación de administrador local en la tabla usuarios
ALTER TABLE public.usuarios 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS password text;
