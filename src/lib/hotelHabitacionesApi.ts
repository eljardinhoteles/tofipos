import { supabase } from './supabase';
import { getTiposHabitacion } from './cloudbeds';

/**
 * Mapa de habitaciones (cabañas) del POS, enlazadas con su tipo de habitación de Cloudbeds. Viven en Supabase
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
  /** Camas que puede llevar la habitación (información interna: no va a Cloudbeds). */
  camas: string[];
}

const COLUMNAS = 'id, nombre, codigo, capacidad, orden, activo, cloudbeds_room_type_id';
// `camas` viene de la migración 20261018000300: sin ella, la página funciona igual y no hay selector de cama.
let camasDisponible = true;
const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

export async function listarHabitaciones(): Promise<HabitacionHotel[]> {
  const consultar = () => supabase
    .from('hotel_habitaciones')
    .select(camasDisponible ? `${COLUMNAS}, camas` : COLUMNAS)
    .eq('organization_id', orgActiva())
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  let { data, error } = await consultar();
  if (error?.code === '42703' && camasDisponible) { console.warn('hotel_habitaciones sin columna camas: falta la migración 20261018000300'); camasDisponible = false; ({ data, error } = await consultar()); }
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<Omit<HabitacionHotel, 'camas'> & { camas?: unknown }>).map((h) => ({ ...h, camas: Array.isArray(h.camas) ? (h.camas as string[]) : [] }));
}

export type DatosHabitacion = Pick<HabitacionHotel, 'nombre' | 'codigo' | 'capacidad' | 'activo' | 'cloudbeds_room_type_id'> & { camas?: string[] };

const errorColumna = (e: { code?: string; message: string }) => e.code === '42703' || /camas/.test(e.message) ? 'Para guardar camas ejecuta la migración 20261018000300_hotel_camas.sql en Supabase' : e.message;

export async function crearHabitacion(d: DatosHabitacion, orden: number): Promise<void> {
  const { camas, ...resto } = d;
  const { error } = await supabase.from('hotel_habitaciones').insert({
    id: crypto.randomUUID(),
    organization_id: orgActiva(),
    ...resto,
    ...(camas && camas.length > 0 ? { camas } : {}),
    orden,
  });
  if (error) throw new Error(error.code === '23505' ? 'Ese tipo de Cloudbeds ya está enlazado a otra habitación' : errorColumna(error));
}

export async function actualizarHabitacion(id: string, patch: Partial<DatosHabitacion & { orden: number }>): Promise<void> {
  const { error } = await supabase
    .from('hotel_habitaciones')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgActiva());
  if (error) throw new Error(error.code === '23505' ? 'Ese tipo de Cloudbeds ya está enlazado a otra habitación' : errorColumna(error));
}

/** Intercambia el orden de dos habitaciones (subir/bajar en la lista). */
export async function intercambiarOrden(a: HabitacionHotel, b: HabitacionHotel): Promise<void> {
  await Promise.all([actualizarHabitacion(a.id, { orden: b.orden }), actualizarHabitacion(b.id, { orden: a.orden })]);
}

/**
 * Crea una habitación por cada tipo de Cloudbeds que aún no esté enlazado. No toca las existentes: lo que ya se
 * renombró o reordenó en el POS se conserva. Devuelve cuántas se crearon.
 */
export async function importarDesdeCloudbeds(existentes: HabitacionHotel[]): Promise<number> {
  const tipos = await getTiposHabitacion();
  const enlazados = new Set(existentes.map((h) => h.cloudbeds_room_type_id).filter(Boolean));
  const nuevos = tipos.filter((t) => !enlazados.has(t.roomTypeID));
  if (nuevos.length === 0) return 0;
  let orden = existentes.reduce((m, h) => Math.max(m, h.orden), 0);
  const filas = nuevos.map((t) => ({
    id: crypto.randomUUID(),
    organization_id: orgActiva(),
    nombre: t.nombre,
    codigo: t.codigo,
    capacidad: t.capacidad,
    orden: ++orden,
    activo: true,
    cloudbeds_room_type_id: t.roomTypeID,
  }));
  const { error } = await supabase.from('hotel_habitaciones').insert(filas);
  if (error) throw new Error(error.message);
  return filas.length;
}
