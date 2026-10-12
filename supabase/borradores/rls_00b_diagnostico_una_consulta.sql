-- Lo mismo que rls_00_diagnostico.sql, en UNA sola consulta: el SQL Editor de Supabase solo muestra el resultado de
-- la última sentencia, así que con el otro archivo se pierden las primeras cuatro. Ejecutar esta, copiar la celda
-- `diagnostico` (JSON) y pegarla.
SELECT jsonb_pretty(jsonb_build_object(
  'tablas', (
    SELECT jsonb_agg(jsonb_build_object(
      'tabla', c.relname,
      'rls_activo', c.relrowsecurity,
      'tipo_organization_id', (SELECT data_type FROM information_schema.columns k
                                WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'organization_id')
    ) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  'politicas', (
    SELECT jsonb_agg(jsonb_build_object(
      'tabla', tablename, 'politica', policyname, 'roles', roles, 'cmd', cmd, 'using', qual, 'with_check', with_check
    ) ORDER BY tablename, policyname)
    FROM pg_policies WHERE schemaname = 'public'
  ),
  'permisos_anon', (
    SELECT jsonb_agg(jsonb_build_object('tabla', table_name, 'permiso', privilege_type) ORDER BY table_name, privilege_type)
    FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee = 'anon'
  )
)) AS diagnostico;
