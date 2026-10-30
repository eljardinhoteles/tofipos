import dayjs from 'dayjs';
import { getCalendario, type DisponibilidadResp, type OfertaCabana, type TarjetaCalendario } from './cloudbeds';
import { claveEnlace, type HabitacionHotel } from './hotelHabitacionesApi';
import type { ReservaHotel } from './hotelReservasApi';
import type { TonoEstado } from '../components/Common/EstadoBadge';

/**
 * Caché en memoria de las tarjetas del calendario (reservas y bloqueos de Cloudbeds), por MES. La comparten el resumen
 * «Hoy» y el calendario: mirar uno deja el otro ya cargado. El Worker responde al instante con lo guardado, así que
 * volver a preguntar es barato y se revalida a menudo. Vive en el módulo: sobrevive a cambiar de pestaña.
 */
export const VIGENCIA_MS = 30_000;
// Si el Worker respondió con datos que está refrescando por detrás, se vuelve a preguntar en un instante.
const REINTENTOS_OBSOLETO = 4;
const ESPERA_REINTENTO_MS = 2200;

export type Bloque = { tarjetas: TarjetaCalendario[]; t: number; version: number; actualizado: number };
/** Tarjeta lista para pintar; `local` es la reserva del POS cuando la creó el POS. */
export type TarjetaVista = TarjetaCalendario & { local?: ReservaHotel };

const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

/**
 * Map que se vacía solo si cambia la organización activa: cada sucursal tiene su propio Cloudbeds, y cambiar de
 * organización (sin recargar la app) no debe mostrar el calendario de la otra.
 */
class PorOrganizacion<V> extends Map<string, V> {
  private org = orgActiva();
  private alinear() {
    const actual = orgActiva();
    if (actual !== this.org) { this.org = actual; super.clear(); }
  }
  get(k: string) { this.alinear(); return super.get(k); }
  has(k: string) { this.alinear(); return super.has(k); }
  set(k: string, v: V) { this.alinear(); return super.set(k, v); }
  values() { this.alinear(); return super.values(); }
  entries() { this.alinear(); return super.entries(); }
}

export const bloques = new PorOrganizacion<Bloque>();
const enCurso = new PorOrganizacion<Promise<void>>();
// Quien esté mirando se suscribe aquí para repintar cuando llegan datos nuevos (también los de fondo).
export const oyentes = new Set<() => void>();
export const avisar = () => oyentes.forEach((f) => f());

export const mesDe = (fecha: string) => fecha.slice(0, 7);
export const mesMas = (mes: string, n: number) => dayjs(`${mes}-01`).add(n, 'month').format('YYYY-MM');
export const vigente = (b: Bloque | undefined, version: number) => !!b && b.version === version && Date.now() - b.t < VIGENCIA_MS;

export const hace = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
};

/**
 * Pide las tarjetas de un mes entero (si no hay una consulta igual en vuelo) y las guarda. Si el Worker contesta con
 * datos que está refrescando por detrás (`obsoleto`), vuelve a pedirlos en un instante para traer los nuevos.
 */
export function cargarMes(mes: string, version: number, fresh = false, reintento = 0): Promise<void> {
  const previa = enCurso.get(mes);
  if (previa) return previa;
  const inicio = `${mes}-01`;
  const fin = dayjs(inicio).add(1, 'month').format('YYYY-MM-DD');
  const org = orgActiva();
  const p = getCalendario(inicio, fin, fresh)
    .then((r) => {
      // Si se cambió de organización mientras llegaba la respuesta, es de la otra sucursal: se descarta.
      if (orgActiva() !== org) return;
      falloConsulta = false;
      bloques.set(mes, { tarjetas: r.tarjetas, t: Date.now(), version, actualizado: r.actualizado });
      avisar();
      if (r.obsoleto && reintento < REINTENTOS_OBSOLETO) {
        setTimeout(() => { void cargarMes(mes, version, false, reintento + 1).then(avisar).catch(() => {}); }, ESPERA_REINTENTO_MS);
      }
    })
    .catch((e) => { falloConsulta = true; throw e; })
    .finally(() => { enCurso.delete(mes); avisar(); });
  enCurso.set(mes, p);
  // Quien muestre el indicador de carga (header del Hotel) debe enterarse de que empezó una consulta.
  queueMicrotask(avisar);
  return p;
}

// La última consulta del calendario falló (se limpia con la siguiente que salga bien): lo muestra el indicador del header.
let falloConsulta = false;
export const hayFalloConsulta = () => falloConsulta;

/** ¿Hay una consulta de calendario en curso? (para el indicador del header). */
export const consultando = () => enCurso.size > 0;

/** Cuándo se consultó Cloudbeds por última vez (ms), de lo que hay cargado; null si nada. */
export function ultimaConsulta(): number | null {
  let max: number | null = null;
  for (const b of bloques.values()) if (max === null || b.actualizado > max) max = b.actualizado;
  return max;
}

/**
 * Consulta a Cloudbeds en vivo el mes actual y el siguiente (lo que usan «Hoy», llegadas y salidas); el resto se
 * revalida solo por detrás. Se limita a dos meses para no gastar las peticiones que Cloudbeds permite.
 */
export function refrescarCercanos(version: number): Promise<PromiseSettledResult<void>[]> {
  const mes = dayjs().format('YYYY-MM');
  return Promise.allSettled([mes, mesMas(mes, 1)].map((m) => cargarMes(m, version, true)));
}

/** Tarjetas de los meses indicados, sin repetir las estadías que cruzan de un mes a otro. */
export function tarjetasDeMeses(meses: string[]): TarjetaCalendario[] {
  const unicas = new Map<string, TarjetaCalendario>();
  for (const m of meses) {
    for (const t of bloques.get(m)?.tarjetas ?? []) {
      // Con la unidad: una reserva de varias habitaciones del mismo tipo (Matrimonial #2, #4, #5) es UNA tarjeta por unidad.
      const key = `${t.tipo}:${t.id}:${t.roomTypeID}:${t.roomID ?? ''}`;
      if (!unicas.has(key)) unicas.set(key, t);
    }
  }
  return [...unicas.values()];
}

// Lo guardado debe ser reciente para usarlo como disponibilidad (los avisos de Cloudbeds lo refrescan antes si algo cambia).
const MAX_EDAD_LIBRES_MS = 15 * 60_000;

/**
 * Disponibilidad PROVISIONAL sacada de las tarjetas del calendario (reservas y bloqueos ya cargados), sin preguntar a
 * Cloudbeds: una habitación está libre si nada se cruza con [start, end). No sabe de restricciones de tarifa (estadía mínima,
 * cerrado a la llegada), así que solo sirve para mostrar algo al instante mientras llega la consulta real; al crear, el
 * Worker comprueba la disponibilidad en vivo. Carga los meses que falten (el Worker los sirve guardados, en milisegundos).
 * Devuelve null si no hay datos fiables.
 */
export async function disponibilidadDesdeCalendario(
  start: string, end: string, habitaciones: Array<Pick<HabitacionHotel, 'nombre' | 'activo' | 'capacidad' | 'cloudbeds_room_type_id' | 'cloudbeds_room_id'>>, version: number,
): Promise<DisponibilidadResp | null> {
  const meses = new Set<string>();
  for (let d = dayjs(start); d.isBefore(dayjs(end)); d = d.add(1, 'day')) meses.add(mesDe(d.format('YYYY-MM-DD')));
  const lista = [...meses];
  const fresco = (m: string) => { const b = bloques.get(m); return !!b && Date.now() - b.actualizado < MAX_EDAD_LIBRES_MS; };
  await Promise.all(lista.filter((m) => !fresco(m)).map((m) => cargarMes(m, version)));
  if (!lista.every(fresco)) return null;

  const tarjetas = tarjetasDeMeses(lista).filter((t) => t.desde < end && t.hasta > start);
  const vistas = new Set<string>();
  const ofertas: OfertaCabana[] = [];
  for (const h of habitaciones) {
    const id = h.cloudbeds_room_type_id;
    if (!h.activo || !id) continue;
    // Un tipo = una habitación: una oferta por tipo. Un tipo con varias unidades: una oferta por unidad (clave «tipo|unidad»), que
    // solo se cruza con las tarjetas de ESA unidad.
    const clave = claveEnlace(id, h.cloudbeds_room_id);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const cruce = tarjetas.filter((t) => t.roomTypeID === id && (h.cloudbeds_room_id == null || t.roomID === h.cloudbeds_room_id));
    const motivo = cruce.length === 0 ? null : cruce.some((t) => t.tipo === 'reserva') ? 'Sin disponibilidad' : 'Bloqueada';
    ofertas.push({
      roomTypeID: clave, roomTypeName: h.nombre, roomsAvailable: motivo ? 0 : 1, rateID: null, totalRate: 0, noches: [],
      reservable: !motivo, motivo, capacidad: h.capacidad, adultosIncluidos: null, planes: [],
    });
  }
  return { start, end, adults: 1, children: 0, ofertas };
}

/**
 * Unidades ocupadas o bloqueadas en [start, end) según el calendario ya cargado (claves «tipo|unidad»). Sirve para repartir la
 * disponibilidad de un tipo con varias unidades entre sus unidades. Devuelve null si no hay datos fiables de esos meses.
 */
export async function unidadesOcupadasDesdeCalendario(start: string, end: string, version: number): Promise<Set<string> | null> {
  const meses = new Set<string>();
  for (let d = dayjs(start); d.isBefore(dayjs(end)); d = d.add(1, 'day')) meses.add(mesDe(d.format('YYYY-MM-DD')));
  const lista = [...meses];
  const fresco = (m: string) => { const b = bloques.get(m); return !!b && Date.now() - b.actualizado < MAX_EDAD_LIBRES_MS; };
  await Promise.all(lista.filter((m) => !fresco(m)).map((m) => cargarMes(m, version)));
  if (!lista.every(fresco)) return null;
  const ocupadas = new Set<string>();
  for (const t of tarjetasDeMeses(lista)) if (t.desde < end && t.hasta > start && t.roomID) ocupadas.add(claveEnlace(t.roomTypeID, t.roomID));
  return ocupadas;
}

/** Estado de una reserva de Cloudbeds: texto y color del badge. */
export const TONO_ESTADO: Record<string, { tono: TonoEstado; texto: string }> = {
  confirmed: { tono: 'info', texto: 'Confirmada' },
  not_confirmed: { tono: 'warning', texto: 'Sin confirmar' },
  checked_in: { tono: 'success', texto: 'En casa' },
  checked_out: { tono: 'neutral', texto: 'Salió' },
};
