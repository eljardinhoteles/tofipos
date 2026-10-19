-- Hotel: planes de alimentación. Se definen en el POS (nombre, qué incluye y un valor referencial por adulto y por niño por noche)
-- y se asignan a cada reserva según sus adultos y niños. Son informativos: no cobran nada ni se sincronizan con Cloudbeds.
-- Uno puede ser el «por defecto»: se preselecciona al crear una reserva; las ya existentes quedan «sin plan» hasta elegirlo a mano.

CREATE TABLE IF NOT EXISTS public.hotel_planes_alimentacion (
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  nombre text NOT NULL,
  -- Qué incluye (p. ej. «Desayuno y cena»): lo que ve cocina y el huésped.
  descripcion text,
  -- Valor referencial por persona y por noche. No se cobra.
  precio_adulto numeric(12, 2) NOT NULL DEFAULT 0 CHECK (precio_adulto >= 0),
  precio_nino numeric(12, 2) NOT NULL DEFAULT 0 CHECK (precio_nino >= 0),
  por_defecto boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A lo sumo un plan por defecto por organización.
CREATE UNIQUE INDEX IF NOT EXISTS hotel_planes_defecto_idx
  ON public.hotel_planes_alimentacion (organization_id)
  WHERE por_defecto;

CREATE INDEX IF NOT EXISTS hotel_planes_org_orden_idx
  ON public.hotel_planes_alimentacion (organization_id, orden);

ALTER TABLE public.hotel_planes_alimentacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_planes_alimentacion FROM anon;

DROP POLICY IF EXISTS hotel_planes_select_org ON public.hotel_planes_alimentacion;
CREATE POLICY hotel_planes_select_org ON public.hotel_planes_alimentacion
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()));

DROP POLICY IF EXISTS hotel_planes_insert_org ON public.hotel_planes_alimentacion;
CREATE POLICY hotel_planes_insert_org ON public.hotel_planes_alimentacion
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));

DROP POLICY IF EXISTS hotel_planes_update_org ON public.hotel_planes_alimentacion;
CREATE POLICY hotel_planes_update_org ON public.hotel_planes_alimentacion
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()))
  WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));

-- Sin política de DELETE: un plan no se borra, se desactiva.

-- Plan elegido en cada reserva: una copia (nombre, descripción y valores) para que cambiar o desactivar el plan después no altere
-- lo ya reservado. NULL = sin plan (las reservas anteriores quedan así).
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS plan_alimentacion jsonb;
