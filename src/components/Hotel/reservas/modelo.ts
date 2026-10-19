import dayjs from 'dayjs';
import type { TarjetaCalendario } from '../../../lib/cloudbeds';
import type { HabitacionHotel } from '../../../lib/hotelHabitacionesApi';
import { nombreHuesped, type ReservaHotel } from '../../../lib/hotelReservasApi';

/** Cómo está la estadía respecto de hoy (`salida` es el día de salida, no incluido). */
export type Estadia = 'en_casa' | 'llegan_hoy' | 'salen_hoy' | 'proximas' | 'pasadas';
/** Estado de la reserva en el POS: vigente en Cloudbeds, por subir, rechazada por Cloudbeds o cancelada. */
export type Estado = 'confirmada' | 'pendiente' | 'rechazada' | 'cancelada';
export type Pago = 'pagado' | 'parcial' | 'sin_pago' | 'sin_venta';
/** Qué se está mirando: la actividad de un día (llegadas, salidas…) o todas las reservas del POS. */
export type Vista = 'llegadas' | 'salidas' | 'in_house' | 'pernoctaciones' | 'nuevas' | 'canceladas' | 'todas';
export const VISTAS: Vista[] = ['llegadas', 'salidas', 'in_house', 'pernoctaciones', 'nuevas', 'canceladas', 'todas'];

/**
 * Una fila de la tabla. Une las dos fuentes: la reserva del POS (`r`, con huésped, extras y cobros) y la tarjeta de Cloudbeds
 * (`t`, con el estado de check-in). Una reserva de Cloudbeds que aún no se enlazó tiene solo `t`; una que quedó sin subir, solo `r`.
 */
export interface Fila {
  clave: string;
  r?: ReservaHotel;
  t?: TarjetaCalendario;
  nombre: string;
  roomTypeID: string;
  cabana: string;
  llegada: string;
  salida: string;
  adultos: number;
  ninos: number;
  canal: string;
  estado: Estado;
  /** Código de la reserva en Cloudbeds, si ya está allá. */
  codigo: string | null;
  /** Día en que se creó («AAAA-MM-DD»), para «Nuevas». */
  creada: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const canalDeReserva = (r: ReservaHotel) => (r.adoptada ? r.fuente_nombre || 'Cloudbeds' : 'POS');
// Las reservas que creó el POS llevan su id como identificador externo en Cloudbeds.
const canalDeTarjeta = (t: TarjetaCalendario) => (t.externo && UUID_RE.test(t.externo) ? 'POS' : t.fuente || 'Cloudbeds');

// Una reserva que Cloudbeds rechazó queda cancelada en el POS con `sync_estado = 'error'`: se distingue de una cancelación normal.
export const estadoDe = (r: ReservaHotel): Estado =>
  r.sync_estado === 'error' ? 'rechazada' : r.estado === 'cancelada' ? 'cancelada' : r.sync_estado === 'sincronizada' ? 'confirmada' : 'pendiente';

export function estadiaDe(f: Pick<Fila, 'llegada' | 'salida'>, hoy: string): Estadia {
  if (f.llegada === hoy) return 'llegan_hoy';
  if (f.salida === hoy) return 'salen_hoy';
  if (f.llegada < hoy && f.salida > hoy) return 'en_casa';
  return f.llegada > hoy ? 'proximas' : 'pasadas';
}

export const PESO_ESTADIA: Record<Estadia, number> = { llegan_hoy: 0, salen_hoy: 1, en_casa: 2, proximas: 3, pasadas: 4 };

/** Reserva viva: ni cancelada ni rechazada. */
export const esViva = (f: Pick<Fila, 'estado'>) => f.estado !== 'cancelada' && f.estado !== 'rechazada';

function filaDeReserva(r: ReservaHotel, t?: TarjetaCalendario): Fila {
  return {
    clave: `r:${r.id}`, r, t, nombre: nombreHuesped(r), roomTypeID: r.room_type_id, cabana: r.cabana, llegada: r.llegada, salida: r.salida,
    adultos: r.adultos, ninos: r.ninos, canal: canalDeReserva(r), estado: estadoDe(r), codigo: r.cloudbeds_reservation_id,
    creada: t?.creada ? t.creada.slice(0, 10) : dayjs(r.created_at).format('YYYY-MM-DD'),
  };
}

function filaDeTarjeta(t: TarjetaCalendario, nombreCabana: (roomTypeID: string) => string): Fila {
  return {
    clave: `t:${t.id}:${t.roomTypeID}`, t, nombre: t.nombre, roomTypeID: t.roomTypeID, cabana: nombreCabana(t.roomTypeID), llegada: t.desde, salida: t.hasta,
    adultos: t.adultos ?? 1, ninos: t.ninos ?? 0, canal: canalDeTarjeta(t), estado: 'confirmada', codigo: t.id, creada: t.creada ? t.creada.slice(0, 10) : null,
  };
}

/**
 * Todas las reservas que se conocen: las tarjetas de Cloudbeds cargadas (cada una enlazada con su reserva del POS si la hay)
 * más las del POS que no tienen tarjeta (por ejemplo, las que aún no subieron a Cloudbeds o las canceladas).
 */
export function construirFilas(tarjetas: TarjetaCalendario[], reservas: ReservaHotel[], nombreCabana: (roomTypeID: string) => string): Fila[] {
  const porId = new Map(reservas.map((r) => [r.id, r]));
  const porCb = new Map(reservas.filter((r) => r.cloudbeds_reservation_id).map((r) => [r.cloudbeds_reservation_id as string, r]));
  const usadas = new Set<string>();
  const out: Fila[] = [];
  for (const t of tarjetas) {
    if (t.tipo !== 'reserva') continue;
    const local = porCb.get(t.id) ?? (t.externo ? porId.get(t.externo) : undefined);
    if (local) { usadas.add(local.id); out.push(filaDeReserva(local, t)); } else out.push(filaDeTarjeta(t, nombreCabana));
  }
  for (const r of reservas) if (!usadas.has(r.id)) out.push(filaDeReserva(r));
  return out;
}

/** ¿Pertenece la fila a esa vista en el día `fecha`? */
export function enVista(f: Fila, vista: Vista, fecha: string): boolean {
  const duerme = f.llegada <= fecha && fecha < f.salida;
  switch (vista) {
    case 'llegadas': return esViva(f) && f.llegada === fecha;
    case 'salidas': return esViva(f) && f.salida === fecha;
    // «En casa»: ya llegaron (hicieron check-in, o llegaron un día anterior). «Pernoctaciones»: todas las que duermen esa noche.
    case 'in_house': return esViva(f) && duerme && (f.t?.estado === 'checked_in' || f.llegada < fecha);
    case 'pernoctaciones': return esViva(f) && duerme;
    case 'nuevas': return f.creada === fecha;
    case 'canceladas': return f.estado === 'cancelada' && f.llegada <= fecha && fecha <= f.salida;
    case 'todas': return !!f.r;
  }
}

export interface Ocupacion {
  total: number;
  ocupadas: number;
  bloqueadas: number;
  fueraDeServicio: number;
  disponibles: number;
  /** 0–100. */
  tasa: number;
}

/** Ocupación de las cabañas activas y enlazadas en un día, con lo que las reservas y los bloqueos cargados dicen. */
export function ocupacionDelDia(filas: Fila[], tarjetas: TarjetaCalendario[], habitaciones: HabitacionHotel[], fecha: string): Ocupacion {
  const activas = new Set(habitaciones.filter((h) => h.activo && h.cloudbeds_room_type_id).map((h) => h.cloudbeds_room_type_id as string));
  const ocupadas = new Set(filas.filter((f) => enVista(f, 'pernoctaciones', fecha) && activas.has(f.roomTypeID)).map((f) => f.roomTypeID));
  const bloqueos = tarjetas.filter((t) => t.tipo === 'bloqueo' && t.desde <= fecha && fecha < t.hasta && activas.has(t.roomTypeID));
  const bloqueadas = new Set(bloqueos.map((t) => t.roomTypeID).filter((id) => !ocupadas.has(id)));
  const fuera = new Set(bloqueos.filter((t) => t.tipoBloqueo === 'out_of_service').map((t) => t.roomTypeID));
  const total = activas.size;
  return {
    total, ocupadas: ocupadas.size, bloqueadas: bloqueadas.size, fueraDeServicio: fuera.size,
    disponibles: Math.max(0, total - ocupadas.size - bloqueadas.size),
    tasa: total > 0 ? (ocupadas.size / total) * 100 : 0,
  };
}
