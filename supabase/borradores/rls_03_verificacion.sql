-- VERIFICACIÓN DE RLS — solo lectura (las pruebas con SET ROLE van dentro de una transacción que se deshace).
-- Ejecutar cada bloque por separado en el SQL Editor y comparar con lo esperado.

-- ═══ 1) ¿Qué puede hacer el rol anónimo? Esperado: ninguna fila (nadie tiene permisos). ═══
SELECT c.relname AS tabla,
       has_table_privilege('anon', c.oid, 'SELECT')   AS puede_leer,
       has_table_privilege('anon', c.oid, 'INSERT')   AS puede_insertar,
       has_table_privilege('anon', c.oid, 'UPDATE')   AS puede_modificar,
       has_table_privilege('anon', c.oid, 'DELETE')   AS puede_borrar,
       has_table_privilege('anon', c.oid, 'TRUNCATE') AS puede_vaciar
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE')
        OR has_table_privilege('anon', c.oid, 'TRUNCATE'));

-- ═══ 2) Políticas que aún dejan pasar a cualquiera. Esperado: solo organizaciones_insert_autenticado (intencional). ═══
SELECT tablename AS tabla, policyname AS politica, roles, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual = 'true' OR with_check = 'true' OR roles && ARRAY['anon','public']::name[]);

-- ═══ 3) Simular a un visitante sin sesión (rol anon). Esperado: "permission denied for table ..." en cada intento. ═══
-- Ejecutar de a uno; cada bloque se deshace solo.
BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.usuarios; ROLLBACK;
BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.ventas;   ROLLBACK;
BEGIN; SET LOCAL ROLE anon; UPDATE public.usuarios SET rol = 'admin'; ROLLBACK;

-- ═══ 4) Simular a un usuario de UNA organización (cambiar los dos valores). Esperado: solo ve lo de su organización. ═══
--   · UUID_DE_AUTH: el id del usuario en Authentication › Users.
--   · ORG_ID: el id de su organización (columna organization_id).
-- Debe devolver > 0 con SU organización y 0 con cualquier otra.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"UUID_DE_AUTH","role":"authenticated"}', true);
SELECT (SELECT count(*) FROM public.ventas WHERE organization_id::text = 'ORG_ID')          AS ventas_de_mi_org,
       (SELECT count(*) FROM public.ventas WHERE organization_id::text <> 'ORG_ID')         AS ventas_de_otras_orgs,
       (SELECT count(*) FROM public.usuarios WHERE organization_id <> 'ORG_ID')             AS usuarios_de_otras_orgs;
ROLLBACK;

-- ═══ 5) Tablas sin ninguna política (cerradas a propósito). Esperado: print_server_secrets, conciliacion_detalles, conciliacion_pagos. ═══
SELECT c.relname AS tabla
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
   AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
 ORDER BY c.relname;
