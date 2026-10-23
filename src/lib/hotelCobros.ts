import { agregarVentaMovimiento, createRxVenta, initVerticalRxDb, type RxVenta } from '../db/rxdb';
import { subirComprobante } from './comprobantes';
import { calcularVenta, type VentaConMovimientos } from './ventaConMovimientos';
import { enlazarReservaHotel, leerReservaHotel, nombreHuesped, registrarEventoHotel, totalConExtras, type ReservaHotel } from './hotelReservasApi';

/**
 * Cobros de una reserva del Hotel. Los pagos viven SIEMPRE en el Centro de Ventas (la venta `reserva_hotel` de la reserva);
 * desde el Hotel se registran ahí mismo, con su método, banco/red y comprobante, igual que en Ventas. Cloudbeds no interviene.
 */

export type MetodoCobro = 'efectivo' | 'tarjeta' | 'transferencia' | 'otros';

export interface DatosAbono {
  monto: number;
  metodo: MetodoCobro;
  bancoDestino?: string;
  numeroComprobante?: string;
  redTarjeta?: string;
  comprobanteFile?: File | null;
}

const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

/** La venta de la reserva, ya calculada, si está en este dispositivo. */
export async function leerVentaHotel(ventaId: string): Promise<VentaConMovimientos | null> {
  const db = await initVerticalRxDb();
  const doc = await db.ventas.findOne(ventaId).exec();
  return doc ? calcularVenta(doc.toJSON() as RxVenta) : null;
}

/** A quién corresponde un pago de un grupo: a una habitación en particular o a todo el grupo. */
export type DestinoAbono = 'grupo' | string; // 'grupo' o el id de la reserva (habitación)

const ETIQUETA = /^\[hotel:([^\]]+)\]\s*(.*)$/;

/** El motivo del movimiento guarda la atribución (visible en Ventas como texto: «Habitación con Jacuzzi #2» o «Todo el grupo»). */
const motivoDe = (destino: DestinoAbono, grupo: ReservaHotel[]) =>
  destino === 'grupo' ? '[hotel:grupo] Todo el grupo' : `[hotel:${destino}] ${grupo.find((g) => g.id === destino)?.cabana ?? 'Habitación'}`;

/** Lee la atribución de un movimiento: `destino` es 'grupo', el id de una reserva, o null si no tiene (pagos antiguos o hechos en Ventas). */
export function atribucionDePago(motivo: string | undefined): { destino: DestinoAbono; texto: string } | null {
  const m = motivo ? ETIQUETA.exec(motivo) : null;
  return m ? { destino: m[1], texto: m[2] } : null;
}

/** Texto de un motivo de movimiento sin la etiqueta interna. */
export const motivoLegible = (motivo: string | undefined) => (motivo ? motivo.replace(ETIQUETA, '$2') : '');

/**
 * Texto de referencia de la venta de una reserva de hotel: solo lo que no está ya en la venta (el origen «Reserva hotel» y el
 * cliente se ven aparte): habitación (o cuántas son, en un grupo), «Grupo» si son varias y el código de la reserva en Cloudbeds (si ya lo tiene).
 */
export function referenciaVentaHotel(miembros: ReservaHotel[]): string {
  // Un grupo puede ser de muchas habitaciones: solo se cuenta cuántas, no se listan.
  const cabanas = miembros.length > 1 ? `${miembros.length} habitaciones` : miembros[0].cabana;
  const codigos = [...new Set(miembros.map((m) => m.cloudbeds_grupo_ref ?? m.cloudbeds_reservation_id).filter((c): c is string => !!c))].join(', ');
  return [cabanas, miembros.length > 1 ? 'Grupo' : '', codigos].filter(Boolean).join(' · ');
}

/**
 * Garantiza que la reserva tenga su venta en el Centro de Ventas: si aún no la tiene, la crea (reserva de hotel, directa)
 * con el total del POS (tarifa + extras) y la enlaza. Si es de un grupo, UNA sola venta cubre todas las habitaciones: se crea con
 * la suma de sus totales y se enlaza a todas (o se reutiliza la que alguna ya tenga, sumándole las que faltan).
 */
export async function asegurarVentaHotel(r: ReservaHotel, usuarioId?: string, grupo: ReservaHotel[] = []): Promise<{ reserva: ReservaHotel; ventaId: string }> {
  const miembros = grupo.length > 1 ? grupo.map((g) => (g.id === r.id ? r : g)) : [r];
  const existente = miembros.find((m) => m.venta_id)?.venta_id ?? null;
  const sin = miembros.filter((m) => !m.venta_id);
  if (existente && sin.length === 0) return { reserva: r, ventaId: existente };

  let ventaId = existente;
  if (!ventaId) {
    ventaId = crypto.randomUUID();
    const nombre = nombreHuesped(r);
    await createRxVenta({
      id: ventaId,
      origen: 'reserva_hotel',
      tipo: 'directa',
      cliente_id: r.cliente_id ?? undefined,
      cliente_nombre: nombre,
      referencia: referenciaVentaHotel(miembros),
      llegada: miembros.map((m) => m.llegada).sort()[0],
      salida: miembros.map((m) => m.salida).sort().at(-1),
      organization_id: orgActiva(),
      usuario_id: usuarioId,
    }, miembros.reduce((a, m) => a + totalConExtras(m), 0));
  } else {
    // La venta ya existía (otra habitación del grupo): las que se suman ahora aportan su total.
    for (const m of sin) await agregarVentaMovimiento({ venta_id: ventaId, tipo: 'ajuste', monto: totalConExtras(m), motivo: `Se suma ${m.cabana} al grupo`, usuario_id: usuarioId });
  }
  try {
    let reserva = r;
    for (const m of sin) {
      const n = await enlazarReservaHotel(m, { ventaId, clienteId: m.cliente_id });
      if (m.id === r.id) reserva = n;
    }
    return { reserva: { ...reserva, venta_id: ventaId }, ventaId };
  } catch (e) {
    // La venta quedó creada pero sin enlace: se avisa para no dejar un cobro sin reserva.
    throw new Error(`Se creó la venta pero no se pudo enlazar a la reserva (${e instanceof Error ? e.message : 'error desconocido'}). Concíliala desde «Conciliar con el Centro de Ventas».`);
  }
}

/**
 * Registra un anticipo en la venta de la reserva (la crea si no existe). En un grupo, `destino` dice si el pago es de una
 * habitación o de todo el grupo. Devuelve la reserva con su venta enlazada.
 */
export async function registrarAbonoHotel(
  r: ReservaHotel, d: DatosAbono, usuario: { id?: string; nombre?: string },
  opc: { grupo?: ReservaHotel[]; destino?: DestinoAbono } = {},
): Promise<ReservaHotel> {
  const grupo = opc.grupo && opc.grupo.length > 1 ? opc.grupo : [];
  const { reserva, ventaId } = await asegurarVentaHotel(r, usuario.id, grupo);
  // Se sube antes de crear el movimiento para que nazca ya con su comprobante (igual que en Ventas).
  const comprobante_url = d.comprobanteFile ? await subirComprobante(d.comprobanteFile, orgActiva(), ventaId) : undefined;
  const destino = opc.destino ?? 'grupo';
  await agregarVentaMovimiento({
    venta_id: ventaId,
    tipo: 'pago',
    monto: d.monto,
    metodo_pago: d.metodo,
    transferencia_banco: d.metodo === 'transferencia' ? d.bancoDestino : undefined,
    // El n.º de comprobante de tarjeta comparte campo con el de transferencia: el método del movimiento los distingue.
    transferencia_referencia: d.metodo === 'transferencia' || d.metodo === 'tarjeta' ? d.numeroComprobante : undefined,
    tarjeta_red: d.metodo === 'tarjeta' ? d.redTarjeta : undefined,
    comprobante_url,
    motivo: grupo.length ? motivoDe(destino, grupo) : undefined,
    usuario_id: usuario.id,
  });
  const para = !grupo.length ? '' : destino === 'grupo' ? ' · todo el grupo' : ` · ${grupo.find((g) => g.id === destino)?.cabana ?? ''}`;
  const afectadas = grupo.length && destino === 'grupo' ? grupo : [reserva];
  for (const a of afectadas) void registrarEventoHotel(a.id, 'cobro', `Pago de $${d.monto.toFixed(2)} (${d.metodo}${para}) registrado en el Centro de Ventas`, usuario.nombre);
  return reserva;
}

/** Números de factura que cubren un pago (los movimientos de factura de la venta que lo listan en `pagos_asociados`); vacío = sin factura vinculada. */
export function facturasDePago(movimientos: ReadonlyArray<{ tipo: string; anulado?: boolean; numero_factura?: string; pagos_asociados?: string[] }>, pagoId: string): string[] {
  const nums = movimientos
    .filter((f) => (f.tipo === 'anclar' || f.tipo === 'facturar') && !f.anulado && f.numero_factura && f.pagos_asociados?.includes(pagoId))
    .map((f) => f.numero_factura as string);
  return [...new Set(nums)];
}

export interface ResultadoVerificacion {
  /** Habitaciones que no estaban enlazadas y ahora lo están. */
  enlazadas: string[];
  /** Importe sumado a la venta porque no incluía a esas habitaciones (0 si ya lo traía). */
  ajuste: number;
  /** El grupo todavía no tiene venta (se crea con el primer anticipo). */
  sinVenta: boolean;
}

/**
 * Verifica que todas las habitaciones vigentes de un grupo estén enlazadas a la MISMA venta y repara las que quedaron sueltas
 * (p. ej. si falló el enlace al crear el grupo). Lee el estado fresco de la base. Solo suma a la venta lo que le falte de esas
 * habitaciones, para no contar dos veces lo que la venta ya incluía.
 */
export async function verificarEnlaceGrupo(grupo: ReservaHotel[], usuarioId?: string): Promise<ResultadoVerificacion> {
  const frescas = (await Promise.all(grupo.map((g) => leerReservaHotel(g.id).catch(() => null)))).map((f, i) => f ?? grupo[i]);
  const vigentes = frescas.filter((f) => f.estado === 'confirmada');
  const ventas = [...new Set(vigentes.map((v) => v.venta_id).filter((x): x is string => !!x))];
  if (ventas.length === 0) return { enlazadas: [], ajuste: 0, sinVenta: true };
  if (ventas.length > 1) throw new Error('Las habitaciones del grupo están enlazadas a ventas distintas. Revísalo en el Centro de Ventas.');
  const ventaId = ventas[0];
  const sueltas = vigentes.filter((v) => !v.venta_id);
  if (sueltas.length === 0) return { enlazadas: [], ajuste: 0, sinVenta: false };

  const venta = await leerVentaHotel(ventaId);
  if (!venta || venta.anulado) throw new Error('La venta del grupo no existe o está anulada: no se puede enlazar la habitación suelta.');
  for (const m of sueltas) await enlazarReservaHotel(m, { ventaId, clienteId: m.cliente_id });

  // Solo se suma lo que a la venta le falte de las habitaciones sueltas (la venta pudo crearse ya con el total de todo el grupo).
  const falta = vigentes.reduce((a, v) => a + totalConExtras(v), 0) - venta.montoTotal;
  const ajuste = Math.round(Math.min(falta, sueltas.reduce((a, m) => a + totalConExtras(m), 0)) * 100) / 100;
  if (ajuste > 0.005) {
    await agregarVentaMovimiento({ venta_id: ventaId, tipo: 'ajuste', monto: ajuste, motivo: `Se suma ${sueltas.map((m) => m.cabana).join(', ')} al grupo (verificación del enlace)`, usuario_id: usuarioId });
  }
  for (const m of sueltas) void registrarEventoHotel(m.id, 'conciliacion', 'Enlazada a la venta del grupo al verificar el enlace');
  return { enlazadas: sueltas.map((m) => m.cabana), ajuste: ajuste > 0.005 ? ajuste : 0, sinVenta: false };
}
