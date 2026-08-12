-- Centro de Ventas: anulación y reembolso, espejo de la extensión de
-- RxPago/RxCobroReserva en src/db/rxdb.ts (pagoSchema v2, cobroReservaSchema v2).
--
-- Anulación: el cobro nunca debió contar (error, duplicado). Se excluye de
-- los totales/reportes pero NUNCA se borra — sigue visible con su motivo.
--
-- Reembolso: el cobro fue real pero se devolvió total o parcialmente después
-- (cambio de fecha con penalidad, cancelación de reserva de hotel). No anula
-- la transacción original, solo resta del total efectivo. Una sola vez por
-- cobro (v1) — de ahí que sea un solo monto/motivo, no una sub-tabla.

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS anulado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulado_motivo text,
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por uuid,
  ADD COLUMN IF NOT EXISTS monto_reembolsado numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reembolso_motivo text,
  ADD COLUMN IF NOT EXISTS reembolso_at timestamptz,
  ADD COLUMN IF NOT EXISTS reembolso_por uuid;

ALTER TABLE public.cobros_reserva
  ADD COLUMN IF NOT EXISTS anulado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulado_motivo text,
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por uuid,
  ADD COLUMN IF NOT EXISTS monto_reembolsado numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reembolso_motivo text,
  ADD COLUMN IF NOT EXISTS reembolso_at timestamptz,
  ADD COLUMN IF NOT EXISTS reembolso_por uuid;

CREATE INDEX IF NOT EXISTS idx_pagos_anulado
  ON public.pagos (anulado);

CREATE INDEX IF NOT EXISTS idx_cobros_reserva_anulado
  ON public.cobros_reserva (anulado);
