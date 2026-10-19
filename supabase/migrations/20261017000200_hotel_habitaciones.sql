-- Hotel: mapa de habitaciones (cabañas) del POS, enlazadas una sola vez con su tipo de habitación de Cloudbeds.
--
-- Así el POS no necesita pedir nombres ni IDs a Cloudbeds cada vez: la rejilla del calendario sale de esta tabla.
-- En Cloudbeds cada cabaña es un tipo de habitación con UNA sola unidad, por eso el enlace es por tipo.
-- Igual que `hotel_reservas`: tabla propia, directo en Supabase (no RxDB), aislada de Mesas y del resto del sistema.
-- Las habitaciones no se borran: se desactivan (activo = false).

CREATE TABLE IF NOT EXISTS public.hotel_habitaciones (
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  nombre text NOT NULL,
  -- Código corto que usa Cloudbeds (CJ1, CP4, V10…), útil en tarjetas pequeñas.
  codigo text,
  capacidad integer CHECK (capacidad IS NULL OR capacidad >= 1),
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  -- NULL = habitación creada en el POS que todavía no se enlazó con Cloudbeds.
  cloudbeds_room_type_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un tipo de Cloudbeds solo puede estar enlazado a una habitación por organización.
CREATE UNIQUE INDEX IF NOT EXISTS hotel_habitaciones_cloudbeds_idx
  ON public.hotel_habitaciones (organization_id, cloudbeds_room_type_id)
  WHERE cloudbeds_room_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hotel_habitaciones_org_orden_idx
  ON public.hotel_habitaciones (organization_id, orden);

ALTER TABLE public.hotel_habitaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_habitaciones FROM anon;

DROP POLICY IF EXISTS hotel_habitaciones_select_org ON public.hotel_habitaciones;
CREATE POLICY hotel_habitaciones_select_org ON public.hotel_habitaciones
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()));

DROP POLICY IF EXISTS hotel_habitaciones_insert_org ON public.hotel_habitaciones;
CREATE POLICY hotel_habitaciones_insert_org ON public.hotel_habitaciones
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));

DROP POLICY IF EXISTS hotel_habitaciones_update_org ON public.hotel_habitaciones;
CREATE POLICY hotel_habitaciones_update_org ON public.hotel_habitaciones
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()))
  WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));

-- Sin política de DELETE: una habitación no se borra, se desactiva.
