-- Cierres de turno de caja.
--
-- Un cierre guarda quién lo hizo, qué orígenes cubrió y los totales del turno. Los cobros que incluye
-- quedan marcados con `cierre_id` dentro de cada movimiento de `ventas.movimientos` (jsonb), así el turno
-- siguiente no los vuelve a ver. Esta tabla NO se replica a RxDB (la base local ya usa sus 13 colecciones):
-- la app la lee y la escribe directo, y el cierre exige conexión.
--
-- Es un registro de auditoría: las filas se insertan y se leen, no se editan ni se borran desde la app.

CREATE TABLE IF NOT EXISTS public.cierres_turno (
  -- Lo genera el cliente: reintentar el guardado nunca duplica el cierre.
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  -- Día de caja que se cerró (el de los cobros) y momento real del cierre.
  fecha_dia date NOT NULL,
  fecha_cierre timestamptz NOT NULL DEFAULT now(),
  usuario_id text,
  -- Nombre escrito en el asistente ("Cierre realizado por").
  usuario_nombre text NOT NULL,
  -- Orígenes que cubrió este cierre: cada persona cierra los suyos.
  origenes text[] NOT NULL DEFAULT '{}',
  total_cobrado numeric(12, 2) NOT NULL DEFAULT 0,
  total_reembolsado numeric(12, 2) NOT NULL DEFAULT 0,
  -- { efectivo, tarjeta, transferencia, otros }
  pagos jsonb NOT NULL DEFAULT '{}'::jsonb,
  novedades text NOT NULL DEFAULT '',
  -- Resumen completo del turno (por origen, pendientes, conteos) para reimprimir el ticket sin recalcular.
  resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cierres_turno_org_dia_idx
  ON public.cierres_turno (organization_id, fecha_dia, fecha_cierre DESC);

ALTER TABLE public.cierres_turno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cierres_turno_select_org ON public.cierres_turno;
CREATE POLICY cierres_turno_select_org ON public.cierres_turno
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()));

DROP POLICY IF EXISTS cierres_turno_insert_org ON public.cierres_turno;
CREATE POLICY cierres_turno_insert_org ON public.cierres_turno
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));

-- Sin políticas de UPDATE ni DELETE: un cierre guardado no se modifica.
