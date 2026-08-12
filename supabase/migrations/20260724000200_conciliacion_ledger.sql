-- Migration: Conciliacion Ledger (documentos y pagos por cliente)
-- Tablas independientes del modelo anterior

-- ── TABLA PRINCIPAL: DOCUMENTOS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conciliacion_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id TEXT NOT NULL,
    cliente_id TEXT NOT NULL,

    -- Tipo de documento
    tipo TEXT NOT NULL,
    -- 'reserva_restaurante' | 'cuenta_restaurante' | 'habitacion' | 'reserva_hotel_manual'

    -- Referencia opcional a registro existente (comanda_id, reserva_id, habitacion_cuenta_id)
    referencia_id TEXT,

    -- Datos del documento
    descripcion TEXT NOT NULL,
    monto_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Estado calculado (se actualiza por trigger o manualmente)
    estado TEXT NOT NULL DEFAULT 'pendiente',
    -- 'pendiente' | 'pagado_parcial' | 'pagado' | 'anulado'

    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TABLA DE PAGOS / REEMBOLSOS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conciliacion_pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id UUID NOT NULL REFERENCES conciliacion_documentos(id) ON DELETE CASCADE,

    tipo TEXT NOT NULL DEFAULT 'pago',
    -- 'pago' | 'reembolso'

    monto NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
    -- 'efectivo' | 'tarjeta' | 'transferencia' | 'otro'

    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conc_docs_org      ON conciliacion_documentos(organization_id);
CREATE INDEX IF NOT EXISTS idx_conc_docs_cliente  ON conciliacion_documentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conc_docs_tipo     ON conciliacion_documentos(tipo);
CREATE INDEX IF NOT EXISTS idx_conc_docs_estado   ON conciliacion_documentos(estado);
CREATE INDEX IF NOT EXISTS idx_conc_pagos_doc     ON conciliacion_pagos(documento_id);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE conciliacion_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conciliacion_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conciliacion_documentos_all"
  ON conciliacion_documentos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "conciliacion_pagos_all"
  ON conciliacion_pagos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
