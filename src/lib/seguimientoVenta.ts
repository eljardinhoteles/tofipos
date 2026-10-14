import type { VentaConMovimientos } from '../hooks/useVentasConMovimientos';

// Seguimiento de una venta: qué le falta para estar completa. Una sola definición que usan la lista de Centro de
// Ventas (indicadores), el filtro "Incompleta" y cualquier otra vista que necesite saberlo.
//   completo → está al día · parcial → hay algo hecho pero no todo · falta → no se ha hecho · na → no aplica
export type EstadoSeguimiento = 'completo' | 'parcial' | 'falta' | 'na';

export interface SeguimientoVenta {
  cobro: EstadoSeguimiento;
  comprobante: EstadoSeguimiento;
  factura: EstadoSeguimiento;
  /** Detalle para los tooltips. */
  pagosSinEfectivo: number;
  pagosConComprobante: number;
}

const EPS = 0.01;

export function seguimientoVenta(item: VentaConMovimientos): SeguimientoVenta {
  // Cobro: el saldo (monto − pagado + reembolsado) en cero. Parcial si ya hay pagos pero aún queda saldo.
  const cobro: EstadoSeguimiento =
    item.montoTotal > EPS && item.saldo <= EPS ? 'completo'
      : item.totalPagado > EPS ? 'parcial'
        : 'falta';

  // Comprobante: se revisa pago por pago. El efectivo y la tarjeta cobrada en caja (voucher del terminal, marcada «sin comprobante») no lo llevan, y los archivos de otros movimientos
  // (factura, comentarios) no cuentan como respaldo de un pago.
  const pagos = item.movimientos.filter(m => !m.anulado && m.tipo === 'pago' && (m.monto ?? 0) > 0);
  const sinEfectivo = pagos.filter(m => m.metodo_pago !== 'efectivo' && !m.sin_comprobante);
  const conComprobante = sinEfectivo.filter(m => !!m.comprobante_url);
  const comprobante: EstadoSeguimiento =
    pagos.length === 0 ? 'falta'
      : sinEfectivo.length === 0 ? 'na'
        : conComprobante.length === sinEfectivo.length ? 'completo'
          : conComprobante.length === 0 ? 'falta'
            : 'parcial';

  // Factura: completa solo si no entró dinero después de la última factura (ver facturaAlDia).
  const factura: EstadoSeguimiento = !item.facturado ? 'falta' : item.facturaAlDia ? 'completo' : 'parcial';

  return { cobro, comprobante, factura, pagosSinEfectivo: sinEfectivo.length, pagosConComprobante: conComprobante.length };
}

/** Venta sin nada pendiente: cobrada, con comprobante (o sin necesitarlo) y facturada al día. */
export function ventaCompleta(item: VentaConMovimientos): boolean {
  if (item.anulado) return false;
  const s = seguimientoVenta(item);
  return s.cobro === 'completo' && (s.comprobante === 'completo' || s.comprobante === 'na') && s.factura === 'completo';
}

/** Ventas con algo por resolver en comprobante o factura (el filtro «Incompleta»). */
export function ventaIncompleta(item: VentaConMovimientos): boolean {
  if (item.anulado) return false;
  const s = seguimientoVenta(item);
  return s.factura !== 'completo' || s.comprobante === 'falta' || s.comprobante === 'parcial';
}
