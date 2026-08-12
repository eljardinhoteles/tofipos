-- Migración: Agregar fecha_checkin a conciliacion_documentos (usado por el tipo 'reserva_hotel')

ALTER TABLE conciliacion_documentos
  ADD COLUMN IF NOT EXISTS fecha_checkin TIMESTAMPTZ;
