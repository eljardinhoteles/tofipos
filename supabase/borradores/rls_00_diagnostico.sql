-- DIAGNÓSTICO DE SEGURIDAD (RLS) — solo lectura, no cambia nada.
-- Ejecutar en Supabase › SQL Editor y guardar los resultados (sirven de respaldo antes de endurecer).

-- 1) Tablas de public: ¿tienen RLS activo? ¿tienen organization_id y de qué tipo?
SELECT c.relname AS tabla,
       c.relrowsecurity AS rls_activo,
       c.relforcerowsecurity AS rls_forzado,
       (SELECT data_type FROM information_schema.columns k
         WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'organization_id') AS tipo_organization_id
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY c.relname;

-- 2) Todas las políticas actuales. Las peligrosas: roles {public} o {anon} con using = true.
SELECT tablename AS tabla, policyname AS politica, permissive, roles, cmd,
       qual AS using_expr, with_check AS with_check_expr
  FROM pg_policies
 WHERE schemaname = 'public'
 ORDER BY tablename, policyname;

-- 3) Políticas que dejan pasar a cualquiera (using true) o que aplican al rol anónimo.
SELECT tablename AS tabla, policyname AS politica, roles, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual = 'true' OR with_check = 'true' OR roles && ARRAY['anon','public']::name[])
 ORDER BY tablename, policyname;

-- 4) Permisos directos (GRANT) del rol anónimo sobre tablas de public.
SELECT table_name AS tabla, privilege_type AS permiso
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND grantee = 'anon'
 ORDER BY table_name, privilege_type;

-- 5) Tablas con RLS activo y SIN ninguna política (nadie puede usarlas salvo service_role).
SELECT c.relname AS tabla
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
   AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
 ORDER BY c.relname;
