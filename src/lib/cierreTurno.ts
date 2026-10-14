import type { Dayjs } from 'dayjs';
import type { DatosTicketCierre } from '../services/printTemplateEngine';
import type { VentaConMovimientos } from '../hooks/useVentasConMovimientos';
import { esDeJornada } from './jornada';

export type OrigenCierre = 'mesa' | 'reserva_restaurante' | 'reserva_hotel' | 'habitacion';

export interface GrupoCobros {
  total: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  otros: number;
  redes: Record<string, number>;
  bancos: Record<string, number>;
}

export interface PagoSinComprobante {
  item: VentaConMovimientos;
  metodo: string;
  monto: number;
}

export interface ResumenCierre {
  ventasValidas: number;
  anuladas: number;
  totalCobrado: number;
  totalReembolsado: number;
  saldoPendiente: number;
  pagos: { efectivo: number; tarjeta: number; transferencia: number; otros: number };
  cobrosPorOrigen: Record<OrigenCierre, GrupoCobros>;
  ventasPendientes: VentaConMovimientos[];
  pagosSinComprobante: PagoSinComprobante[];
  ventasSinFactura: VentaConMovimientos[];
  ventasFacturadas: number;
  /** Pagos y reembolsos que entran a este cierre, por venta: son los que se marcan al cerrar. */
  movimientosIncluidos: Array<{ ventaId: string; movimientoIds: string[] }>;
  /** Ventas a crédito registradas en el turno: entran al cierre como constancia aunque aún no tengan pagos. */
  creditos: Array<{ item: VentaConMovimientos; monto: number }>;
  totalCredito: number;
}

const grupoVacio = (): GrupoCobros => ({ total: 0, efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0, redes: {}, bancos: {} });

/**
 * Resumen de cobros de una jornada de caja (ver lib/jornada.ts) para el asistente de cierre de turno. Se calcula con los movimientos
 * de ese día (por la fecha de cada pago o reembolso), no con las ventas agrupadas por su último
 * movimiento: una venta a crédito creada el lunes y pagada el viernes solo suma al viernes lo
 * cobrado el viernes. Los movimientos anulados y los ya incluidos en un cierre (`cierre_id`) no cuentan,
 * así cada turno solo ve lo que sigue abierto; el efectivo no exige comprobante;
 * "sin factura" son las ventas con dinero cobrado ese día cuya factura falta o no cubre el último pago.
 */
export function calcularResumenCierre(items: VentaConMovimientos[], dia: Dayjs): ResumenCierre {
  const pagos = { efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0 };
  const cobrosPorOrigen: Record<OrigenCierre, GrupoCobros> = {
    mesa: grupoVacio(), reserva_restaurante: grupoVacio(), reserva_hotel: grupoVacio(), habitacion: grupoVacio(),
  };
  const ventasPendientes: VentaConMovimientos[] = [];
  const pagosSinComprobante: PagoSinComprobante[] = [];
  const ventasSinFactura: VentaConMovimientos[] = [];
  let totalCobrado = 0;
  let totalReembolsado = 0;
  let saldoPendiente = 0;
  let ventasFacturadas = 0;
  let ventasValidas = 0;
  let anuladas = 0;
  const creditos: ResumenCierre['creditos'] = [];
  let totalCredito = 0;
  const movimientosIncluidos: ResumenCierre['movimientosIncluidos'] = [];

  for (const item of items) {
    // Una venta entra al cierre solo si tiene un cobro (pago o reembolso) de ese día aún sin cerrar.
    // Una venta a crédito entra también por su monto (ajustes) o por haberse marcado como crédito: es la constancia del crédito.
    const esCredito = item.venta.tipo === 'credito';
    const delDia = item.movimientos.filter(m => {
      if (m.anulado || m.cierre_id || !esDeJornada(m.fecha, dia)) return false;
      if (m.tipo === 'pago' || m.tipo === 'reembolso') return !!m.monto;
      return esCredito && (m.tipo === 'ajuste' || m.tipo === 'marcar_credito');
    });
    if (delDia.length === 0) continue;
    if (item.anulado) { anuladas++; continue; }

    ventasValidas++;
    movimientosIncluidos.push({ ventaId: item.venta.id, movimientoIds: delDia.map(m => m.id) });
    if (item.saldo > 0.01) { saldoPendiente += item.saldo; ventasPendientes.push(item); }
    if (item.facturado) ventasFacturadas++;

    const grupo = cobrosPorOrigen[item.venta.origen];
    let cobroHoy = false;
    if (esCredito && delDia.some(m => m.tipo === 'ajuste' || m.tipo === 'marcar_credito')) {
      const ajustes = delDia.filter(m => m.tipo === 'ajuste').reduce((t, m) => t + (m.monto ?? 0), 0);
      const monto = ajustes !== 0 ? ajustes : item.saldo;
      creditos.push({ item, monto });
      totalCredito += monto;
    }
    for (const m of delDia) {
      if (m.tipo === 'ajuste' || m.tipo === 'marcar_credito') continue;
      if (m.tipo === 'reembolso' && m.monto) { totalReembolsado += m.monto; continue; }
      if (m.tipo !== 'pago' || !m.monto) continue;
      cobroHoy = true;
      totalCobrado += m.monto;
      grupo.total += m.monto;
      if (m.metodo_pago === 'efectivo') { pagos.efectivo += m.monto; grupo.efectivo += m.monto; }
      else if (m.metodo_pago === 'tarjeta') {
        pagos.tarjeta += m.monto; grupo.tarjeta += m.monto;
        if (m.tarjeta_red) grupo.redes[m.tarjeta_red] = (grupo.redes[m.tarjeta_red] || 0) + m.monto;
      } else if (m.metodo_pago === 'transferencia') {
        pagos.transferencia += m.monto; grupo.transferencia += m.monto;
        if (m.transferencia_banco) grupo.bancos[m.transferencia_banco] = (grupo.bancos[m.transferencia_banco] || 0) + m.monto;
      } else { pagos.otros += m.monto; grupo.otros += m.monto; }

      if (m.metodo_pago !== 'efectivo' && !m.comprobante_url) {
        pagosSinComprobante.push({ item, metodo: m.metodo_pago || 'otros', monto: m.monto });
      }
    }
    if (cobroHoy && !(item.facturado && item.facturaAlDia)) ventasSinFactura.push(item);
  }

  ventasPendientes.sort((a, b) => b.saldo - a.saldo);
  return {
    ventasValidas, anuladas, totalCobrado, totalReembolsado, saldoPendiente, pagos, cobrosPorOrigen,
    ventasPendientes, pagosSinComprobante, ventasSinFactura, ventasFacturadas, movimientosIncluidos, creditos, totalCredito,
  };
}

export const ORIGEN_CIERRE_TITULO: Record<OrigenCierre, string> = {
  mesa: 'Mesas', reserva_restaurante: 'Reservas', reserva_hotel: 'Hotel', habitacion: 'Habitaciones',
};

export const METODO_TITULO: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', credito_agencia: 'Crédito de agencia', otros: 'Otros',
};

/**
 * Cierre de turno guardado en Supabase (`cierres_turno`): cuándo se cerró, quién, qué orígenes cubrió y los totales.
 * `ticket` es el resumen completo para reimprimir el ticket sin recalcular.
 */
export interface CierreTurno {
  id: string;
  fecha_dia: string;
  fecha_cierre: string;
  usuario_nombre: string;
  origenes: OrigenCierre[];
  total_cobrado: number;
  total_reembolsado: number;
  pagos: { efectivo: number; tarjeta: number; transferencia: number; otros: number };
  novedades: string;
  ticket: DatosTicketCierre | null;
}
