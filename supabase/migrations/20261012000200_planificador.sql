-- Planificador: qué productos se destacan cada día y con qué etiqueta (promoción, almuerzo de huéspedes,
-- cena, plato del día…), más la firma de cada menú.
--
-- Estas tablas NO se replican a RxDB (la base local ya usa sus 13 colecciones): la app las lee y las escribe
-- directo y guarda una copia local para leer el plan del día sin internet. Los ids los genera el cliente.

-- ── Etiquetas ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_etiquetas (
  organization_id text NOT NULL,
  id text NOT NULL,
  nombre text NOT NULL,
  -- warning | info | special | success | primary | rose | teal | slate
  tono text NOT NULL DEFAULT 'info',
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

-- ── Productos planificados por día ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_celdas (
  organization_id text NOT NULL,
  id text NOT NULL,
  producto_id text NOT NULL,
  fecha date NOT NULL,
  etiqueta_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

-- Un producto no se repite con la misma etiqueta el mismo día.
CREATE UNIQUE INDEX IF NOT EXISTS plan_celdas_unica_idx
  ON public.plan_celdas (organization_id, fecha, etiqueta_id, producto_id);
CREATE INDEX IF NOT EXISTS plan_celdas_org_fecha_idx
  ON public.plan_celdas (organization_id, fecha);

-- ── Confirmaciones (firma del menú de un día) ────────────────────────────────
-- Registro que no se edita: al anular se marca `anulada_*` y la siguiente firma crea otra fila.
CREATE TABLE IF NOT EXISTS public.plan_confirmaciones (
  organization_id text NOT NULL,
  id text NOT NULL,
  fecha date NOT NULL,
  confirmado_por text NOT NULL,
  confirmado_at timestamptz NOT NULL DEFAULT now(),
  -- Huella del contenido del día al firmar: si luego no coincide, el día se tocó sin pasar por el aviso.
  huella text NOT NULL,
  anulada_at timestamptz,
  anulada_por text,
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS plan_confirmaciones_org_fecha_idx
  ON public.plan_confirmaciones (organization_id, fecha);

ALTER TABLE public.plan_etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_celdas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_confirmaciones ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier miembro de la organización (Mesas lee el plan del día).
DROP POLICY IF EXISTS plan_etiquetas_select_org ON public.plan_etiquetas;
CREATE POLICY plan_etiquetas_select_org ON public.plan_etiquetas
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.mis_organizaciones()));
DROP POLICY IF EXISTS plan_celdas_select_org ON public.plan_celdas;
CREATE POLICY plan_celdas_select_org ON public.plan_celdas
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.mis_organizaciones()));
DROP POLICY IF EXISTS plan_confirmaciones_select_org ON public.plan_confirmaciones;
CREATE POLICY plan_confirmaciones_select_org ON public.plan_confirmaciones
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.mis_organizaciones()));

-- Etiquetas: solo el administrador (se administran en Ajustes › Planificador).
DROP POLICY IF EXISTS plan_etiquetas_insert_admin ON public.plan_etiquetas;
CREATE POLICY plan_etiquetas_insert_admin ON public.plan_etiquetas
  FOR INSERT TO authenticated WITH CHECK (public.es_admin_de_org(organization_id));
DROP POLICY IF EXISTS plan_etiquetas_update_admin ON public.plan_etiquetas;
CREATE POLICY plan_etiquetas_update_admin ON public.plan_etiquetas
  FOR UPDATE TO authenticated
  USING (public.es_admin_de_org(organization_id)) WITH CHECK (public.es_admin_de_org(organization_id));
DROP POLICY IF EXISTS plan_etiquetas_delete_admin ON public.plan_etiquetas;
CREATE POLICY plan_etiquetas_delete_admin ON public.plan_etiquetas
  FOR DELETE TO authenticated USING (public.es_admin_de_org(organization_id));

-- Productos planificados: cualquier miembro de la organización.
DROP POLICY IF EXISTS plan_celdas_insert_org ON public.plan_celdas;
CREATE POLICY plan_celdas_insert_org ON public.plan_celdas
  FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));
DROP POLICY IF EXISTS plan_celdas_delete_org ON public.plan_celdas;
CREATE POLICY plan_celdas_delete_org ON public.plan_celdas
  FOR DELETE TO authenticated USING (organization_id IN (SELECT public.mis_organizaciones()));

-- Confirmaciones: se insertan y se anulan (UPDATE), nunca se borran.
DROP POLICY IF EXISTS plan_confirmaciones_insert_org ON public.plan_confirmaciones;
CREATE POLICY plan_confirmaciones_insert_org ON public.plan_confirmaciones
  FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));
DROP POLICY IF EXISTS plan_confirmaciones_update_org ON public.plan_confirmaciones;
CREATE POLICY plan_confirmaciones_update_org ON public.plan_confirmaciones
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()))
  WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));

-- Tiempo real: el plan se actualiza solo en los demás equipos.
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['plan_etiquetas', 'plan_celdas', 'plan_confirmaciones'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
