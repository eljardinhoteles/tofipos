-- Migración a Supabase Auth como única fuente de credenciales.
-- La tabla public.usuarios pasa a ser SOLO perfiles (id = auth.users.id, sin secretos).
-- Las altas/ediciones de credenciales se hacen vía la Edge Function `manage-users`.

-- 1. Eliminar la columna de contraseña en texto plano
ALTER TABLE public.usuarios DROP COLUMN IF EXISTS password;

-- 2. Helpers SECURITY DEFINER (evitan recursión de RLS sobre la propia tabla)

-- Organizaciones a las que pertenece el usuario autenticado
CREATE OR REPLACE FUNCTION public.mis_organizaciones()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.organization_id::text
  FROM public.usuarios u
  WHERE u.id::text = auth.uid()::text
    AND COALESCE(u._deleted, false) = false;
$$;

-- ¿Es el usuario autenticado admin activo de la organización dada?
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
    WHERE u.id::text = auth.uid()::text
      AND u.organization_id::text = org_id
      AND u.rol = 'admin'
      AND u.activo = true
      AND COALESCE(u._deleted, false) = false
  );
$$;

REVOKE ALL ON FUNCTION public.mis_organizaciones() FROM anon;
REVOKE ALL ON FUNCTION public.es_admin_de_org(text) FROM anon;

-- 3. RLS: lectura para miembros de la organización; escritura solo service_role
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuarios_select_own_org ON public.usuarios;
CREATE POLICY usuarios_select_own_org ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    id::text = auth.uid()::text
    OR organization_id::text IN (SELECT public.mis_organizaciones())
  );

-- Sin políticas de INSERT/UPDATE/DELETE para `authenticated`:
-- toda mutación pasa por la Edge Function `manage-users` (service_role, ignora RLS).
