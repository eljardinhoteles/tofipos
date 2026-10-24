import { supabase } from './supabase';
import { getInventarioCloudbeds } from './cloudbeds';

/**
 * Mapa de habitaciones (habitaciones) del POS, enlazadas con su tipo de habitación de Cloudbeds. Viven en Supabase
 * (`hotel_habitaciones`), directo, sin RxDB. Ver supabase/migrations/20261017000200_hotel_habitaciones.sql.
 */
export interface HabitacionHotel {
  id: string;
  nombre: string;
  codigo: string | null;
  capacidad: number | null;
  orden: number;
  activo: boolean;
  cloudbeds_room_type_id: string | null;
  /**
   * Unidad de Cloudbeds (`roomID`, «<tipo>-<n>») cuando el tipo tiene VARIAS unidades (Matrimonial #2, #4, #5…): una habitación
   * del POS por unidad. NULL en el modelo «un tipo = una habitación»: la habitación es la única unidad de su tipo.
   */
  cloudbeds_room_id: string | null;
  /** Habitación de Mesas (id de la mesa del piso «Habitaciones») donde se abre la cuenta de esta habitación; NULL = sin enlazar. */
  mesa_id: string | null;
  /** Camas que puede llevar la habitación (información interna: no va a Cloudbeds). */
  camas: string[];
  /** Vista de la habitación («Al río», «Al jardín»): sale en cotizaciones y en la hoja de la reserva. */
  vista: string | null;
  /** Amenidades de la habitación («Wifi ilimitado», «Ventilador de techo»…). */
  amenidades: string[];
}

const COLUMNAS = 'id, nombre, codigo, capacidad, orden, activo, cloudbeds_room_type_id';
// `camas` viene de la migración 20261018000300: sin ella, la página funciona igual y no hay selector de cama.
let camasDisponible = true;
// `cloudbeds_room_id` viene de la migración 20261022000300 (unidades): sin ella solo existe el modelo «un tipo = una habitación».
export let unidadesDisponible = true;
// `mesa_id` viene de la migración 20261023000200 (enlace con la habitación de Mesas).
export let mesaEnlazableDisponible = true;
// `vista` y `amenidades` vienen de la migración 20261024000600: sin ella la página funciona igual, sin esos datos.
export let detallesDisponible = true;
const columnasHab = () => `${COLUMNAS}${unidadesDisponible ? ', cloudbeds_room_id' : ''}${mesaEnlazableDisponible ? ', mesa_id' : ''}${camasDisponible ? ', camas' : ''}${detallesDisponible ? ', vista, amenidades' : ''}`;

/** ¿Esta habitación es la unidad `roomID` de ese tipo? Una habitación sin unidad (un tipo = una habitación) es la única de su tipo. */
type ConUnidad = Pick<HabitacionHotel, 'cloudbeds_room_type_id'> & { cloudbeds_room_id?: string | null };
export const coincideUnidad = (h: ConUnidad, roomTypeID: string, roomID?: string | null) =>
  h.cloudbeds_room_type_id === roomTypeID && (h.cloudbeds_room_id == null || h.cloudbeds_room_id === (roomID ?? null));

/** La habitación del POS que corresponde a una reserva o tarjeta (tipo + unidad). */
export const habitacionDeUnidad = <T extends ConUnidad>(habitaciones: T[], roomTypeID: string, roomID?: string | null): T | undefined =>
  habitaciones.find((h) => coincideUnidad(h, roomTypeID, roomID));

/** Parte «tipo» y parte «unidad» de una clave de enlace («tipo» o «tipo|unidad»). */
export const tipoDeClave = (clave: string) => clave.split('|')[0];
export const unidadDeClave = (clave: string): string | null => clave.split('|')[1] ?? null;

/** La habitación del POS de una clave de enlace: la de esa unidad o, si el tipo no tiene unidades en el POS, la del tipo. */
export const habitacionDeClave = <T extends ConUnidad>(habitaciones: T[], clave: string): T | undefined =>
  habitaciones.find((h) => claveEnlace(h.cloudbeds_room_type_id, h.cloudbeds_room_id) === clave)
  ?? habitaciones.find((h) => h.cloudbeds_room_type_id === tipoDeClave(clave) && h.cloudbeds_room_id == null);

/** Clave de enlace de una unidad de Cloudbeds: el tipo solo, o «tipo|unidad». */
export const claveEnlace = (roomTypeID: string | null | undefined, roomID?: string | null) => (roomTypeID ? (roomID ? `${roomTypeID}|${roomID}` : roomTypeID) : '');
const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

export async function listarHabitaciones(): Promise<HabitacionHotel[]> {
  const consultar = () => supabase
    .from('hotel_habitaciones')
    .select(columnasHab())
    .eq('organization_id', orgActiva())
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  let { data, error } = await consultar();
  for (let i = 0; i < 2 && error?.code === '42703'; i++) {
    if (detallesDisponible && /vista|amenidades/.test(error.message)) { console.warn('hotel_habitaciones sin columnas vista/amenidades: falta la migración 20261024000600'); detallesDisponible = false; }
    else if (mesaEnlazableDisponible && /mesa_id/.test(error.message)) { console.warn('hotel_habitaciones sin columna mesa_id: falta la migración 20261023000200'); mesaEnlazableDisponible = false; }
    else if (unidadesDisponible && /cloudbeds_room_id/.test(error.message)) { console.warn('hotel_habitaciones sin columna cloudbeds_room_id: falta la migración 20261022000300'); unidadesDisponible = false; }
    else if (camasDisponible) { console.warn('hotel_habitaciones sin columna camas: falta la migración 20261018000300'); camasDisponible = false; }
    else break;
    ({ data, error } = await consultar());
  }
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<Omit<HabitacionHotel, 'camas' | 'cloudbeds_room_id' | 'mesa_id' | 'vista' | 'amenidades'> & { camas?: unknown; cloudbeds_room_id?: string | null; mesa_id?: string | null; vista?: string | null; amenidades?: unknown }>).map((h) => ({ ...h, cloudbeds_room_id: h.cloudbeds_room_id ?? null, mesa_id: h.mesa_id ?? null, camas: Array.isArray(h.camas) ? (h.camas as string[]) : [], vista: h.vista ?? null, amenidades: Array.isArray(h.amenidades) ? (h.amenidades as string[]) : [] }));
}

export type DatosHabitacion = Pick<HabitacionHotel, 'nombre' | 'codigo' | 'capacidad' | 'activo' | 'cloudbeds_room_type_id'> & { camas?: string[]; cloudbeds_room_id?: string | null; mesa_id?: string | null; vista?: string | null; amenidades?: string[] };

const errorColumna = (e: { code?: string; message: string }) =>
  /vista|amenidades/.test(e.message) ? 'Para guardar la vista y las amenidades ejecuta la migración 20261024000600_hotel_habitaciones_amenidades_vista.sql en Supabase'
  : /mesa_id/.test(e.message) && e.code !== '23505' ? 'Para enlazar con Mesas ejecuta la migración 20261023000200_hotel_habitaciones_mesa.sql en Supabase'
  : /cloudbeds_room_id/.test(e.message) ? 'Para enlazar unidades ejecuta la migración 20261022000300_hotel_unidades.sql en Supabase'
  : e.code === '42703' || /camas/.test(e.message) ? 'Para guardar camas ejecuta la migración 20261018000300_hotel_camas.sql en Supabase' : e.message;
const ENLAZADO = 'Esa unidad o tipo de Cloudbeds ya está enlazado a otra habitación';
const errorEnlace = (e: { code?: string; message: string }) => e.code === '23505' ? (/hotel_habitaciones_mesa_idx/.test(e.message) ? 'Esa habitación de Mesas ya está enlazada a otra habitación del Hotel' : ENLAZADO) : errorColumna(e);
// Sin las migraciones de unidades o de Mesas, un `cloudbeds_room_id` o `mesa_id` vacío no se envía (la columna no existe); uno con valor sí
// falla con un aviso claro.
const sinUnidadVacia = <T extends { cloudbeds_room_id?: string | null; mesa_id?: string | null }>(d: T): T => {
  const r: T = { ...d };
  if (!unidadesDisponible && !r.cloudbeds_room_id) delete r.cloudbeds_room_id;
  if (!mesaEnlazableDisponible && !r.mesa_id) delete r.mesa_id;
  // Sin la migración de vista y amenidades, vacíos no se envían (la columna no existe).
  const x = r as { vista?: string | null; amenidades?: string[] };
  if (!detallesDisponible) { if (!x.vista) delete x.vista; if (!x.amenidades?.length) delete x.amenidades; }
  return r;
};

export async function crearHabitacion(d: DatosHabitacion, orden: number): Promise<void> {
  const { camas, ...resto } = sinUnidadVacia(d);
  const { error } = await supabase.from('hotel_habitaciones').insert({
    id: crypto.randomUUID(),
    organization_id: orgActiva(),
    ...resto,
    ...(camas && camas.length > 0 ? { camas } : {}),
    orden,
  });
  if (error) throw new Error(errorEnlace(error));
}

export async function actualizarHabitacion(id: string, patch: Partial<DatosHabitacion & { orden: number }>): Promise<void> {
  const { error } = await supabase
    .from('hotel_habitaciones')
    .update({ ...sinUnidadVacia(patch), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgActiva());
  if (error) throw new Error(errorEnlace(error));
}

/** Intercambia el orden de dos habitaciones (subir/bajar en la lista). */
export async function intercambiarOrden(a: HabitacionHotel, b: HabitacionHotel): Promise<void> {
  await Promise.all([actualizarHabitacion(a.id, { orden: b.orden }), actualizarHabitacion(b.id, { orden: a.orden })]);
}

/**
 * Crea las habitaciones que falten según el inventario de Cloudbeds, sin tocar las existentes (lo renombrado o reordenado se
 * conserva). Un tipo con UNA unidad crea una habitación enlazada al tipo (modelo «un tipo = una habitación»); un tipo con VARIAS
 * unidades crea una habitación por unidad (Matrimonial #2, #4…), enlazada a su `roomID`. Devuelve cuántas se crearon.
 */
export async function importarDesdeCloudbeds(existentes: HabitacionHotel[]): Promise<number> {
  const { tipos, unidades } = await getInventarioCloudbeds();
  let orden = existentes.reduce((m, h) => Math.max(m, h.orden), 0);
  const filas: Array<Record<string, unknown>> = [];
  for (const t of tipos) {
    const delTipo = existentes.filter((h) => h.cloudbeds_room_type_id === t.roomTypeID);
    // Cloudbeds las devuelve en cualquier orden (#4, #5, #2, #11): se ordenan por nombre, con los números como números.
    const units = unidades.filter((u) => u.roomTypeID === t.roomTypeID).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
    if (units.length > 1) {
      // Varias unidades: una habitación por unidad. Si ya hay una habitación enlazada solo al tipo (sin unidad) se respeta y se avisa al enlazar a mano.
      if (delTipo.some((h) => h.cloudbeds_room_id == null)) continue;
      for (const u of units) {
        if (delTipo.some((h) => h.cloudbeds_room_id === u.roomID)) continue;
        filas.push({ id: crypto.randomUUID(), organization_id: orgActiva(), nombre: u.nombre || t.nombre, codigo: t.codigo, capacidad: t.capacidad, orden: ++orden, activo: true, cloudbeds_room_type_id: t.roomTypeID, cloudbeds_room_id: u.roomID });
      }
    } else if (delTipo.length === 0) {
      filas.push({ id: crypto.randomUUID(), organization_id: orgActiva(), nombre: units[0]?.nombre || t.nombre, codigo: t.codigo, capacidad: t.capacidad, orden: ++orden, activo: true, cloudbeds_room_type_id: t.roomTypeID });
    }
  }
  if (filas.length === 0) return 0;
  if (!unidadesDisponible && filas.some((f) => f.cloudbeds_room_id)) throw new Error('Para importar unidades ejecuta la migración 20261022000300_hotel_unidades.sql en Supabase');
  const { error } = await supabase.from('hotel_habitaciones').insert(filas);
  if (error) throw new Error(errorEnlace(error));
  return filas.length;
}

/**
 * Tras renombrar una habitación del Hotel, las reservas que ya la usan guardan su nombre en un campo de texto: se actualiza para que
 * la lista, la búsqueda y las llegadas muestren el nombre nuevo. Solo las de esa habitación (tipo y, si lo hay, unidad).
 */
export async function propagarNombreHabitacion(h: Pick<HabitacionHotel, 'cloudbeds_room_type_id' | 'cloudbeds_room_id'>, nombre: string): Promise<void> {
  if (!h.cloudbeds_room_type_id) return;
  let q = supabase.from('hotel_reservas').update({ cabana: nombre }).eq('organization_id', orgActiva()).eq('room_type_id', h.cloudbeds_room_type_id);
  if (h.cloudbeds_room_id) q = q.eq('room_id', h.cloudbeds_room_id);
  const { error } = await q;
  if (error) console.warn('No se pudo actualizar el nombre en las reservas', error.message);
}
