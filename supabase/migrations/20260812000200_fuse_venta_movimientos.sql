-- RxDB community limita a 13 colecciones locales simultáneas. Con
-- venta_movimientos como colección propia, sumada a ventas, se pasaba ese
-- límite (ver error RxDB COL23 al abrir la 14ª colección). Se fusiona el
-- historial de movimientos como un array embebido `movimientos` dentro del
-- propio documento `ventas` — mismo modelo de negocio (historial trazable,
-- monto/saldo/estado derivados), pero una sola colección local en vez de dos.
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS movimientos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- venta_movimientos nunca llegó a recibir datos reales (la tabla se creó en
-- la migración anterior en la misma sesión de desarrollo, antes de detectar
-- el límite de colecciones) — se elimina sin necesidad de migrar filas.
DROP TABLE IF EXISTS public.venta_movimientos;
