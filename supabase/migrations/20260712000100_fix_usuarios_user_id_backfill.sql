-- Corrección: filas donde el backfill de user_id quedó NULL tras la migración
-- 20260711000200_usuarios_multiorg.sql.
--
-- La migración original hacía:
--   UPDATE public.usuarios SET user_id = id::text WHERE user_id IS NULL;
-- Pero si alguna fila tenía id = auth.uid() y la columna user_id ya existía
-- con valor NULL por alguna razón (p.ej. foreign key mismatch), el backfill
-- no la cubría. Esta migración lo repara de forma idempotente.

-- 1. Reparar backfill: cualquier fila cuyo user_id siga siendo NULL obtiene
--    user_id = id (comportamiento original de la tabla antes de multi-org).
UPDATE public.usuarios
SET user_id = id::text
WHERE user_id IS NULL;

-- 2. Actualizar la política RLS para incluir una cláusula de compatibilidad
--    con el esquema anterior (donde id = auth.uid()). Esto garantiza que
--    un dispositivo pueda leer sus datos incluso si hay un breve período en
--    que user_id aún no coincide con auth.uid() (p.ej. carrera de timing al
--    vincular).
DROP POLICY IF EXISTS usuarios_select_own_org ON public.usuarios;
CREATE POLICY usuarios_select_own_org ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR id::text = auth.uid()::text                          -- compatibilidad legacy
    OR organization_id::text IN (SELECT public.mis_organizaciones())
  );
