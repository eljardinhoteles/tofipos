-- RLS por organización — registro de lo que se aplicó A MANO en producción el 2026-10-12.
--
-- Esta migración deja en el repositorio lo que ya está en la base real, para que cualquier base nueva (copia, rama
-- de pruebas, reconstrucción) quede igual. NO volver a ejecutarla en producción: ya está aplicada, y rehacer las
-- políticas con tráfico en vivo puede dar "deadlock detected" (las políticas leen `usuarios` en cada consulta).
-- Para que `supabase db push` no la intente aplicar otra vez en producción:
--     supabase migration repair --status applied 20261012000300
--
-- Qué hace:
--   1) Tablas con organization_id: solo usuarios autenticados de esa organización (mis_organizaciones()), sin permisos
--      para el rol anónimo. Las tablas sin organization_id (conciliacion_detalles/pagos) quedan cerradas.
--   2) todos / products (pruebas): cerradas por completo.
--   3) organizaciones: cada usuario lee las suyas, solo el administrador las modifica, cualquier autenticado crea una.
--   4) usuarios: se quitan las tres políticas abiertas al rol anónimo ("usuarios insert/select/update"); las altas y
--      cambios pasan solo por la Edge Function manage-users (service_role).
--   5) El rol anónimo no conserva permisos sobre ninguna tabla ni secuencia de public, ni las tablas futuras se los dan.

BEGIN;

-- Si no consigue los bloqueos en 10 s (hay tráfico en vivo), falla y deshace todo en vez de quedarse esperando o
-- provocar un bloqueo cruzado; se puede repetir en un momento más tranquilo.
SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  t text;
  pol record;
  -- Tablas operativas que la app lee y escribe (replicación RxDB y consultas directas) y tablas heredadas.
  tablas text[] := ARRAY[
    'mesas', 'comandas', 'comanda_items', 'pisos', 'habitacion_cuentas', 'reservas', 'pagos', 'ventas',
    'ajustes_iva', 'categorias', 'clientes', 'menu_items',
    'comanda_item_deletes', 'venta_movimientos', 'cobros_reserva',
    'conciliaciones', 'conciliacion_detalles', 'conciliacion_documentos', 'conciliacion_pagos'
  ];
  org_check constant text := 'organization_id::text IN (SELECT public.mis_organizaciones())';
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'No existe: % (se omite)', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Fuera todas las políticas actuales (incluidas las creadas a mano en el panel).
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id'
    ) THEN
      -- Sin organization_id no se puede acotar por organización: queda cerrada (solo service_role).
      RAISE NOTICE '% no tiene organization_id: queda con RLS y sin políticas (solo service_role)', t;
      CONTINUE;
    END IF;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      t || '_select_org', t, org_check);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      t || '_insert_org', t, org_check);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      t || '_update_org', t, org_check, org_check);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      t || '_delete_org', t, org_check);
    RAISE NOTICE 'Endurecida: %', t;
  END LOOP;
END $$;

-- Tablas de prueba sin datos reales: se cierran por completo (RLS activo y sin políticas).
DO $$
DECLARE t text; pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['todos', 'products'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- organizaciones: cada usuario lee las suyas; solo el administrador las modifica (p. ej. métodos de pago);
-- cualquier usuario autenticado puede crear una nueva.
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.organizaciones') IS NULL THEN RETURN; END IF;
  ALTER TABLE public.organizaciones ENABLE ROW LEVEL SECURITY;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizaciones' LOOP
    EXECUTE format('DROP POLICY %I ON public.organizaciones', pol.policyname);
  END LOOP;
  REVOKE ALL ON public.organizaciones FROM anon;
  CREATE POLICY organizaciones_select_miembro ON public.organizaciones
    FOR SELECT TO authenticated USING (id::text IN (SELECT public.mis_organizaciones()));
  -- Crear una organización nueva la hace un administrador desde la app (App.tsx › handleCrearOrg) ANTES de ser miembro,
  -- así que no se puede exigir membresía; la vinculación posterior pasa por la Edge Function.
  CREATE POLICY organizaciones_insert_autenticado ON public.organizaciones
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY organizaciones_update_admin ON public.organizaciones
    FOR UPDATE TO authenticated
    USING (public.es_admin_de_org(id::text)) WITH CHECK (public.es_admin_de_org(id::text));
END $$;


-- 4) usuarios: fuera las políticas abiertas (rol public) que aceptaban al rol anónimo.
DROP POLICY IF EXISTS "usuarios insert" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios select" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios update" ON public.usuarios;

-- 5) El rol anónimo no necesita nada de las tablas ni secuencias de public (RLS ya las bloquea; esto es defensa en
--    profundidad y quita TRUNCATE, que RLS no controla). Las tablas futuras tampoco le darán permisos.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

COMMIT;
