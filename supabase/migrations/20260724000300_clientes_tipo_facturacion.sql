-- Migración: Agregar tipo_cliente y datos de facturación a tabla clientes existente

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS tipo_cliente     TEXT NOT NULL DEFAULT 'persona_natural',
  -- 'persona_natural' | 'juridico' | 'extranjero'

  -- Datos de facturación (pueden ser distintos al nombre del cliente)
  ADD COLUMN IF NOT EXISTS nombre_factura   TEXT,          -- Razón social / nombre legal
  ADD COLUMN IF NOT EXISTS tipo_doc         TEXT,          -- 'cedula' | 'ruc' | 'pasaporte' | 'otro'
  ADD COLUMN IF NOT EXISTS numero_doc       TEXT,          -- Número del documento de facturación
  ADD COLUMN IF NOT EXISTS direccion_fiscal TEXT,          -- Dirección de facturación
  ADD COLUMN IF NOT EXISTS email_factura    TEXT;          -- Email para envío de facturas
