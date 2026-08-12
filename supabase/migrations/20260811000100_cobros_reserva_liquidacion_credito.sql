-- Centro de Ventas: liquidación de créditos de agencia. Un crédito
-- (cobros_reserva.tipo='credito') se paga con uno o más registros nuevos
-- tipo='pago_credito' que apuntan a él vía credito_id — mismo patrón que
-- reembolso: se agrega un movimiento nuevo, nunca se edita el histórico.
-- Espejo de cobroReservaSchema v5 en src/db/rxdb.ts.

ALTER TABLE public.cobros_reserva
  ADD COLUMN IF NOT EXISTS credito_id uuid;

CREATE INDEX IF NOT EXISTS idx_cobros_reserva_credito_id
  ON public.cobros_reserva (credito_id);
