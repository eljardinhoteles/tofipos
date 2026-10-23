-- Feriados de la organización: solo para MARCAR esos días en los calendarios (Hotel, Reservas, Planificador, selectores de fecha).
-- No afecta tarifas, disponibilidad ni ventas. No se replica a RxDB (la base local ya usa sus 13 colecciones): la app lo lee y lo
-- escribe directo y guarda una copia local.
CREATE TABLE IF NOT EXISTS public.feriados (
  organization_id text NOT NULL,
  fecha date NOT NULL,
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, fecha)
);

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier miembro de la organización (todos los calendarios los muestran).
DROP POLICY IF EXISTS feriados_select_org ON public.feriados;
CREATE POLICY feriados_select_org ON public.feriados
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.mis_organizaciones()));

-- Escritura: solo el administrador (se configuran en Ajustes).
DROP POLICY IF EXISTS feriados_insert_admin ON public.feriados;
CREATE POLICY feriados_insert_admin ON public.feriados
  FOR INSERT TO authenticated WITH CHECK (public.es_admin_de_org(organization_id));
DROP POLICY IF EXISTS feriados_update_admin ON public.feriados;
CREATE POLICY feriados_update_admin ON public.feriados
  FOR UPDATE TO authenticated
  USING (public.es_admin_de_org(organization_id)) WITH CHECK (public.es_admin_de_org(organization_id));
DROP POLICY IF EXISTS feriados_delete_admin ON public.feriados;
CREATE POLICY feriados_delete_admin ON public.feriados
  FOR DELETE TO authenticated USING (public.es_admin_de_org(organization_id));

-- Tiempo real: los demás equipos ven el cambio sin recargar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'feriados') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feriados;
  END IF;
END $$;
