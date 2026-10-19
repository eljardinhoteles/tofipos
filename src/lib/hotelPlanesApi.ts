import { supabase } from './supabase';

/**
 * Planes de alimentación del hotel (tabla `hotel_planes_alimentacion`). Se crean en el POS y se asignan a cada reserva según sus
 * adultos y niños. Pueden estar INCLUIDOS en la tarifa (no se cobran aparte) o tener PRECIO por adulto y niño por noche, que se suma
 * a la reserva como un extra. Nada de esto va a Cloudbeds.
 */
export interface PlanAlimentacion {
  id: string;
  nombre: string;
  /** Qué incluye para ADULTOS (y, si `incluye_nino` está vacío, también para niños). */
  descripcion: string | null;
  /** Qué incluye para NIÑOS, si es distinto. */
  incluye_nino: string | null;
  precio_adulto: number;
  precio_nino: number;
  /** true = va incluido en la tarifa (no se cobra); false = se cobra según sus precios. */
  incluido: boolean;
  por_defecto: boolean;
  activo: boolean;
  orden: number;
}

/** Copia del plan guardada en la reserva: cambiar o desactivar el plan después no altera lo ya reservado. */
export interface PlanReserva {
  id: string;
  nombre: string;
  descripcion: string | null;
  incluye_nino?: string | null;
  precio_adulto: number;
  precio_nino: number;
  /** Ausente en reservas anteriores = incluido. */
  incluido?: boolean;
}

const COLUMNAS = 'id, nombre, descripcion, incluye_nino, precio_adulto, precio_nino, incluido, por_defecto, activo, orden';
// `incluye_nino` viene de la migración 20261019000400: sin ella, lo que incluye es igual para adultos y niños.
let incluyeNinoDisponible = true;
// `incluido` viene de la migración 20261019000300: sin ella, todos los planes se tratan como incluidos.
let incluidoDisponible = true;
const columnasPlanes = () => COLUMNAS.split(', ').filter((c) => (c !== 'incluido' || incluidoDisponible) && (c !== 'incluye_nino' || incluyeNinoDisponible)).join(', ');
const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

/** Sin la migración 20261019000200 la página funciona igual, sin planes. */
export let planesDisponibles = true;
const tablaFaltante = (e: { code?: string; message?: string } | null) => e?.code === '42P01' || /hotel_planes_alimentacion/.test(e?.message ?? '');

export const copiaDePlan = (p: PlanAlimentacion): PlanReserva => ({ id: p.id, nombre: p.nombre, descripcion: p.descripcion, incluye_nino: p.incluye_nino, precio_adulto: p.precio_adulto, precio_nino: p.precio_nino, incluido: p.incluido });

/** ¿El plan se cobra? (tiene precio y no está incluido en la tarifa). */
export const planSeCobra = (p: Pick<PlanReserva, 'precio_adulto' | 'precio_nino' | 'incluido'> | null | undefined) =>
  !!p && p.incluido === false && (p.precio_adulto > 0 || p.precio_nino > 0);

/** Importe del plan para unos huéspedes y noches: (adultos × precio adulto + niños × precio niño) × noches. 0 si va incluido. */
export const importePlan = (p: Pick<PlanReserva, 'precio_adulto' | 'precio_nino' | 'incluido'>, adultos: number, ninos: number, noches: number) =>
  planSeCobra(p) ? Math.round((adultos * p.precio_adulto + ninos * p.precio_nino) * noches * 100) / 100 : 0;

export async function listarPlanes(): Promise<PlanAlimentacion[]> {
  const consultar = () => supabase
    .from('hotel_planes_alimentacion')
    .select(columnasPlanes())
    .eq('organization_id', orgActiva())
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  let { data, error } = await consultar();
  for (let i = 0; i < 2 && error?.code === '42703'; i++) {
    if (incluyeNinoDisponible && /incluye_nino/.test(error.message)) { console.warn('hotel_planes_alimentacion sin columna incluye_nino: falta la migración 20261019000400'); incluyeNinoDisponible = false; }
    else if (incluidoDisponible) { console.warn('hotel_planes_alimentacion sin columna incluido: falta la migración 20261019000300'); incluidoDisponible = false; }
    else break;
    ({ data, error } = await consultar());
  }
  if (error) {
    if (tablaFaltante(error)) { console.warn('Falta la migración 20261019000200_hotel_planes_alimentacion.sql'); planesDisponibles = false; return []; }
    throw new Error(error.message);
  }
  planesDisponibles = true;
  return ((data ?? []) as unknown as Array<Omit<PlanAlimentacion, 'precio_adulto' | 'precio_nino' | 'incluido'> & { precio_adulto: unknown; precio_nino: unknown; incluido?: boolean; incluye_nino?: string | null }>)
    .map((p) => ({ ...p, incluye_nino: p.incluye_nino ?? null, precio_adulto: Number(p.precio_adulto) || 0, precio_nino: Number(p.precio_nino) || 0, incluido: p.incluido !== false }));
}

export type DatosPlan = Pick<PlanAlimentacion, 'nombre' | 'descripcion' | 'incluye_nino' | 'precio_adulto' | 'precio_nino' | 'incluido' | 'por_defecto' | 'activo'>;

/** Sin la migración del cobro, `incluido` no se envía (la columna no existe). */
/** Quita de lo que se escribe las columnas que aún no existen (migraciones sin ejecutar). */
function soloColumnasExistentes<T extends { incluido?: boolean; incluye_nino?: string | null }>(d: T): Partial<T> {
  const resto = { ...d } as Partial<T> & { incluido?: boolean; incluye_nino?: string | null };
  if (!incluidoDisponible) delete resto.incluido;
  if (!incluyeNinoDisponible) delete resto.incluye_nino;
  return resto;
}
const errorPlan = (e: { code?: string; message: string }) => (e.code === '42703' || /incluido/.test(e.message) ? 'Para cobrar planes ejecuta la migración 20261019000300_hotel_planes_cobro.sql en Supabase' : e.message);

/** Deja un solo plan por defecto: antes de marcar uno se desmarca el anterior. */
async function liberarDefecto(exceptoId?: string) {
  let q = supabase.from('hotel_planes_alimentacion').update({ por_defecto: false, updated_at: new Date().toISOString() }).eq('organization_id', orgActiva()).eq('por_defecto', true);
  if (exceptoId) q = q.neq('id', exceptoId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function crearPlan(d: DatosPlan, orden: number): Promise<void> {
  if (d.por_defecto) await liberarDefecto();
  if (!incluidoDisponible && d.incluido === false) throw new Error(errorPlan({ message: 'incluido' }));
  if (!incluyeNinoDisponible && d.incluye_nino && d.incluye_nino !== d.descripcion) throw new Error('Para distinguir lo que incluye para niños ejecuta la migración 20261019000400_hotel_planes_incluye.sql en Supabase');
  const { error } = await supabase.from('hotel_planes_alimentacion').insert({ id: crypto.randomUUID(), organization_id: orgActiva(), ...soloColumnasExistentes(d), orden });
  if (error) throw new Error(tablaFaltante(error) ? 'Ejecuta la migración 20261019000200_hotel_planes_alimentacion.sql en Supabase' : errorPlan(error));
}

export async function actualizarPlan(id: string, patch: Partial<DatosPlan & { orden: number }>): Promise<void> {
  // Un plan inactivo no puede ser el predeterminado.
  const datos = patch.activo === false ? { ...patch, por_defecto: false } : patch;
  if (datos.por_defecto) await liberarDefecto(id);
  if (!incluidoDisponible && datos.incluido === false) throw new Error(errorPlan({ message: 'incluido' }));
  if (!incluyeNinoDisponible && datos.incluye_nino && datos.incluye_nino !== datos.descripcion) throw new Error('Para distinguir lo que incluye para niños ejecuta la migración 20261019000400_hotel_planes_incluye.sql en Supabase');
  const { error } = await supabase.from('hotel_planes_alimentacion').update({ ...soloColumnasExistentes(datos), updated_at: new Date().toISOString() }).eq('id', id).eq('organization_id', orgActiva());
  if (error) throw new Error(errorPlan(error));
}

/** Qué incluye el plan, separado por quién lo recibe. Si adultos y niños reciben lo mismo (o no hay niños), una sola línea sin etiqueta. */
export function incluyeDelPlan(p: Pick<PlanReserva, 'descripcion' | 'incluye_nino'>, ninos: number): Array<{ quien: 'Adultos' | 'Niños' | null; texto: string }> {
  const adulto = p.descripcion?.trim() || '';
  const nino = p.incluye_nino?.trim() || adulto;
  if (!adulto && !nino) return [];
  if (ninos <= 0 || nino === adulto) return [{ quien: null, texto: adulto || nino }];
  return [...(adulto ? [{ quien: 'Adultos' as const, texto: adulto }] : []), { quien: 'Niños' as const, texto: nino }];
}

/** Qué recibe cada uno según el plan: lo de los adultos y lo de los niños (los niños, igual que adultos si no se definió aparte). */
export const incluyePorPersona = (p: Pick<PlanReserva, 'descripcion' | 'incluye_nino'>) => {
  const adulto = p.descripcion?.trim() || '';
  return { adulto, nino: p.incluye_nino?.trim() || adulto };
};
