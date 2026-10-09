-- Asegura que todas las tablas que sincroniza la app estén en la publicación de
-- tiempo real de Supabase. Una tabla que falte solo se actualiza al resincronizar
-- (demoras "a veces"). Idempotente: no toca las que ya están.
DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'mesas', 'comandas', 'comanda_items', 'pisos', 'habitacion_cuentas',
    'reservas', 'pagos', 'ventas', 'ajustes_iva', 'usuarios',
    'categorias', 'clientes', 'menu_items'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY tablas LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Añadida a realtime: %', t;
    END IF;
  END LOOP;
END $$;
