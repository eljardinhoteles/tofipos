import type { VentaConMovimientos } from '../../hooks/useVentasConMovimientos';
import { seguimientoVenta } from '../../lib/seguimientoVenta';

/** Acciones de la barra que resuelven lo que le falta a la venta: cobro → Pago, factura → Facturar. El comprobante se adjunta en el pago del historial. */
export function accionesPendientes(item: VentaConMovimientos): string[] {
  if (item.anulado) return [];
  const s = seguimientoVenta(item);
  const r: string[] = [];
  if (s.cobro !== 'completo') r.push('pago');
  if (s.factura !== 'completo') r.push('anclar');
  return r;
}

/** Recomendaciones para el cajero: una frase corta por cada cosa que falta. Vacío si la venta está al día. */
export function recomendaciones(item: VentaConMovimientos): string[] {
  if (item.anulado) return [];
  const s = seguimientoVenta(item);
  const r: string[] = [];
  if (s.cobro === 'falta') r.push('Falta registrar el pago');
  else if (s.cobro === 'parcial') r.push(`Cobro parcial: saldo $${item.saldo.toFixed(2)}`);
  if (s.comprobante === 'parcial' || (s.comprobante === 'falta' && s.pagosSinEfectivo > 0)) {
    const n = s.pagosSinEfectivo - s.pagosConComprobante;
    r.push(`Falta comprobante en ${n} pago${n === 1 ? '' : 's'}: adjúntalo en el historial`);
  }
  if (s.factura === 'falta') r.push('Falta la factura');
  else if (s.factura === 'parcial') r.push('Factura desactualizada: hay pagos posteriores');
  return r;
}
