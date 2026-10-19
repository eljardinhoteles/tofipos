import { agregarVentaMovimiento, createRxVenta, initVerticalRxDb, type RxVenta } from '../db/rxdb';
import { subirComprobante } from './comprobantes';
import { calcularVenta, type VentaConMovimientos } from './ventaConMovimientos';
import { enlazarReservaHotel, nombreHuesped, registrarEventoHotel, totalConExtras, type ReservaHotel } from './hotelReservasApi';

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

/** A quién corresponde un pago de un grupo: a una cabaña en particular o a todo el grupo. */
export type DestinoAbono = 'grupo' | string; // 'grupo' o el id de la reserva (cabaña)

const ETIQUETA = /^\[hotel:([^\]]+)\]\s*(.*)$/;

/** El motivo del movimiento guarda la atribución (visible en Ventas como texto: «Cabaña con Jacuzzi #2» o «Todo el grupo»). */
const motivoDe = (destino: DestinoAbono, grupo: ReservaHotel[]) =>
  destino === 'grupo' ? '[hotel:grupo] Todo el grupo' : `[hotel:${destino}] ${grupo.find((g) => g.id === destino)?.cabana ?? 'Cabaña'}`;

/** Lee la atribución de un movimiento: `destino` es 'grupo', el id de una reserva, o null si no tiene (pagos antiguos o hechos en Ventas). */
export function atribucionDePago(motivo: string | undefined): { destino: DestinoAbono; texto: string } | null {
  const m = motivo ? ETIQUETA.exec(motivo) : null;
  return m ? { destino: m[1], texto: m[2] } : null;
}

/** Texto de un motivo de movimiento sin la etiqueta interna. */
export const motivoLegible = (motivo: string | undefined) => (motivo ? motivo.replace(ETIQUETA, '$2') : '');

/**
 * Garantiza que la reserva tenga su venta en el Centro de Ventas: si aún no la tiene, la crea (reserva de hotel, directa)
 * con el total del POS (tarifa + extras) y la enlaza. Si es de un grupo, UNA sola venta cubre todas las cabañas: se crea con
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
      referencia: miembros.length > 1 ? `Reserva de hotel — ${nombre} · ${miembros.length} cabañas` : `Reserva de hotel — ${nombre} · ${r.cabana}`,
      llegada: miembros.map((m) => m.llegada).sort()[0],
      salida: miembros.map((m) => m.salida).sort().at(-1),
      organization_id: orgActiva(),
      usuario_id: usuarioId,
    }, miembros.reduce((a, m) => a + totalConExtras(m), 0));
  } else {
    // La venta ya existía (otra cabaña del grupo): las que se suman ahora aportan su total.
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
 * cabaña o de todo el grupo. Devuelve la reserva con su venta enlazada.
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
  for (const a of afectadas) void registrarEventoHotel(a.id, 'cobro', `Anticipo de $${d.monto.toFixed(2)} (${d.metodo}${para}) registrado en el Centro de Ventas`, usuario.nombre);
  return reserva;
}
