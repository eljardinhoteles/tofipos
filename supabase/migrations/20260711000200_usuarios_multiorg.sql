-- Membresías multi-organización: una misma cuenta de Auth puede tener perfil
-- en varias organizaciones (p. ej. un admin dueño de varios hoteles).
-- `id` pasa a ser un identificador de la MEMBRESÍA; `user_id` referencia a auth.users.

-- 1. Nueva columna user_id (backfill: las filas existentes usaban id = auth uid)
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS user_id text;
UPDATE public.usuarios SET user_id = id::text WHERE user_id IS NULL;
ALTER TABLE public.usuarios ALTER COLUMN user_id SET NOT NULL;

-- Una sola membresía por usuario y organización
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_user_org_unique
  ON public.usuarios (user_id, organization_id);

-- 2. Actualizar helpers para usar user_id
CREATE OR REPLACE FUNCTION public.mis_organizaciones()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.organization_id::text
  FROM public.usuarios u
  WHERE u.user_id = auth.uid()::text
    AND COALESCE(u._deleted, false) = false;
$$;

CREATE OR REPLACE FUNCTION public.es_admin_de_org(org_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.user_id = auth.uid()::text
      AND u.organization_id::text = org_id
      AND u.rol = 'admin'
      AND u.activo = true
      AND COALESCE(u._deleted, false) = false
  );
$$;

-- 3. Política de lectura basada en user_id
DROP POLICY IF EXISTS usuarios_select_own_org ON public.usuarios;
CREATE POLICY usuarios_select_own_org ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR organization_id::text IN (SELECT public.mis_organizaciones())
  );
