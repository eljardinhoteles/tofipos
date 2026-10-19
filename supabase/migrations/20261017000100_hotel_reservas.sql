-- Hotel: reservas gestionadas desde la página «Hotel» y sincronizadas con Cloudbeds (PMS).
--
-- Tabla propia, aislada del resto del sistema: NO toca `ventas`, cierres ni métricas. Igual que `cierres_turno`,
-- NO se replica a RxDB (la base local ya usa sus 13 colecciones): la app la lee y la escribe directo y exige
-- conexión (Cloudbeds también la exige).
--
-- Cloudbeds es la fuente de verdad del calendario y de la tarifa. Aquí se guarda el vínculo (cloudbeds_reservation_id),
-- los datos del huésped, los extras vendidos en el POS (spa, tours…) y el estado de sincronización.
-- Las reservas no se borran: se cancelan (estado = 'cancelada').

CREATE TABLE IF NOT EXISTS public.hotel_reservas (
  -- Lo genera el cliente y se usa como Idempotency-Key hacia Cloudbeds: reintentar nunca duplica la reserva.
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,

  -- Vínculo con Cloudbeds (NULL mientras la reserva esté pendiente de sincronizar).
  cloudbeds_reservation_id text,
  room_type_id text NOT NULL,
  -- Nombre de la cabaña al reservar, para mostrarla sin consultar a Cloudbeds.
  cabana text NOT NULL,

  llegada date NOT NULL,
  salida date NOT NULL,
  adultos integer NOT NULL CHECK (adultos >= 1),
  ninos integer NOT NULL DEFAULT 0 CHECK (ninos >= 0),

  huesped_nombre text NOT NULL,
  huesped_apellido text NOT NULL,
  huesped_email text NOT NULL,
  huesped_telefono text,
  huesped_pais text NOT NULL DEFAULT 'EC',

  -- Total de la estadía según la tarifa de Cloudbeds (no se escribe a mano).
  total_estadia numeric(12, 2) NOT NULL DEFAULT 0,
  -- Extras vendidos desde el POS: [{ id, descripcion, monto, fecha, usuario }]. También se anotan en Cloudbeds.
  extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas text,

  estado text NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada', 'cancelada')),
  -- 'pendiente' = guardada aquí pero aún sin subir a Cloudbeds (se reintenta); 'error' = Cloudbeds la rechazó.
  sync_estado text NOT NULL DEFAULT 'pendiente' CHECK (sync_estado IN ('sincronizada', 'pendiente', 'error')),
  sync_error text,

  usuario_id text,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (salida > llegada)
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_reservas_cloudbeds_idx
  ON public.hotel_reservas (cloudbeds_reservation_id)
  WHERE cloudbeds_reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hotel_reservas_org_llegada_idx
  ON public.hotel_reservas (organization_id, llegada);

ALTER TABLE public.hotel_reservas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_reservas FROM anon;

DROP POLICY IF EXISTS hotel_reservas_select_org ON public.hotel_reservas;
CREATE POLICY hotel_reservas_select_org ON public.hotel_reservas
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()));

DROP POLICY IF EXISTS hotel_reservas_insert_org ON public.hotel_reservas;
CREATE POLICY hotel_reservas_insert_org ON public.hotel_reservas
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));

DROP POLICY IF EXISTS hotel_reservas_update_org ON public.hotel_reservas;
CREATE POLICY hotel_reservas_update_org ON public.hotel_reservas
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()))
  WITH CHECK (organization_id IN (SELECT public.mis_organizaciones()));

-- Sin política de DELETE: una reserva no se borra, se cancela.
