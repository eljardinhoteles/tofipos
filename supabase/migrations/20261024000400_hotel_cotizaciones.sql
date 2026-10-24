-- Cotizaciones del Hotel: documento (PDF o imagen) con cabañas, camas, plan de alimentación, extras y precio final, vigente 48 horas.
-- Guardan una COPIA de lo cotizado (los precios de Cloudbeds cambian). No se replican a RxDB: la app las lee y escribe directo.
-- El número es corrido por organización (sin año) y lo asigna el servidor al insertar.
CREATE TABLE IF NOT EXISTS public.hotel_cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  numero integer NOT NULL,
  estado text NOT NULL DEFAULT 'vigente', -- vigente | convertida (la «vencida» se deduce de vence_at)
  idioma text NOT NULL DEFAULT 'es',
  cliente jsonb NOT NULL DEFAULT '{}'::jsonb, -- { nombre, email?, telefono? }
  llegada date NOT NULL,
  salida date NOT NULL,
  adultos integer NOT NULL DEFAULT 1,
  ninos integer NOT NULL DEFAULT 0,
  lineas jsonb NOT NULL DEFAULT '[]'::jsonb,    -- cabañas: nombre, cama, adultos, niños, precio
  plan jsonb,                                  -- plan de alimentación: nombre, incluye[], se_cobra, importe
  extras jsonb NOT NULL DEFAULT '[]'::jsonb,   -- { descripcion, monto }
  cortesias jsonb NOT NULL DEFAULT '[]'::jsonb, -- textos libres
  notas text,
  total numeric(12,2) NOT NULL DEFAULT 0,       -- precio final (impuestos incluidos)
  vence_at timestamptz NOT NULL,
  usuario_nombre text,
  reserva_ids jsonb,                           -- reservas creadas al convertirla
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, numero)
);

CREATE INDEX IF NOT EXISTS hotel_cotizaciones_org_creada_idx ON public.hotel_cotizaciones (organization_id, created_at DESC);

-- Número corrido por organización. El bloqueo asesor evita que dos cotizaciones simultáneas reciban el mismo número.
CREATE OR REPLACE FUNCTION public.hotel_cotizaciones_numerar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hotel_cotizaciones:' || NEW.organization_id));
  SELECT COALESCE(MAX(numero), 0) + 1 INTO NEW.numero FROM public.hotel_cotizaciones WHERE organization_id = NEW.organization_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS hotel_cotizaciones_numerar_tg ON public.hotel_cotizaciones;
CREATE TRIGGER hotel_cotizaciones_numerar_tg BEFORE INSERT ON public.hotel_cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.hotel_cotizaciones_numerar();

ALTER TABLE public.hotel_cotizaciones ENABLE ROW LEVEL SECURITY;

-- Todos los miembros de la organización pueden ver, crear, actualizar y borrar cotizaciones.
DROP POLICY IF EXISTS hotel_cotizaciones_select_org ON public.hotel_cotizaciones;
CREATE POLICY hotel_cotizaciones_select_org ON public.hotel_cotizaciones
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.mis_organizaciones()));
DROP POLICY IF EXISTS hotel_cotizaciones_insert_org ON public.hotel_cotizaciones;
CREATE POLICY hotel_cotizaciones_insert_org ON public.hotel_cotizaciones
  FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));
DROP POLICY IF EXISTS hotel_cotizaciones_update_org ON public.hotel_cotizaciones;
CREATE POLICY hotel_cotizaciones_update_org ON public.hotel_cotizaciones
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones())) WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));
DROP POLICY IF EXISTS hotel_cotizaciones_delete_org ON public.hotel_cotizaciones;
CREATE POLICY hotel_cotizaciones_delete_org ON public.hotel_cotizaciones
  FOR DELETE TO authenticated USING (organization_id IN (SELECT public.mis_organizaciones()));
