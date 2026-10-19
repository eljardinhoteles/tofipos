-- Hotel, fase 2 (sincronización de vuelta): el Worker aplica solo en el POS lo que cambió en Cloudbeds (cancelaciones,
-- fechas, cabaña, huéspedes) y crea las reservas nuevas que entran por otros canales (Booking, Expedia, web).
--
-- `aviso_cloudbeds` deja constancia de un cambio aplicado automáticamente para que una persona revise lo que el servidor
-- NO toca: la venta del Centro de Ventas (sus fechas, un comentario de cancelación, un ajuste si el total ya no cuadra) y
-- el cargo del plan de alimentación. Forma: { tipo: 'cancelada' | 'cambiada', texto, fecha, donde?, llegada?, salida? }.
-- Se vacía (NULL) al revisarlo.
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS aviso_cloudbeds jsonb;

-- Tiempo real: los equipos con el Hotel abierto ven los cambios del servidor al momento.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hotel_reservas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_reservas;
  END IF;
END $$;
