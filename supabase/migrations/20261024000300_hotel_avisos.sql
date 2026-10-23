-- Avisos del servidor de Hotel para reservas de Cloudbeds que el POS NO copia solo (hoy: las de varias habitaciones). El Worker los inserta
-- con la clave de servicio al recibir el aviso de Cloudbeds; la app los recibe en tiempo real, avisa y recarga el calendario.
CREATE TABLE IF NOT EXISTS public.hotel_avisos (
  organization_id text NOT NULL,
  reserva_id text NOT NULL,
  tipo text NOT NULL DEFAULT 'grupo_nuevo',
  nombre text NOT NULL,
  habitaciones integer NOT NULL DEFAULT 1,
  llegada date,
  salida date,
  fuente text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, reserva_id, tipo)
);

ALTER TABLE public.hotel_avisos ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier miembro de la organización. Sin políticas de escritura: solo el Worker (clave de servicio) inserta.
DROP POLICY IF EXISTS hotel_avisos_select_org ON public.hotel_avisos;
CREATE POLICY hotel_avisos_select_org ON public.hotel_avisos
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.mis_organizaciones()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hotel_avisos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_avisos;
  END IF;
END $$;
