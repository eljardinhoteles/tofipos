import dayjs from 'dayjs';
import { supabase } from './supabase';

// Cotizaciones del Hotel (tabla `hotel_cotizaciones`): una copia de lo cotizado —cabañas, camas, plan, extras y precio final—, vigente 48 horas.

const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

/** Horas de vigencia de una cotización. */
export const VIGENCIA_HORAS = 48;
/** Las referenciales (sin fechas) valen más: 7 días. */
export const VIGENCIA_REFERENCIAL_HORAS = 168;
const vigenciaDe = (referencial: boolean) => (referencial ? VIGENCIA_REFERENCIAL_HORAS : VIGENCIA_HORAS);

/** `clave`, `rateID`, `manual`, `monto` y `motivo` guardan cómo se eligió la cabaña para poder reabrir la cotización y editarla completa. */
export interface LineaCotizacion { nombre: string; cama: string | null; adultos: number; ninos: number; precio: number; clave?: string; rateID?: string | null; manual?: boolean; monto?: string; motivo?: string;
  /** Vista y amenidades de la habitación, copiadas al cotizar. */
  vista?: string | null; amenidades?: string[] }
export interface PlanCotizacion { id?: string | null; nombre: string; incluye: Array<{ quien: string | null; texto: string }>; seCobra: boolean; importe: number }
/** `productoId`, `cantidad`, `precio` y `clave` permiten reabrir el extra al editar. */
export interface ExtraCotizacion { descripcion: string; monto: number; productoId?: string; cantidad?: number; precio?: string; clave?: string }
export interface ClienteCotizacion { nombre: string; email?: string; telefono?: string }

export type EstadoCotizacion = 'vigente' | 'convertida' | 'vencida';

export interface Cotizacion {
  id: string;
  numero: number;
  estado: 'vigente' | 'convertida';
  /** Sin fechas definidas: las fechas guardadas son de muestra y el documento no las muestra. */
  referencial: boolean;
  idioma: 'es' | 'en';
  cliente: ClienteCotizacion;
  llegada: string;
  salida: string;
  adultos: number;
  ninos: number;
  lineas: LineaCotizacion[];
  plan: PlanCotizacion | null;
  extras: ExtraCotizacion[];
  cortesias: string[];
  notas: string | null;
  total: number;
  vence_at: string;
  usuario_nombre: string | null;
  reserva_ids: string[] | null;
  created_at: string;
}

export type NuevaCotizacion = Omit<Cotizacion, 'id' | 'numero' | 'estado' | 'vence_at' | 'created_at' | 'reserva_ids'>;

const COLUMNAS = 'id, numero, estado, referencial, idioma, cliente, llegada, salida, adultos, ninos, lineas, plan, extras, cortesias, notas, total, vence_at, usuario_nombre, reserva_ids, created_at';

const arreglo = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function normalizar(f: Record<string, unknown>): Cotizacion {
  return {
    ...(f as unknown as Cotizacion),
    referencial: !!f.referencial,
    total: Number(f.total) || 0,
    cliente: (f.cliente ?? { nombre: '' }) as ClienteCotizacion,
    lineas: arreglo<LineaCotizacion>(f.lineas),
    extras: arreglo<ExtraCotizacion>(f.extras),
    cortesias: arreglo<string>(f.cortesias),
    plan: (f.plan ?? null) as PlanCotizacion | null,
    reserva_ids: f.reserva_ids ? arreglo<string>(f.reserva_ids) : null,
  };
}

/** Vigente, convertida en reserva o vencida (pasaron las 48 horas sin convertirse). */
export function estadoEfectivo(c: Pick<Cotizacion, 'estado' | 'vence_at'>, ahora = Date.now()): EstadoCotizacion {
  if (c.estado === 'convertida') return 'convertida';
  return Date.parse(c.vence_at) < ahora ? 'vencida' : 'vigente';
}

/** Número con ceros: COT-0012. */
export const numeroCotizacion = (n: number) => `COT-${String(n).padStart(4, '0')}`;

const mensajeDe = (m: string) => (/relation .*hotel_cotizaciones|schema cache/i.test(m) ? 'Falta ejecutar la migración 20261024000400_hotel_cotizaciones.sql en Supabase' : m);

export async function listarCotizaciones(): Promise<Cotizacion[]> {
  const { data, error } = await supabase.from('hotel_cotizaciones').select(COLUMNAS).eq('organization_id', orgActiva()).order('numero', { ascending: false }).limit(300);
  if (error) throw new Error(mensajeDe(error.message));
  return (data ?? []).map((f) => normalizar(f as Record<string, unknown>));
}

export async function crearCotizacion(n: NuevaCotizacion): Promise<Cotizacion> {
  const fila = {
    organization_id: orgActiva(),
    numero: 0, // lo asigna el servidor al insertar
    idioma: n.idioma, referencial: n.referencial, cliente: n.cliente, llegada: n.llegada, salida: n.salida, adultos: n.adultos, ninos: n.ninos,
    lineas: n.lineas, plan: n.plan, extras: n.extras, cortesias: n.cortesias, notas: n.notas, total: n.total,
    vence_at: dayjs().add(vigenciaDe(n.referencial), 'hour').toISOString(), usuario_nombre: n.usuario_nombre,
  };
  const { data, error } = await supabase.from('hotel_cotizaciones').insert(fila).select(COLUMNAS).single();
  if (error) throw new Error(mensajeDe(error.message));
  return normalizar(data as Record<string, unknown>);
}

/** Reemplaza el contenido de una cotización (edición completa): conserva el número y renueva la vigencia 48 horas desde ahora. */
export async function reemplazarCotizacion(id: string, n: NuevaCotizacion): Promise<Cotizacion> {
  const { data, error } = await supabase.from('hotel_cotizaciones').update({
    idioma: n.idioma, referencial: n.referencial, cliente: n.cliente, llegada: n.llegada, salida: n.salida, adultos: n.adultos, ninos: n.ninos,
    lineas: n.lineas, plan: n.plan, extras: n.extras, cortesias: n.cortesias, notas: n.notas, total: n.total,
    vence_at: dayjs().add(vigenciaDe(n.referencial), 'hour').toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id).eq('organization_id', orgActiva()).select(COLUMNAS).single();
  if (error) throw new Error(mensajeDe(error.message));
  return normalizar(data as Record<string, unknown>);
}

/** Marca la cotización como convertida en las reservas indicadas. */
export async function marcarConvertida(id: string, reservaIds: string[]): Promise<void> {
  const { error } = await supabase.from('hotel_cotizaciones').update({ estado: 'convertida', reserva_ids: reservaIds, updated_at: new Date().toISOString() }).eq('id', id).eq('organization_id', orgActiva());
  if (error) throw new Error(mensajeDe(error.message));
}

export async function borrarCotizacion(id: string): Promise<void> {
  const { error } = await supabase.from('hotel_cotizaciones').delete().eq('id', id).eq('organization_id', orgActiva());
  if (error) throw new Error(mensajeDe(error.message));
}
