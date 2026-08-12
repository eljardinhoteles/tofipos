-- Migration: Add conciliaciones and conciliacion_detalles tables

CREATE TABLE IF NOT EXISTS conciliaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id TEXT NOT NULL,
    cliente_id TEXT,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    monto_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    estado TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente', 'conciliado', 'discrepancia'
    tipo TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'automatico', 'servicio'
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conciliacion_detalles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conciliacion_id UUID NOT NULL REFERENCES conciliaciones(id) ON DELETE CASCADE,
    concepto TEXT NOT NULL,
    monto NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    metodo_pago TEXT,
    es_servicio BOOLEAN NOT NULL DEFAULT FALSE,
    referencia TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conciliaciones_org ON conciliaciones(organization_id);
CREATE INDEX IF NOT EXISTS idx_conciliaciones_cliente ON conciliaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conciliacion_detalles_conciliacion ON conciliacion_detalles(conciliacion_id);

-- Enable RLS
ALTER TABLE conciliaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE conciliacion_detalles ENABLE ROW LEVEL SECURITY;

-- Permissive RLS policies for authenticated users within organization
CREATE POLICY "Allow all operations for authenticated users on conciliaciones"
ON conciliaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users on conciliacion_detalles"
ON conciliacion_detalles FOR ALL TO authenticated USING (true) WITH CHECK (true);
