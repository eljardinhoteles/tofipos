import { importePlan, planSeCobra, type PlanReserva } from './hotelPlanesApi';
import { supabase } from './supabase';
import { claveEnlace, habitacionDeUnidad } from './hotelHabitacionesApi';
import { agregarVentaMovimiento, initVerticalRxDb, updateRxVenta, type RxVenta } from '../db/rxdb';
import { calcularVenta } from './ventaConMovimientos';
import {
  CloudbedsError,
  type ReservaCloudbedsDetalle,
  anotarReservaCloudbeds,
  cancelarReservaCloudbeds,
  getReservaCloudbeds,
  crearReservaCloudbeds,
  modificarReservaCloudbeds,
} from './cloudbeds';

/**
 * Reservas de la página «Hotel». Viven en Supabase (`hotel_reservas`), no en RxDB: la app las lee y las escribe
 * directo y exige conexión (Cloudbeds también). Ver supabase/migrations/20261017000100_hotel_reservas.sql.
 *
 * Cloudbeds es la fuente de verdad del calendario y la tarifa; aquí se guarda el vínculo, el huésped, los extras
 * y el estado de sincronización. Nunca toca ventas, cierres ni métricas.
 */

export type SyncEstado = 'sincronizada' | 'pendiente' | 'error';
export type EstadoReservaHotel = 'confirmada' | 'cancelada';

export interface ExtraHotel {
  id: string;
  /** false = no se pudo anotar en Cloudbeds (se puede reintentar); undefined = no aplica (reserva sin subir). */
  nota_ok?: boolean;
  descripcion: string;
  monto: number;
  fecha: string;
  usuario?: string;
  /** Producto del sistema (menú) del que sale el extra, y cuántos. Ausentes en extras escritos a mano. */
  producto_id?: string;
  cantidad?: number;
  /** 'cloudbeds' = cargo hecho directamente en Cloudbeds (actividades, spa…): solo importe, se trae con «Conciliar con Cloudbeds» y no se edita aquí. */
  origen?: 'cloudbeds' | 'plan';
  /** Con `origen: 'cloudbeds'` y monto 0: el importe de ese cargo que ya se cubrió con productos reales del POS (no se vuelve a traer). */
  cubre?: number;
}

/** Nota corta de la reserva (horario de un tour, una alergia…). Puede ir ligada a un extra o ser general. Solo del POS. */
export interface NotaReserva {
  id: string;
  texto: string;
  /** Extra al que va ligada (y su nombre, por si luego se quita). Ausentes si es una nota general. */
  extra_id?: string;
  extra?: string;
  fecha: string;
  usuario?: string;
}

export interface EventoHistorial {
  id: string;
  fecha: string;
  tipo: 'creada' | 'plan' | 'cabana' | 'cama' | 'fechas' | 'tarifa' | 'extra' | 'cliente' | 'conciliacion' | 'cobro' | 'sync' | 'cancelada' | 'nota';
  texto: string;
  usuario?: string;
}

/**
 * Cambio hecho en Cloudbeds (Booking, la extranet…) que el Worker ya aplicó en la reserva del POS. Lo que el servidor NO
 * toca queda para una persona: la venta del Centro de Ventas (fechas, comentario de cancelación, ajuste) y el plan.
 */
export interface AvisoCloudbeds {
  tipo: 'cancelada' | 'cambiada';
  texto: string;
  fecha: string;
  donde?: string;
  llegada?: string;
  salida?: string;
}

export interface ReservaHotel {
  id: string;
  cloudbeds_reservation_id: string | null;
  room_type_id: string;
  cabana: string;
  llegada: string;
  salida: string;
  adultos: number;
  ninos: number;
  huesped_nombre: string;
  huesped_apellido: string;
  huesped_email: string;
  huesped_telefono: string | null;
  huesped_pais: string;
  /** Tarifa que muestra y cobra el POS (la de Cloudbeds o una manual). */
  total_estadia: number;
  /** Tarifa que tiene Cloudbeds registrada (referencia). */
  total_cloudbeds: number | null;
  tarifa_manual: boolean;
  tarifa_motivo: string | null;
  extras: ExtraHotel[];
  notas: string | null;
  /** Reservas de varias habitaciones creadas juntas: comparten `grupo_id`, pero cada una es independiente en Cloudbeds. */
  grupo_id: string | null;
  grupo_etiqueta: string | null;
  /** No se abrirá cuenta de habitación en Mesas para esta reserva (la tira de llegadas deja de mostrarla). */
  sin_cuenta_mesas: boolean;
  /** Unidad de Cloudbeds (`roomID`) donde está alojada. NULL = la única unidad de su tipo (modelo «un tipo = una habitación»). */
  room_id: string | null;
  /** Código de la reserva de Cloudbeds de la que sale este grupo adoptado (una reserva de Cloudbeds con varias habitaciones). Sin sincronización 1 a 1: ver migración 20261022000200. */
  cloudbeds_grupo_ref: string | null;
  /** true si no la creó el POS: es una reserva que ya existía en Cloudbeds y se enlazó. */
  adoptada: boolean;
  fuente_nombre: string | null;
  /** Canal externo (Booking, Expedia…): sus fechas y cancelación las controla el canal, no el POS. */
  fuente_externa: boolean;
  /** Venta del Centro de Ventas conciliada con esta reserva: ahí viven sus cobros (no se sincronizan con Cloudbeds). */
  venta_id: string | null;
  /** Ficha del cliente del POS con los datos del huésped unificados. */
  cliente_id: string | null;
  /** Tipo de cama elegido para esta reserva (interno del POS; no va a Cloudbeds ni afecta la disponibilidad). */
  cama: string | null;
  /** Cambios hechos a la reserva, del más antiguo al más reciente. */
  historial: EventoHistorial[];
  notas_items: NotaReserva[];
  /** Plan de alimentación de la reserva (copia del plan al elegirlo). Null = sin plan. Informativo: no cobra. */
  plan_alimentacion: PlanReserva | null;
  /** Cambio que el servidor aplicó solo desde Cloudbeds y falta revisar (venta y plan). Null = nada pendiente. */
  aviso_cloudbeds: AvisoCloudbeds | null;
  estado: EstadoReservaHotel;
  sync_estado: SyncEstado;
  sync_error: string | null;
  usuario_nombre: string | null;
  created_at: string;
}

export interface NuevaReservaHotel {
  roomTypeID: string;
  /** Unidad de Cloudbeds cuando el tipo tiene varias (undefined = la única unidad del tipo). */
  roomID?: string | null;
  /** Tipo de cama elegido (interno del POS: no va a Cloudbeds). */
  cama?: string | null;
  cabana: string;
  rateID?: string | null;
  llegada: string;
  salida: string;
  adultos: number;
  ninos: number;
  /** Total de la estadía según Cloudbeds. Es lo que se registra allá, siempre. */
  totalEstadia: number;
  /** Tarifa manual del POS (descuento o cortesía). Si se omite, el POS usa la de Cloudbeds. */
  totalManual?: number | null;
  motivoTarifa?: string;
  /** Plan de alimentación elegido (informativo). */
  plan?: PlanReserva | null;
  huesped: { nombre: string; apellido: string; email: string; telefono?: string; pais: string };
  notas?: string;
  usuarioId?: string;
  usuarioNombre?: string;
  /** Ficha del cliente del POS (Clientes). */
  clienteId?: string | null;
}

const COLUMNAS_BASE =
  'id, cloudbeds_reservation_id, room_type_id, cabana, llegada, salida, adultos, ninos, huesped_nombre, huesped_apellido, huesped_email, huesped_telefono, huesped_pais, total_estadia, total_cloudbeds, tarifa_manual, tarifa_motivo, extras, notas, grupo_id, grupo_etiqueta, adoptada, fuente_nombre, fuente_externa, estado, sync_estado, sync_error, usuario_nombre, created_at';
// Columnas opcionales, según las migraciones ya ejecutadas: conciliación con Ventas/Clientes (20261018000100) e historial
// (20261018000200). Si falta alguna, la página sigue funcionando sin ella: la primera lectura lo detecta (error 42703 =
// columna inexistente) y se dejan de pedir.
export let conciliacionDisponible = true;
export let historialDisponible = true;
/** Tipo de cama (migración 20261018000300). */
export let camaDisponible = true;
/** Notas de la reserva (migración 20261019000100). */
export let notasReservaDisponible = true;
/** Plan de alimentación de la reserva (migración 20261019000200). */
export let planReservaDisponible = true;
/** Avisos de la sincronización con Cloudbeds (migración 20261019000500). */
export let avisoCloudbedsDisponible = true;
/** Grupos adoptados de Cloudbeds (migración 20261022000200). */
export let grupoRefDisponible = true;
/** Unidad de la reserva (migración 20261022000300). */
export let unidadReservaDisponible = true;
/** Marca «sin cuenta en Mesas» (migración 20261023000300). */
export let sinCuentaMesasDisponible = true;
// `sinHistorial`: el historial (hasta 200 eventos por reserva) es lo más pesado y solo se ve en el detalle; las listas no
// lo traen y el panel lo pide al abrirse (`leerHistorialHotel`).
const columnas = (sinHistorial = false) => `${COLUMNAS_BASE}${conciliacionDisponible ? ', venta_id, cliente_id' : ''}${historialDisponible && !sinHistorial ? ', historial' : ''}${camaDisponible ? ', cama' : ''}${grupoRefDisponible ? ', cloudbeds_grupo_ref' : ''}${unidadReservaDisponible ? ', room_id' : ''}${sinCuentaMesasDisponible ? ', sin_cuenta_mesas' : ''}${notasReservaDisponible ? ', notas_items' : ''}${planReservaDisponible ? ', plan_alimentacion' : ''}${avisoCloudbedsDisponible ? ', aviso_cloudbeds' : ''}`;
const columnaInexistente = (e: { code?: string } | null) => e?.code === '42703';
/** Desactiva lo que falta según el mensaje de Postgres (nombra la columna). Devuelve false si ya no hay nada que desactivar. */
function desactivarColumnaFaltante(mensaje: string): boolean {
  if (sinCuentaMesasDisponible && /sin_cuenta_mesas/.test(mensaje)) { console.warn('hotel_reservas sin columna sin_cuenta_mesas: falta la migración 20261023000300'); sinCuentaMesasDisponible = false; return true; }
  if (unidadReservaDisponible && /\broom_id\b/.test(mensaje)) { console.warn('hotel_reservas sin columna room_id: falta la migración 20261022000300'); unidadReservaDisponible = false; return true; }
  if (grupoRefDisponible && /cloudbeds_grupo_ref/.test(mensaje)) { console.warn('hotel_reservas sin columna cloudbeds_grupo_ref: falta la migración 20261022000200'); grupoRefDisponible = false; return true; }
  if (avisoCloudbedsDisponible && /aviso_cloudbeds/.test(mensaje)) { console.warn('hotel_reservas sin columna aviso_cloudbeds: falta la migración 20261019000500'); avisoCloudbedsDisponible = false; return true; }
  if (planReservaDisponible && /plan_alimentacion/.test(mensaje)) { console.warn('hotel_reservas sin columna plan_alimentacion: falta la migración 20261019000200'); planReservaDisponible = false; return true; }
  if (notasReservaDisponible && /notas_items/.test(mensaje)) { console.warn('hotel_reservas sin columna notas_items: falta la migración 20261019000100'); notasReservaDisponible = false; return true; }
  if (camaDisponible && /cama/.test(mensaje)) { console.warn('hotel_reservas sin columna cama: falta la migración 20261018000300'); camaDisponible = false; return true; }
  if (historialDisponible && /historial/.test(mensaje)) { console.warn('hotel_reservas sin columna historial: falta la migración 20261018000200'); historialDisponible = false; return true; }
  if (conciliacionDisponible) { console.warn('hotel_reservas sin columnas venta_id/cliente_id: falta la migración 20261018000100'); conciliacionDisponible = false; historialDisponible = false; return true; }
  return false;
}

const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

type FilaReserva = Omit<ReservaHotel, 'total_estadia' | 'total_cloudbeds' | 'extras' | 'venta_id' | 'cliente_id' | 'cama' | 'historial' | 'plan_alimentacion' | 'aviso_cloudbeds' | 'cloudbeds_grupo_ref' | 'room_id' | 'sin_cuenta_mesas'>
  & { plan_alimentacion?: PlanReserva | null; aviso_cloudbeds?: AvisoCloudbeds | null; cloudbeds_grupo_ref?: string | null; room_id?: string | null; sin_cuenta_mesas?: boolean; cama?: string | null; venta_id?: string | null; cliente_id?: string | null; historial?: unknown; total_estadia: unknown; total_cloudbeds: unknown; extras: unknown };

// Recibe `unknown` porque las columnas se eligen en tiempo de ejecución (con o sin las de conciliación).
function normalizar(fila: unknown): ReservaHotel {
  const r = fila as FilaReserva;
  return { venta_id: null, cliente_id: null, cama: null, cloudbeds_grupo_ref: null, room_id: null, sin_cuenta_mesas: false, plan_alimentacion: null, aviso_cloudbeds: null, ...r, historial: Array.isArray(r.historial) ? (r.historial as EventoHistorial[]) : [], notas_items: Array.isArray((r as { notas_items?: unknown }).notas_items) ? ((r as { notas_items?: unknown }).notas_items as NotaReserva[]) : [], total_estadia: Number(r.total_estadia) || 0, total_cloudbeds: r.total_cloudbeds == null ? null : Number(r.total_cloudbeds), extras: Array.isArray(r.extras) ? (r.extras as ExtraHotel[]) : [] };
}

/** Reservas que se solapan con el rango [desde, hasta] (AAAA-MM-DD), por llegada. */
export async function listarReservasHotel(desde: string, hasta: string): Promise<ReservaHotel[]> {
  const consultar = () => supabase
    .from('hotel_reservas')
    .select(columnas())
    .eq('organization_id', orgActiva())
    .lte('llegada', hasta)
    .gte('salida', desde)
    .order('llegada', { ascending: true });
  let { data, error } = await consultar();
  for (let i = 0; i < 2 && columnaInexistente(error) && desactivarColumnaFaltante(error?.message ?? ''); i++) ({ data, error } = await consultar());
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizar);
}

/** Una reserva, tal como está ahora en la base (para refrescar el panel de detalle tras un cambio). */
export async function leerReservaHotel(id: string): Promise<ReservaHotel | null> {
  const consultar = () => supabase.from('hotel_reservas').select(columnas()).eq('id', id).eq('organization_id', orgActiva()).maybeSingle();
  let { data, error } = await consultar();
  for (let i = 0; i < 2 && columnaInexistente(error) && desactivarColumnaFaltante(error?.message ?? ''); i++) ({ data, error } = await consultar());
  if (error) throw new Error(error.message);
  return data ? normalizar(data) : null;
}

/** Las reservas que cubre una venta del Centro de Ventas (una, o varias si es de un grupo). */
export async function listarReservasDeVenta(ventaId: string): Promise<ReservaHotel[]> {
  if (!conciliacionDisponible) return [];
  const consultar = () => supabase.from('hotel_reservas').select(columnas()).eq('organization_id', orgActiva()).eq('venta_id', ventaId).order('cabana', { ascending: true });
  let { data, error } = await consultar();
  for (let i = 0; i < 2 && columnaInexistente(error) && desactivarColumnaFaltante(error?.message ?? ''); i++) ({ data, error } = await consultar());
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizar);
}

/** Solo el historial de una reserva: la lista no lo trae y el panel de detalle lo pide al abrirse. */
export async function leerHistorialHotel(id: string): Promise<EventoHistorial[]> {
  if (!historialDisponible) return [];
  const { data, error } = await supabase.from('hotel_reservas').select('historial').eq('id', id).eq('organization_id', orgActiva()).maybeSingle();
  if (error) throw new Error(error.message);
  const h = (data as { historial?: unknown } | null)?.historial;
  return Array.isArray(h) ? (h as EventoHistorial[]) : [];
}

/** Todas las vigentes o pendientes de sincronizar, para la lista (más recientes primero). Sin historial (ver `columnas`). */
export async function listarReservasRecientes(limite = 500): Promise<ReservaHotel[]> {
  const consultar = () => supabase
    .from('hotel_reservas')
    .select(columnas(true))
    .eq('organization_id', orgActiva())
    .order('created_at', { ascending: false })
    .limit(limite);
  let { data, error } = await consultar();
  for (let i = 0; i < 2 && columnaInexistente(error) && desactivarColumnaFaltante(error?.message ?? ''); i++) ({ data, error } = await consultar());
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizar);
}

async function actualizar(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('hotel_reservas')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgActiva());
  if (error) throw new Error(error.message);
}

const INTENTOS_JSON = 3;

/**
 * Cambia una lista guardada dentro de la reserva (extras, historial) sin pisar lo que otro equipo haya guardado mientras
 * tanto. Se lee la lista actual, se aplica el cambio y se guarda SOLO si `updated_at` no cambió desde esa lectura; si
 * cambió, se vuelve a leer y se reintenta. Así dos cambios hechos a la vez desde dos equipos quedan los dos.
 */
async function modificarJson<T>(id: string, columna: 'extras' | 'historial' | 'notas_items', cambiar: (lista: T[]) => T[]): Promise<T[]> {
  for (let intento = 0; intento < INTENTOS_JSON; intento++) {
    const { data, error } = await supabase
      .from('hotel_reservas')
      .select(`${columna}, updated_at`)
      .eq('id', id)
      .eq('organization_id', orgActiva())
      .single();
    if (error) throw new Error(error.message);
    const fila = data as unknown as Record<string, unknown> & { updated_at: string };
    const nueva = cambiar(Array.isArray(fila[columna]) ? (fila[columna] as T[]) : []);
    const { data: filas, error: errorGuardar } = await supabase
      .from('hotel_reservas')
      .update({ [columna]: nueva, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', orgActiva())
      .eq('updated_at', fila.updated_at)
      .select('id');
    if (errorGuardar) throw new Error(errorGuardar.message);
    if ((filas ?? []).length > 0) return nueva;
  }
  throw new Error('La reserva se modificó en otro equipo mientras se guardaba. Vuelve a intentarlo.');
}

const modificarExtras = (id: string, cambiar: (extras: ExtraHotel[]) => ExtraHotel[]) => modificarJson<ExtraHotel>(id, 'extras', cambiar);

const MAX_EVENTOS = 200;

/** Deja constancia de un cambio en el historial de la reserva. Nunca falla: el historial no debe impedir el cambio. */
export async function registrarEventoHotel(id: string, tipo: EventoHistorial['tipo'], texto: string, usuario?: string): Promise<void> {
  if (!historialDisponible) return;
  try {
    const evento: EventoHistorial = { id: crypto.randomUUID(), fecha: new Date().toISOString(), tipo, texto, ...(usuario ? { usuario } : {}) };
    await modificarJson<EventoHistorial>(id, 'historial', (h) => [...h, evento].slice(-MAX_EVENTOS));
  } catch (e) {
    console.warn('No se pudo registrar el evento en el historial', e);
  }
}

const eventoCreada = (usuario?: string): EventoHistorial => ({ id: crypto.randomUUID(), fecha: new Date().toISOString(), tipo: 'creada', texto: 'Reserva creada en el POS', ...(usuario ? { usuario } : {}) });

/** Avance de una creación, para mostrar en pantalla qué se está haciendo. */
export type ProgresoCreacion =
  | { fase: 'guardado' } // ya está en el POS, empieza a subirse a Cloudbeds
  | { fase: 'cabana'; roomTypeID: string; sync: SyncEstado }; // una habitación terminó (bien, pendiente o rechazada)

export interface ResultadoSync {
  /** Resultado de la subida a Cloudbeds. La reserva ya quedó guardada en el POS en cualquier caso. */
  sync: SyncEstado;
  mensaje?: string;
}

function datosCloudbeds(r: Pick<ReservaHotel, 'room_id' | 'grupo_etiqueta' | 'llegada' | 'salida' | 'adultos' | 'ninos' | 'room_type_id' | 'huesped_nombre' | 'huesped_apellido' | 'huesped_email' | 'huesped_telefono' | 'huesped_pais' | 'id'>, rateID?: string | null) {
  return {
    start: r.llegada,
    end: r.salida,
    adults: r.adultos,
    children: r.ninos,
    roomTypeID: r.room_type_id,
    roomID: r.room_id ?? undefined,
    rateID: rateID ?? undefined,
    guest: {
      firstName: r.huesped_nombre,
      // En un grupo, el apellido lleva la marca del grupo para encontrar las habitaciones hermanas también en Cloudbeds.
      lastName: r.grupo_etiqueta ? `${r.huesped_apellido} - ${r.grupo_etiqueta}` : r.huesped_apellido,
      email: r.huesped_email,
      phone: r.huesped_telefono ?? undefined,
      country: r.huesped_pais,
    },
    externalId: r.id,
    sendEmailConfirmation: false,
  };
}

async function subirACloudbeds(r: ReservaHotel, rateID?: string | null, reintento = false): Promise<ResultadoSync> {
  try {
    // El id de la reserva es la clave de idempotencia: reintentar no crea un duplicado en Cloudbeds.
    const res = await crearReservaCloudbeds(datosCloudbeds(r, rateID), r.id, reintento);
    await actualizar(r.id, {
      cloudbeds_reservation_id: res.reservationID,
      sync_estado: 'sincronizada',
      sync_error: null,
      // Si la reserva ya existía en Cloudbeds (reintento tardío) no se conoce su total: se conserva el que había.
      ...(typeof res.grandTotal === 'number'
        ? { total_cloudbeds: res.grandTotal, ...(r.tarifa_manual ? {} : { total_estadia: res.grandTotal }) }
        : {}),
    });
    void registrarEventoHotel(r.id, 'sync', `Subida a Cloudbeds (código ${res.reservationID})`);
    return { sync: 'sincronizada' };
  } catch (e) {
    const err = e instanceof CloudbedsError ? e : new CloudbedsError(e instanceof Error ? e.message : 'Error desconocido', 0, true);
    if (err.reintentable) {
      await actualizar(r.id, { sync_estado: 'pendiente', sync_error: err.message }).catch(() => {});
      return { sync: 'pendiente', mensaje: err.message };
    }
    // Rechazo definitivo (sin cupo, datos inválidos): la reserva no existe en Cloudbeds, así que se cancela aquí.
    await actualizar(r.id, { sync_estado: 'error', sync_error: err.message, estado: 'cancelada' }).catch(() => {});
    return { sync: 'error', mensaje: err.message };
  }
}

/**
 * Guarda primero en el POS (nada se pierde si falla la red) y luego sube a Cloudbeds.
 * Si Cloudbeds no responde, queda `pendiente` y se reintenta con `reintentarSincronizacion`.
 */
export async function crearReservaHotel(n: NuevaReservaHotel, alProgreso?: (p: ProgresoCreacion) => void): Promise<{ reserva: ReservaHotel } & ResultadoSync> {
  if (n.roomID && !unidadReservaDisponible) throw new Error('Para reservar por unidad ejecuta la migración 20261022000300_hotel_unidades.sql en Supabase');
  const manual = n.totalManual != null && n.totalManual !== n.totalEstadia;
  const fila = {
    id: crypto.randomUUID(),
    organization_id: orgActiva(),
    room_type_id: n.roomTypeID,
    ...(n.roomID && unidadReservaDisponible ? { room_id: n.roomID } : {}),
    cabana: n.cabana,
    llegada: n.llegada,
    salida: n.salida,
    adultos: n.adultos,
    ninos: n.ninos,
    huesped_nombre: n.huesped.nombre.trim(),
    huesped_apellido: n.huesped.apellido.trim(),
    huesped_email: n.huesped.email.trim(),
    huesped_telefono: n.huesped.telefono?.trim() || null,
    huesped_pais: n.huesped.pais.toUpperCase(),
    total_cloudbeds: n.totalEstadia,
    total_estadia: manual ? (n.totalManual as number) : n.totalEstadia,
    tarifa_manual: manual,
    tarifa_motivo: manual ? n.motivoTarifa?.trim() || null : null,
    notas: n.notas?.trim() || null,
    estado: 'confirmada' as const,
    sync_estado: 'pendiente' as const,
    usuario_id: n.usuarioId ?? null,
    usuario_nombre: n.usuarioNombre ?? null,
    ...(n.clienteId && conciliacionDisponible ? { cliente_id: n.clienteId } : {}),
    ...(n.cama && camaDisponible ? { cama: n.cama } : {}),
    ...(n.plan && planReservaDisponible ? { plan_alimentacion: n.plan } : {}),
    ...(historialDisponible ? { historial: [eventoCreada(n.usuarioNombre)] } : {}),
  };
  const { data, error } = await supabase.from('hotel_reservas').insert(fila).select(columnas()).single();
  if (error) throw new Error(error.message);
  const reserva = normalizar(data);
  alProgreso?.({ fase: 'guardado' });
  const r = await subirACloudbeds(reserva, n.rateID);
  alProgreso?.({ fase: 'cabana', roomTypeID: claveEnlace(reserva.room_type_id, reserva.room_id), sync: r.sync });
  return { reserva: { ...reserva, sync_estado: r.sync }, ...r };
}

export interface LineaGrupo {
  roomTypeID: string;
  /** Unidad de Cloudbeds cuando el tipo tiene varias. */
  roomID?: string | null;
  cama?: string | null;
  cabana: string;
  /** Código corto de la habitación (CJ1, CP4…): va en el nombre del grupo en Cloudbeds. */
  codigo?: string | null;
  rateID?: string | null;
  adultos: number;
  ninos: number;
  totalEstadia: number;
  totalManual?: number | null;
  motivoTarifa?: string;
}

export interface NuevoGrupoReservaHotel {
  llegada: string;
  salida: string;
  huesped: NuevaReservaHotel['huesped'];
  notas?: string;
  usuarioId?: string;
  usuarioNombre?: string;
  clienteId?: string | null;
  /** Plan de alimentación para todas las habitaciones del grupo (cada una según sus adultos y niños). */
  plan?: PlanReserva | null;
  lineas: LineaGrupo[];
}

/**
 * Crea una reserva por habitación, todas enlazadas por `grupo_id` y con el mismo huésped. Primero se guardan todas en el
 * POS (nada se pierde si falla la red) y luego se suben a Cloudbeds por separado y en paralelo: cada una tiene su
 * propio estado, así que un fallo en una no afecta a las demás.
 */
export async function crearGrupoReservasHotel(n: NuevoGrupoReservaHotel, alProgreso?: (p: ProgresoCreacion) => void): Promise<{ reservas: ReservaHotel[]; resultados: ResultadoSync[] }> {
  if (n.lineas.some((l) => l.roomID) && !unidadReservaDisponible) throw new Error('Para reservar por unidad ejecuta la migración 20261022000300_hotel_unidades.sql en Supabase');
  const grupoId = crypto.randomUUID();
  const etiqueta = `Grupo - ${n.lineas.map((l) => l.codigo || l.cabana).join(',')}`;
  const filas = n.lineas.map((l) => {
    const manual = l.totalManual != null && l.totalManual !== l.totalEstadia;
    return {
      id: crypto.randomUUID(),
      organization_id: orgActiva(),
      room_type_id: l.roomTypeID,
      ...(l.roomID && unidadReservaDisponible ? { room_id: l.roomID } : {}),
      cabana: l.cabana,
      llegada: n.llegada,
      salida: n.salida,
      adultos: l.adultos,
      ninos: l.ninos,
      huesped_nombre: n.huesped.nombre.trim(),
      huesped_apellido: n.huesped.apellido.trim(),
      huesped_email: n.huesped.email.trim(),
      huesped_telefono: n.huesped.telefono?.trim() || null,
      huesped_pais: n.huesped.pais.toUpperCase(),
      total_cloudbeds: l.totalEstadia,
      total_estadia: manual ? (l.totalManual as number) : l.totalEstadia,
      tarifa_manual: manual,
      tarifa_motivo: manual ? l.motivoTarifa?.trim() || null : null,
      notas: n.notas?.trim() || null,
      grupo_id: grupoId,
      grupo_etiqueta: etiqueta,
      estado: 'confirmada' as const,
      sync_estado: 'pendiente' as const,
      usuario_id: n.usuarioId ?? null,
      usuario_nombre: n.usuarioNombre ?? null,
      ...(n.clienteId && conciliacionDisponible ? { cliente_id: n.clienteId } : {}),
      ...(l.cama && camaDisponible ? { cama: l.cama } : {}),
      ...(n.plan && planReservaDisponible ? { plan_alimentacion: n.plan } : {}),
      ...(historialDisponible ? { historial: [{ ...eventoCreada(n.usuarioNombre), texto: `Reserva creada en el POS como parte de un grupo de ${n.lineas.length} habitaciones` }] } : {}),
    };
  });
  const { data, error } = await supabase.from('hotel_reservas').insert(filas).select(columnas());
  if (error) throw new Error(error.message);
  // El insert devuelve las filas en cualquier orden: se vuelve a emparejar con su línea por habitación.
  const reservas = (data ?? []).map(normalizar);
  alProgreso?.({ fase: 'guardado' });
  const resultados = await Promise.all(
    reservas.map(async (r) => {
      const res = await subirACloudbeds(r, n.lineas.find((l) => l.roomTypeID === r.room_type_id && (l.roomID ?? null) === (r.room_id ?? null))?.rateID);
      alProgreso?.({ fase: 'cabana', roomTypeID: claveEnlace(r.room_type_id, r.room_id), sync: res.sync });
      return res;
    }),
  );
  return { reservas: reservas.map((r, i) => ({ ...r, sync_estado: resultados[i].sync })), resultados };
}

/** Cancela todas las reservas vigentes de un grupo (una por una). Devuelve cuántas no se pudieron cancelar. */
export async function cancelarGrupoReservasHotel(hermanas: ReservaHotel[]): Promise<number> {
  let fallos = 0;
  for (const r of hermanas) {
    if (r.estado !== 'confirmada') continue;
    try { await cancelarReservaHotel(r); } catch { fallos += 1; }
  }
  return fallos;
}

/** Reintenta subir una reserva que quedó pendiente (o con error recuperable). */
export async function reintentarSincronizacion(r: ReservaHotel): Promise<ResultadoSync> {
  if (r.cloudbeds_reservation_id) return { sync: 'sincronizada' };
  return subirACloudbeds(r, undefined, true);
}

export interface ResumenReintento { sincronizadas: number; pendientes: number; rechazadas: number }

/** Reintenta varias pendientes, de una en una (no se satura a Cloudbeds). */
export async function reintentarPendientes(rs: ReservaHotel[]): Promise<ResumenReintento> {
  const out: ResumenReintento = { sincronizadas: 0, pendientes: 0, rechazadas: 0 };
  for (const r of rs) {
    const res = await reintentarSincronizacion(r);
    if (res.sync === 'sincronizada') out.sincronizadas += 1;
    else if (res.sync === 'error') out.rechazadas += 1;
    else out.pendientes += 1;
  }
  return out;
}

export async function cancelarReservaHotel(r: ReservaHotel): Promise<void> {
  // Si nunca llegó a Cloudbeds no hay nada que cancelar allá.
  if (r.cloudbeds_reservation_id) await cancelarReservaCloudbeds(r.cloudbeds_reservation_id);
  await actualizar(r.id, { estado: 'cancelada' });
  void registrarEventoHotel(r.id, 'cancelada', 'Cancelada desde el POS');
  await comentarCancelacionEnVenta(r, 'desde el POS');
}

/**
 * Deja constancia en la venta conciliada (Centro de Ventas) de que la reserva se canceló. Es solo un comentario: la venta
 * y sus cobros NO se tocan (un reembolso o una penalidad se decide y registra a mano en Ventas). Si falla, la cancelación
 * ya está hecha: se avisa en la consola y no se interrumpe.
 */
async function comentarCancelacionEnVenta(r: ReservaHotel, donde: string): Promise<void> {
  if (!r.venta_id) return;
  try {
    const db = await initVerticalRxDb();
    const doc = await db.ventas.findOne(r.venta_id).exec();
    if (!doc) return; // la venta no está en este dispositivo
    const v = calcularVenta(doc.toJSON() as RxVenta);
    const fechas = `${r.llegada.split('-').reverse().join('/')} → ${r.salida.split('-').reverse().join('/')}`;
    const cobros = v.totalPagado > 0.005
      ? ` Tenía cobros por $${v.totalPagado.toFixed(2)}: revisar si corresponde reembolso.`
      : ' No tenía cobros registrados.';
    await agregarVentaMovimiento({
      venta_id: r.venta_id,
      tipo: 'comentario',
      motivo: `Reserva cancelada (${donde}): ${r.cabana}, ${fechas}${r.cloudbeds_reservation_id ? `, Cloudbeds ${r.cloudbeds_reservation_id}` : ''}.${cobros}`,
      usuario_id: localStorage.getItem('pos_current_mesero_id') || undefined,
    });
  } catch (e) {
    console.warn('No se pudo comentar la cancelación en la venta', r.venta_id, e);
  }
}

/**
 * Cambia fechas en Cloudbeds y, si lo acepta, en el POS. Cloudbeds recalcula su tarifa: si el POS seguía a Cloudbeds,
 * se actualiza también; si la tarifa del POS es manual se conserva y se avisa para que se revise.
 */
export async function cambiarFechasReservaHotel(
  r: ReservaHotel, llegada: string, salida: string,
  opciones: { adultos?: number; ninos?: number; usuario?: string; totalEstimado?: number | null } = {},
): Promise<{ tarifaManualRevisar: boolean; totalCloudbeds: number | null }> {
  const adultos = opciones.adultos ?? r.adultos;
  const ninos = opciones.ninos ?? r.ninos;
  const resumen = `${r.llegada.split('-').reverse().join('/')} → ${r.salida.split('-').reverse().join('/')} a ${llegada.split('-').reverse().join('/')} → ${salida.split('-').reverse().join('/')}${adultos !== r.adultos || ninos !== r.ninos ? ` · ${adultos} adultos, ${ninos} niños` : ''}`;
  if (!r.cloudbeds_reservation_id) {
    // Aún no está en Cloudbeds: solo cambia en el POS y se sube después con las fechas nuevas.
    await actualizar(r.id, { llegada, salida, adultos, ninos });
    if (planSeCobra(r.plan_alimentacion)) await sincronizarExtraPlanHotel({ ...r, llegada, salida, adultos, ninos }).catch((e) => console.warn('No se pudo actualizar el plan de alimentación', e));
    void registrarEventoHotel(r.id, 'fechas', `Fechas cambiadas: ${resumen}`, opciones.usuario);
    return { tarifaManualRevisar: false, totalCloudbeds: null };
  }
  const res = await modificarReservaCloudbeds(r.cloudbeds_reservation_id, {
    roomTypeID: r.room_type_id,
    start: llegada,
    end: salida,
    adults: adultos,
    children: ninos,
  });
  const totalCb = typeof res.total === 'number' ? res.total : null;
  // Cloudbeds no siempre reprecia al cambiar solo los huéspedes: si su total quedó igual pero la estimación para la nueva
  // ocupación es otra, el POS usa la estimación (si su tarifa no es manual). El total que informó Cloudbeds se guarda tal cual.
  const antes = r.total_cloudbeds ?? r.total_estadia;
  const huespedesCambian = adultos !== r.adultos || ninos !== r.ninos;
  const estimado = opciones.totalEstimado ?? null;
  const usarEstimado = huespedesCambian && estimado !== null && (totalCb === null || Math.abs(totalCb - antes) < 0.005) && Math.abs(estimado - antes) >= 0.005;
  const nuevoTotal = usarEstimado ? estimado : totalCb;
  await actualizar(r.id, {
    llegada,
    salida,
    adultos,
    ninos,
    ...(totalCb !== null ? { total_cloudbeds: totalCb } : {}),
    ...(nuevoTotal !== null && !r.tarifa_manual ? { total_estadia: nuevoTotal } : {}),
  });
  if (planSeCobra(r.plan_alimentacion)) await sincronizarExtraPlanHotel({ ...r, llegada, salida, adultos, ninos }).catch((e) => console.warn('No se pudo actualizar el plan de alimentación', e));
  void registrarEventoHotel(r.id, 'fechas', `Fechas cambiadas: ${resumen}${nuevoTotal !== null ? ` · tarifa $${nuevoTotal.toFixed(2)}${usarEstimado ? ' (estimada para la nueva ocupación)' : ' (Cloudbeds)'}` : ''}`, opciones.usuario);
  return { tarifaManualRevisar: r.tarifa_manual, totalCloudbeds: nuevoTotal };
}

export interface ResultadoCambioGrupo {
  cambiadas: number;
  fallos: Array<{ cabana: string; mensaje: string }>;
  /** Cuántas tienen tarifa manual: Cloudbeds recalculó la suya pero el POS conserva la fijada a mano. */
  tarifaManualRevisar: number;
}

/**
 * Cambia las fechas de todas las reservas vigentes de un grupo. Cada una es independiente en Cloudbeds, así que se
 * cambian por separado y en paralelo: si alguna falla (por ejemplo, sin disponibilidad) las demás sí se cambian y se
 * informa cuáles quedaron con las fechas anteriores.
 */
export async function cambiarFechasGrupoReservasHotel(rs: ReservaHotel[], llegada: string, salida: string): Promise<ResultadoCambioGrupo> {
  const vigentes = rs.filter((r) => r.estado === 'confirmada');
  const resultados = await Promise.allSettled(vigentes.map((r) => cambiarFechasReservaHotel(r, llegada, salida)));
  const out: ResultadoCambioGrupo = { cambiadas: 0, fallos: [], tarifaManualRevisar: 0 };
  resultados.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      out.cambiadas += 1;
      if (res.value.tarifaManualRevisar) out.tarifaManualRevisar += 1;
    } else {
      out.fallos.push({ cabana: vigentes[i].cabana, mensaje: res.reason instanceof Error ? res.reason.message : 'Error desconocido' });
    }
  });
  return out;
}

/**
 * Concilia una reserva que ya está en el POS (adoptada antes, o creada aquí) con su venta del Centro de Ventas y con la
 * ficha del cliente. Mismas opciones que al adoptar; no toca Cloudbeds.
 */
export async function enlazarReservaHotel(r: ReservaHotel, op: OpcionesAdopcion): Promise<ReservaHotel> {
  const patch: Record<string, unknown> = {
    venta_id: op.ventaId ?? null,
    cliente_id: op.clienteId ?? null,
    ...(op.huesped ? {
      huesped_nombre: op.huesped.nombre.trim() || r.huesped_nombre,
      huesped_apellido: op.huesped.apellido.trim() || r.huesped_apellido,
      huesped_email: op.huesped.email.trim() || r.huesped_email,
      huesped_telefono: op.huesped.telefono.trim() || r.huesped_telefono,
    } : {}),
    ...(op.tarifaManual ? { tarifa_manual: true, tarifa_motivo: op.tarifaManual.motivo, total_estadia: op.tarifaManual.total } : {}),
  };
  await actualizar(r.id, patch);
  void registrarEventoHotel(r.id, 'conciliacion', op.ventaId ? 'Conciliada con una venta del Centro de Ventas' : 'Datos de cliente conciliados');
  return { ...r, ...(patch as Partial<ReservaHotel>) };
}

/** Quita el enlace con la venta (si la venta no se pudo crear después de adoptar). */
export async function desenlazarVentaHotel(id: string): Promise<void> {
  await actualizar(id, { venta_id: null });
}

/**
 * Cambia la reserva a otra habitación (mismas fechas y huéspedes). Cloudbeds recalcula la tarifa de la habitación nueva; si lo rechaza
 * (sin disponibilidad, restricción…) no se guarda nada en el POS. La cama se limpia: cada habitación tiene las suyas.
 */
export async function cambiarCabanaReservaHotel(
  r: ReservaHotel, destino: { roomTypeID: string; nombre: string; roomID?: string | null },
  opciones: { usuario?: string; totalEstimado?: number | null; tarifa?: { modo: 'nueva' | 'mantener' | 'otra'; total?: number } } = {},
): Promise<ReservaHotel> {
  if (destino.roomID && !unidadReservaDisponible) throw new Error('Para cambiar de unidad ejecuta la migración 20261022000300_hotel_unidades.sql en Supabase');
  let totalCb: number | null = null;
  if (r.cloudbeds_reservation_id) {
    const res = await modificarReservaCloudbeds(r.cloudbeds_reservation_id, {
      roomTypeID: destino.roomTypeID, ...(destino.roomID ? { roomID: destino.roomID } : {}), start: r.llegada, end: r.salida, adults: r.adultos, children: r.ninos,
    });
    totalCb = typeof res.total === 'number' ? res.total : null;
  }
  // Mismo criterio que al cambiar huéspedes: si Cloudbeds no movió su total pero la estimación de la habitación nueva es otra, el POS la usa.
  const antes = r.total_cloudbeds ?? r.total_estadia;
  const estimado = opciones.totalEstimado ?? null;
  const usarEstimado = estimado !== null && (totalCb === null || Math.abs(totalCb - antes) < 0.005) && Math.abs(estimado - antes) >= 0.005;
  const nuevoTotal = usarEstimado ? estimado : totalCb;
  // Qué tarifa queda: la de la habitación nueva (sigue a Cloudbeds), la actual (se fija a mano) u otra que se escriba.
  // Sin elección, una tarifa manual se conserva y una que seguía a Cloudbeds sigue a la de la habitación nueva.
  const modo = opciones.tarifa?.modo ?? (r.tarifa_manual ? 'mantener' : 'nueva');
  const tarifaPatch: Record<string, unknown> = modo === 'nueva'
    ? { ...(nuevoTotal !== null ? { total_estadia: nuevoTotal } : {}), tarifa_manual: false, tarifa_motivo: null }
    : modo === 'otra' && opciones.tarifa?.total != null
      ? { total_estadia: Math.round(opciones.tarifa.total * 100) / 100, tarifa_manual: true, tarifa_motivo: 'Tarifa fijada al cambiar de habitación' }
      : { tarifa_manual: true, ...(r.tarifa_manual ? {} : { tarifa_motivo: 'Se mantuvo la tarifa al cambiar de habitación' }) };
  const tarifaFinal = typeof tarifaPatch.total_estadia === 'number' ? tarifaPatch.total_estadia : r.total_estadia;
  const patch: Record<string, unknown> = {
    room_type_id: destino.roomTypeID,
    // Con unidades se guarda la nueva; sin ellas (un tipo = una habitación) se conserva lo que hubiera.
    ...(unidadReservaDisponible && (destino.roomID || r.room_id) ? { room_id: destino.roomID ?? null } : {}),
    cabana: destino.nombre,
    ...(camaDisponible ? { cama: null } : {}),
    ...(totalCb !== null ? { total_cloudbeds: totalCb } : {}),
    ...tarifaPatch,
  };
  await actualizar(r.id, patch);
  void registrarEventoHotel(r.id, 'cabana', `Habitación cambiada: ${r.cabana} → ${destino.nombre} · tarifa $${tarifaFinal.toFixed(2)} (${modo === 'nueva' ? 'la de la habitación nueva' : modo === 'otra' ? 'fijada a mano' : 'se mantuvo la anterior'})`, opciones.usuario);
  return { ...r, ...(patch as Partial<ReservaHotel>) };
}

const MAX_NOTAS = 100;
export const NOTA_MAX_CARACTERES = 240;

async function modificarNotas(r: ReservaHotel, cambiar: (lista: NotaReserva[]) => NotaReserva[]): Promise<ReservaHotel> {
  if (!notasReservaDisponible) throw new Error('Para guardar notas ejecuta la migración 20261019000100_hotel_notas_reserva.sql en Supabase');
  const notas = await modificarJson<NotaReserva>(r.id, 'notas_items', cambiar);
  return { ...r, notas_items: notas };
}

/** Añade una nota corta a la reserva, general o ligada a uno de sus extras. */
export async function agregarNotaHotel(r: ReservaHotel, texto: string, extraId: string | null, usuario?: string): Promise<ReservaHotel> {
  const limpio = texto.trim().slice(0, NOTA_MAX_CARACTERES);
  if (!limpio) throw new Error('Escribe la nota.');
  const extra = extraId ? r.extras.find((e) => e.id === extraId) : undefined;
  const nota: NotaReserva = { id: crypto.randomUUID(), texto: limpio, fecha: new Date().toISOString(), ...(usuario ? { usuario } : {}), ...(extra ? { extra_id: extra.id, extra: extra.descripcion } : {}) };
  const nueva = await modificarNotas(r, (lista) => [...lista, nota].slice(-MAX_NOTAS));
  void registrarEventoHotel(r.id, 'nota', `Nota${extra ? ` (${extra.descripcion})` : ''}: ${limpio}`, usuario);
  return nueva;
}

export async function editarNotaHotel(r: ReservaHotel, notaId: string, texto: string, usuario?: string): Promise<ReservaHotel> {
  const limpio = texto.trim().slice(0, NOTA_MAX_CARACTERES);
  if (!limpio) throw new Error('Escribe la nota.');
  const nueva = await modificarNotas(r, (lista) => lista.map((n) => (n.id === notaId ? { ...n, texto: limpio } : n)));
  void registrarEventoHotel(r.id, 'nota', `Nota editada: ${limpio}`, usuario);
  return nueva;
}

export async function quitarNotaHotel(r: ReservaHotel, notaId: string, usuario?: string): Promise<ReservaHotel> {
  const quitada = r.notas_items.find((n) => n.id === notaId);
  const nueva = await modificarNotas(r, (lista) => lista.filter((n) => n.id !== notaId));
  if (quitada) void registrarEventoHotel(r.id, 'nota', `Nota quitada: ${quitada.texto}`, usuario);
  return nueva;
}

const ID_EXTRA_PLAN = 'plan-alimentacion';

/**
 * Deja en la reserva el extra del plan de alimentación al día: si el plan se cobra, una línea con (adultos × precio adulto +
 * niños × precio niño) × noches; si va incluido, no hay línea. Se llama al elegir el plan y cada vez que cambian los huéspedes o
 * las fechas. Recibe los valores NUEVOS (la base aún puede traer los anteriores). Devuelve los extras resultantes.
 */
export async function sincronizarExtraPlanHotel(r: Pick<ReservaHotel, 'id' | 'plan_alimentacion' | 'adultos' | 'ninos' | 'llegada' | 'salida'>): Promise<ExtraHotel[]> {
  const noches = Math.max(1, Math.round((Date.parse(`${r.salida}T00:00:00Z`) - Date.parse(`${r.llegada}T00:00:00Z`)) / 86400000));
  const plan = r.plan_alimentacion;
  const monto = plan && planSeCobra(plan) ? importePlan(plan, r.adultos, r.ninos, noches) : 0;
  return modificarExtras(r.id, (lista) => {
    const resto = lista.filter((e) => e.id !== ID_EXTRA_PLAN);
    if (!plan || monto <= 0.005) return resto;
    const detalle = `${r.adultos} ${r.adultos === 1 ? 'adulto' : 'adultos'}${r.ninos ? `, ${r.ninos} ${r.ninos === 1 ? 'niño' : 'niños'}` : ''} × ${noches} ${noches === 1 ? 'noche' : 'noches'}`;
    return [...resto, { id: ID_EXTRA_PLAN, descripcion: `Plan ${plan.nombre} · ${detalle}`, monto, fecha: new Date().toISOString(), origen: 'plan' }];
  });
}

/** Asigna (o quita) el plan de alimentación de una reserva. Informativo: no cambia el total ni va a Cloudbeds. */
export async function cambiarPlanReservaHotel(r: ReservaHotel, plan: PlanReserva | null, usuario?: string): Promise<ReservaHotel> {
  if (!planReservaDisponible) throw new Error('Para guardar el plan ejecuta la migración 20261019000200_hotel_planes_alimentacion.sql en Supabase');
  await actualizar(r.id, { plan_alimentacion: plan });
  const extras = await sincronizarExtraPlanHotel({ ...r, plan_alimentacion: plan });
  void registrarEventoHotel(r.id, 'plan', plan ? `Plan de alimentación: ${plan.nombre}${r.plan_alimentacion ? ` (antes ${r.plan_alimentacion.nombre})` : ''}` : `Plan de alimentación quitado (era ${r.plan_alimentacion?.nombre ?? 'ninguno'})`, usuario);
  return { ...r, plan_alimentacion: plan, extras };
}

/** Cambia el tipo de cama. Es solo del POS (no va a Cloudbeds) y no afecta la disponibilidad. */
export async function cambiarCamaReservaHotel(r: ReservaHotel, cama: string | null, usuario?: string): Promise<ReservaHotel> {
  if (!camaDisponible) throw new Error('Para guardar la cama ejecuta la migración 20261018000300_hotel_camas.sql en Supabase');
  await actualizar(r.id, { cama });
  void registrarEventoHotel(r.id, 'cama', cama ? `Cama: ${cama}${r.cama ? ` (antes ${r.cama})` : ''}` : `Cama quitada (era ${r.cama ?? 'ninguna'})`, usuario);
  return { ...r, cama };
}

/** Fija o quita la tarifa manual del POS. No toca Cloudbeds: allá sigue su tarifa estándar. */
export async function cambiarTarifaReservaHotel(r: ReservaHotel, totalManual: number | null, motivo?: string, usuario?: string): Promise<void> {
  if (totalManual === null) {
    // Volver a la tarifa de Cloudbeds.
    await actualizar(r.id, { tarifa_manual: false, tarifa_motivo: null, total_estadia: r.total_cloudbeds ?? r.total_estadia });
    void registrarEventoHotel(r.id, 'tarifa', 'Vuelve a la tarifa de Cloudbeds', usuario);
    return;
  }
  await actualizar(r.id, { tarifa_manual: true, tarifa_motivo: motivo?.trim() || null, total_estadia: totalManual });
  void registrarEventoHotel(r.id, 'tarifa', `Tarifa manual $${totalManual.toFixed(2)}${motivo?.trim() ? ` (${motivo.trim()})` : ''}; Cloudbeds conserva $${(r.total_cloudbeds ?? r.total_estadia).toFixed(2)}`, usuario);
}

/** Registra un extra (spa, tour…) en el POS y lo anota en la reserva de Cloudbeds. */
export async function agregarExtraHotel(r: ReservaHotel, extra: { descripcion: string; monto: number; usuario?: string }): Promise<ReservaHotel> {
  const nuevo: ExtraHotel = {
    id: crypto.randomUUID(),
    descripcion: extra.descripcion.trim(),
    monto: extra.monto,
    fecha: new Date().toISOString(),
    usuario: extra.usuario,
  };
  // La nota en Cloudbeds es informativa: si falla, el extra se guarda igual en el POS y queda marcado «sin anotar»
  // para poder reintentarlo (antes el fallo se perdía en silencio).
  if (r.cloudbeds_reservation_id) {
    try {
      await anotarReservaCloudbeds(r.cloudbeds_reservation_id, textoNotaExtra(nuevo));
      nuevo.nota_ok = true;
    } catch {
      nuevo.nota_ok = false;
    }
  }
  const extras = await modificarExtras(r.id, (actuales) => [...actuales, nuevo]);
  void registrarEventoHotel(r.id, 'extra', `Extra añadido: ${nuevo.descripcion} $${nuevo.monto.toFixed(2)}`, extra.usuario);
  return { ...r, extras };
}

/**
 * Registra varios extras de una vez (p. ej. los elegidos al crear la reserva): se guardan en el POS y se anotan en
 * Cloudbeds en UNA sola nota. Si la nota falla, los extras quedan guardados y marcados «sin anotar» para reintentar.
 */
export async function agregarExtrasHotel(
  r: ReservaHotel,
  nuevos: Array<{ descripcion: string; monto: number; producto_id?: string; cantidad?: number }>,
  usuario?: string,
): Promise<ReservaHotel> {
  if (nuevos.length === 0) return r;
  const fecha = new Date().toISOString();
  const extras: ExtraHotel[] = nuevos.map((e) => ({
    id: crypto.randomUUID(),
    descripcion: e.descripcion.trim(),
    monto: Math.round(e.monto * 100) / 100,
    fecha,
    usuario,
    ...(e.producto_id ? { producto_id: e.producto_id } : {}),
    ...(e.cantidad ? { cantidad: e.cantidad } : {}),
  }));
  if (r.cloudbeds_reservation_id) {
    let ok = false;
    try {
      await anotarReservaCloudbeds(r.cloudbeds_reservation_id, textoNotaExtras(extras));
      ok = true;
    } catch { /* se marca sin anotar */ }
    extras.forEach((e) => { e.nota_ok = ok; });
  }
  const todos = await modificarExtras(r.id, (actuales) => [...actuales, ...extras]);
  void registrarEventoHotel(r.id, 'extra', `Extras añadidos: ${extras.map((e) => `${e.descripcion} $${e.monto.toFixed(2)}`).join('; ')}`, usuario);
  return { ...r, extras: todos };
}

// La nota de Cloudbeds admite 500 caracteres: si no caben todos, se resume.
function textoNotaExtras(extras: ExtraHotel[]): string {
  const total = extras.reduce((a, e) => a + e.monto, 0);
  const completo = `Extras POS: ${extras.map((e) => `${e.descripcion} $${e.monto.toFixed(2)}`).join('; ')} — total $${total.toFixed(2)}`;
  return completo.length <= 500 ? completo : `Extras POS: ${extras.length} productos — total $${total.toFixed(2)} (detalle en el POS)`;
}

const textoNotaExtra = (e: ExtraHotel) => `Extra POS: ${e.descripcion} — $${e.monto.toFixed(2)}`;

/** Reintenta anotar en Cloudbeds un extra que no se pudo anotar. */
export async function reanotarExtraHotel(r: ReservaHotel, extraId: string): Promise<ReservaHotel> {
  const extra = r.extras.find((e) => e.id === extraId);
  if (!extra || !r.cloudbeds_reservation_id) return r;
  await anotarReservaCloudbeds(r.cloudbeds_reservation_id, textoNotaExtra(extra));
  const extras = await modificarExtras(r.id, (actuales) => actuales.map((e) => (e.id === extraId ? { ...e, nota_ok: true } : e)));
  return { ...r, extras };
}

/**
 * Cambia la cantidad y/o el importe de un extra de la reserva. Con producto, el nombre lleva la cantidad («3× Masaje»); el
 * importe es el total con impuestos. Deja una nota en Cloudbeds con el cambio y constancia en el historial. La venta del
 * Centro de Ventas no se toca sola: el desfase lo ofrece ajustar la sección de cobros.
 */
export async function editarExtraHotel(r: ReservaHotel, extraId: string, cambio: { cantidad?: number; monto: number }, usuario?: string): Promise<ReservaHotel> {
  const previo = r.extras.find((e) => e.id === extraId);
  if (!previo) return r;
  const monto = Math.round(cambio.monto * 100) / 100;
  const cantidad = cambio.cantidad && previo.producto_id !== undefined ? cambio.cantidad : previo.cantidad;
  const base = previo.descripcion.replace(/^\d+× /, '');
  const descripcion = previo.producto_id !== undefined && cantidad ? (cantidad > 1 ? `${cantidad}× ${base}` : base) : previo.descripcion;
  let ok: boolean | undefined;
  if (r.cloudbeds_reservation_id) {
    try { await anotarReservaCloudbeds(r.cloudbeds_reservation_id, `Extra POS modificado: ${previo.descripcion} $${previo.monto.toFixed(2)} → ${descripcion} $${monto.toFixed(2)}`); ok = true; } catch { ok = false; }
  }
  const extras = await modificarExtras(r.id, (actuales) => actuales.map((e) => (e.id === extraId ? { ...e, descripcion, monto, ...(cantidad !== undefined ? { cantidad } : {}), ...(ok !== undefined ? { nota_ok: ok } : {}) } : e)));
  void registrarEventoHotel(r.id, 'extra', `Extra modificado: ${previo.descripcion} $${previo.monto.toFixed(2)} → ${descripcion} $${monto.toFixed(2)}`, usuario);
  return { ...r, extras };
}

export interface ResultadoDivergencia {
  /** Tarifa de Cloudbeds antes y después (null si no se pudo consultar). */
  tarifaAnterior: number | null;
  tarifaNueva: number | null;
  /** La tarifa del POS es manual: se conservó aunque Cloudbeds cambiara la suya. */
  tarifaManualConservada: boolean;
  /** Diferencia entre lo que debería sumar la venta conciliada y lo que suma (para ofrecer un ajuste); null si no aplica. */
  ajusteSugerido: number | null;
}

/**
 * Aplica al POS lo que Cloudbeds ya cambió (la reserva se canceló allá, o cambió de fechas o de habitación; p. ej. desde la
 * extranet de Booking). En un cambio también trae la tarifa nueva de Cloudbeds (solo la LEE: no escribe en Cloudbeds ni
 * en el canal) y actualiza las fechas de la venta conciliada. El dinero de la venta NO se toca: si su total ya no cuadra,
 * se devuelve el ajuste sugerido para que la persona decida.
 */
export async function aplicarDivergenciaHotel(r: ReservaHotel, d: { tipo: 'cancelada' | 'cambiada'; llegada?: string; salida?: string; room_type_id?: string; cabana?: string }): Promise<ResultadoDivergencia> {
  const sinCambioTarifa: ResultadoDivergencia = { tarifaAnterior: r.total_cloudbeds, tarifaNueva: null, tarifaManualConservada: false, ajusteSugerido: null };
  if (d.tipo === 'cancelada') {
    await actualizar(r.id, { estado: 'cancelada', sync_error: 'Cancelada en Cloudbeds' });
    void registrarEventoHotel(r.id, 'cancelada', `Cancelada ${r.fuente_externa ? `en ${r.fuente_nombre ?? 'el canal'} / Cloudbeds` : 'en Cloudbeds'}`);
    await comentarCancelacionEnVenta(r, r.fuente_externa ? `en ${r.fuente_nombre ?? 'el canal'} / Cloudbeds` : 'en Cloudbeds');
    return sinCambioTarifa;
  }

  let tarifaNueva: number | null = null;
  if (r.cloudbeds_reservation_id) {
    try { tarifaNueva = (await getReservaCloudbeds(r.cloudbeds_reservation_id)).total; } catch { /* sin tarifa: se aplican solo las fechas */ }
  }
  const llegada = d.llegada ?? r.llegada;
  const salida = d.salida ?? r.salida;
  void registrarEventoHotel(r.id, 'fechas', `Actualizada con Cloudbeds: ${d.llegada ?? r.llegada} → ${d.salida ?? r.salida}${tarifaNueva !== null ? ` · tarifa $${tarifaNueva.toFixed(2)}` : ''}`);
  await actualizar(r.id, {
    ...(d.llegada ? { llegada: d.llegada } : {}),
    ...(d.salida ? { salida: d.salida } : {}),
    ...(d.room_type_id ? { room_type_id: d.room_type_id, ...(d.cabana ? { cabana: d.cabana } : {}) } : {}),
    ...(tarifaNueva !== null ? { total_cloudbeds: tarifaNueva, ...(r.tarifa_manual ? {} : { total_estadia: tarifaNueva }) } : {}),
  });

  const totalEstadia = r.tarifa_manual || tarifaNueva === null ? r.total_estadia : tarifaNueva;
  const ajusteSugerido = await seguirVentaPorCambio(r, llegada, salida, totalEstadia);
  return { tarifaAnterior: r.total_cloudbeds, tarifaNueva, tarifaManualConservada: r.tarifa_manual && tarifaNueva !== null, ajusteSugerido };
}

/**
 * Venta conciliada tras un cambio de estadía: sus fechas son un dato (no dinero) y se actualizan; su total solo se compara.
 * Devuelve el ajuste que haría falta para que cuadre (null si cuadra o no aplica). En grupo no se toca: la venta es compartida.
 */
async function seguirVentaPorCambio(r: ReservaHotel, llegada: string, salida: string, totalEstadia: number): Promise<number | null> {
  if (!r.venta_id || r.grupo_id) return null;
  try {
    const db = await initVerticalRxDb();
    const doc = await db.ventas.findOne(r.venta_id).exec();
    if (!doc) return null;
    await updateRxVenta(r.venta_id, { llegada, salida });
    const totalPos = totalEstadia + r.extras.reduce((a, e) => a + e.monto, 0);
    const v = calcularVenta(doc.toJSON() as RxVenta);
    const dif = Math.round((totalPos - v.montoTotal) * 100) / 100;
    return !v.anulado && Math.abs(dif) > 0.005 ? dif : null;
  } catch (e) {
    console.warn('No se pudieron actualizar las fechas de la venta', r.venta_id, e);
    return null;
  }
}

/**
 * Revisa un cambio que el servidor ya aplicó desde Cloudbeds (`aviso_cloudbeds`) y hace lo que el servidor no toca: en una
 * cancelación deja el comentario en la venta (con sus cobros, por si corresponde un reembolso); en un cambio de estadía
 * actualiza las fechas de la venta y el cargo del plan de alimentación. El dinero no cambia: si la venta ya no cuadra, se
 * devuelve el ajuste sugerido para que la persona decida. Al terminar, el aviso se da por revisado.
 */
export async function revisarAvisoCloudbedsHotel(r: ReservaHotel): Promise<{ ajusteSugerido: number | null }> {
  const aviso = r.aviso_cloudbeds;
  let ajusteSugerido: number | null = null;
  if (aviso?.tipo === 'cancelada') {
    await comentarCancelacionEnVenta(r, aviso.donde ?? 'en Cloudbeds');
  } else if (aviso?.tipo === 'cambiada') {
    if (planSeCobra(r.plan_alimentacion)) await sincronizarExtraPlanHotel(r).catch((e) => console.warn('No se pudo actualizar el plan de alimentación', e));
    const fresca = (await leerReservaHotel(r.id)) ?? r;
    ajusteSugerido = await seguirVentaPorCambio(fresca, fresca.llegada, fresca.salida, fresca.total_estadia);
  }
  await actualizar(r.id, { aviso_cloudbeds: null });
  return { ajusteSugerido };
}

/** Agrega a la venta conciliada un ajuste por `monto` (positivo o negativo). Lo decide la persona, nunca el sistema. */
export async function ajustarVentaHotel(r: ReservaHotel, monto: number, motivo: string): Promise<void> {
  if (!r.venta_id) throw new Error('La reserva no tiene una venta conciliada.');
  await agregarVentaMovimiento({
    venta_id: r.venta_id,
    tipo: 'ajuste',
    monto,
    motivo,
    usuario_id: localStorage.getItem('pos_current_mesero_id') || undefined,
  });
}

/**
 * Tras un cambio que movió la tarifa (fechas, huéspedes), ajusta la venta del Centro de Ventas por la DIFERENCIA entre el
 * total que tenía cada reserva y el que tiene ahora. Una sola entrada por venta (un grupo comparte la suya). Devuelve el
 * monto total ajustado (0 si no hubo venta o no cambió). Un fallo aquí no deshace el cambio: se avisa y queda el descuadre
 * visible en Cobros.
 */
export async function ajustarVentaPorCambioHotel(antes: ReservaHotel[], motivo: string): Promise<number> {
  const porVenta = new Map<string, { r: ReservaHotel; delta: number }>();
  for (const a of antes) {
    if (!a.venta_id) continue;
    try {
      const ahora = await leerReservaHotel(a.id);
      if (!ahora) continue;
      const delta = Math.round((totalConExtras(ahora) - totalConExtras(a)) * 100) / 100;
      const previo = porVenta.get(a.venta_id);
      porVenta.set(a.venta_id, { r: previo?.r ?? a, delta: (previo?.delta ?? 0) + delta });
    } catch (e) { console.warn('No se pudo leer la reserva para ajustar la venta', a.id, e); }
  }
  let total = 0;
  for (const { r, delta } of porVenta.values()) {
    if (Math.abs(delta) < 0.005) continue;
    try { await ajustarVentaHotel(r, delta, motivo); total += delta; } catch (e) { console.warn('No se pudo ajustar la venta', r.venta_id, e); }
  }
  return total;
}

/** Id fijos de los extras que vienen de Cloudbeds: así se actualizan en lugar de duplicarse. */
const ID_EXTRA_CB = 'cb-extras';
const ID_IMPUESTOS_CB = 'cb-impuestos';

/** Tarifa de las noches según Cloudbeds. Si no informa el desglose, se usa su total. */
const hospedajeDe = (det: Pick<ReservaCloudbedsDetalle, 'total' | 'desglose'>) => (det.desglose && det.desglose.hospedaje > 0 ? det.desglose.hospedaje : det.total);

/**
 * Los cargos que Cloudbeds tiene además de las noches (actividades, spa, impuestos), como extras del POS de solo importe.
 * `actuales` son los extras que ya tiene la reserva: lo que ya se cubrió con productos reales del POS (`cubre`) no se vuelve a traer.
 */
function extrasDeCloudbeds(det: Pick<ReservaCloudbedsDetalle, 'desglose'>, actuales: ExtraHotel[] = []): ExtraHotel[] {
  const d = det.desglose;
  if (!d) return [];
  const fecha = new Date().toISOString();
  const cubiertoDe = (id: string) => actuales.filter((e) => e.id === id).reduce((a, e) => a + (e.cubre ?? 0), 0);
  const out: ExtraHotel[] = [];
  const cargo = (id: string, descripcion: string, importe: number) => {
    const cubierto = Math.min(cubiertoDe(id), importe);
    const pendiente = Math.round((importe - cubierto) * 100) / 100;
    if (cubierto > 0.005) out.push({ id, descripcion, monto: 0, fecha, origen: 'cloudbeds', cubre: cubierto });
    if (pendiente > 0.005) out.push({ id: cubierto > 0.005 ? `${id}-p` : id, descripcion: cubierto > 0.005 ? `${descripcion} (resto)` : descripcion, monto: pendiente, fecha, origen: 'cloudbeds' });
  };
  if (d.extras > 0.005) cargo(ID_EXTRA_CB, 'Extras cargados en Cloudbeds', d.extras);
  if (d.impuestos > 0.005) cargo(ID_IMPUESTOS_CB, 'Impuestos y cargos de Cloudbeds', d.impuestos);
  return out;
}

export interface ResultadoConciliacionCloudbeds {
  /** Lo que informa Cloudbeds. */
  cloudbeds: { hospedaje: number; extras: number; impuestos: number; total: number };
  /** Cambios que se harían (o se hicieron) en el POS. */
  estadia: { antes: number; despues: number };
  extras: { antes: number; despues: number };
  hayCambios: boolean;
}

/** Compara el desglose de Cloudbeds con lo que tiene el POS, sin cambiar nada. */
export async function revisarConCloudbedsHotel(r: ReservaHotel): Promise<ResultadoConciliacionCloudbeds> {
  return compararConCloudbeds(r, await detalleCloudbeds(r));
}

async function detalleCloudbeds(r: ReservaHotel): Promise<ReservaCloudbedsDetalle> {
  if (!r.cloudbeds_reservation_id) throw new Error('La reserva aún no está en Cloudbeds.');
  return getReservaCloudbeds(r.cloudbeds_reservation_id);
}

function compararConCloudbeds(r: ReservaHotel, det: ReservaCloudbedsDetalle): ResultadoConciliacionCloudbeds {
  if (!det.desglose) throw new Error('Cloudbeds no informó el desglose de esta reserva.');
  const d = det.desglose;
  const hospedaje = hospedajeDe(det);
  // Lo que el POS ya tiene de esos cargos: la línea de Cloudbeds y lo cubierto con productos propios.
  const extrasAntes = r.extras.filter((e) => e.origen === 'cloudbeds').reduce((a, e) => a + e.monto + (e.cubre ?? 0), 0);
  const extrasDespues = d.extras + d.impuestos;
  const estadiaDespues = r.tarifa_manual ? r.total_estadia : hospedaje;
  const dif = (a: number, b: number) => Math.abs(a - b) >= 0.005;
  return {
    cloudbeds: { hospedaje, extras: d.extras, impuestos: d.impuestos, total: d.total },
    estadia: { antes: r.total_estadia, despues: estadiaDespues },
    extras: { antes: extrasAntes, despues: extrasDespues },
    hayCambios: dif(r.total_estadia, estadiaDespues) || dif(extrasAntes, extrasDespues) || dif(r.total_cloudbeds ?? NaN, hospedaje),
  };
}

/**
 * Trae de Cloudbeds la parte de la estadía y los cargos extra (actividades, spa, impuestos) y deja el POS igual: la estadía
 * pasa a ser solo las noches (salvo tarifa manual) y lo demás queda como extras «de Cloudbeds». Los extras vendidos en el POS
 * no se tocan. Devuelve la reserva actualizada.
 */
export async function conciliarConCloudbedsHotel(r: ReservaHotel, usuario?: string): Promise<{ reserva: ReservaHotel; resultado: ResultadoConciliacionCloudbeds }> {
  // Una sola consulta a Cloudbeds: el mismo detalle sirve para comparar y para traer los extras.
  const det = await detalleCloudbeds(r);
  const resultado = compararConCloudbeds(r, det);
  // Los de Cloudbeds se reemplazan por lo vigente (si ya no hay cargo, desaparecen); los del POS se conservan.
  const extras = await modificarExtras(r.id, (lista) => [...lista.filter((e) => e.origen !== 'cloudbeds'), ...extrasDeCloudbeds(det, lista)]);
  const patch: Record<string, unknown> = {
    total_cloudbeds: resultado.cloudbeds.hospedaje,
    ...(r.tarifa_manual ? {} : { total_estadia: resultado.cloudbeds.hospedaje }),
  };
  await actualizar(r.id, patch);
  void registrarEventoHotel(r.id, 'tarifa', `Conciliada con Cloudbeds: estadía $${resultado.estadia.despues.toFixed(2)}, extras de Cloudbeds $${resultado.extras.despues.toFixed(2)}`, usuario);
  return { reserva: { ...r, ...(patch as Partial<ReservaHotel>), extras }, resultado };
}

/**
 * «Adopta» una reserva que ya existe en Cloudbeds: crea en el POS un registro enlazado, sin tocar Cloudbeds. Desde ahí se
 * pueden añadir extras, fijar una tarifa manual y (si no es de un canal externo) cambiar fechas o cancelar.
 * Solo reservas de UNA habitación: el POS maneja una habitación por registro, las de varias se gestionan en Cloudbeds.
 */
/** Lanza un error si la reserva de Cloudbeds no se puede adoptar (cancelada, o con varias habitaciones). */
export function validarAdopcion(det: ReservaCloudbedsDetalle): void {
  if (det.estado === 'canceled' || det.estado === 'no_show') throw new Error('Esta reserva está cancelada en Cloudbeds.');
  if (det.habitaciones.length !== 1) throw new Error('Esta reserva incluye varias habitaciones. Se gestiona en Cloudbeds.');
}

export interface OpcionesAdopcion {
  /** Venta del Centro de Ventas conciliada (sus cobros son los de esta reserva). */
  ventaId?: string | null;
  /** Ficha del cliente del POS. */
  clienteId?: string | null;
  /** Datos del huésped unificados en la conciliación (si se eligieron los del POS). */
  huesped?: { nombre: string; apellido: string; email: string; telefono: string };
  /** Tarifa que manda en el POS cuando difiere de la de Cloudbeds (p. ej. el total de la venta conciliada). */
  tarifaManual?: { total: number; motivo: string } | null;
}

/** Una habitación de un grupo de Cloudbeds que se adopta: la habitación del POS, sus huéspedes y la tarifa verificada a mano. */
export interface LineaAdopcionGrupo {
  roomTypeID: string;
  /** Unidad asignada en Cloudbeds (un tipo puede tener varias). */
  roomID?: string | null;
  cabana: string;
  /** Código corto de la habitación (va en el nombre del grupo en Cloudbeds al convertir). */
  codigo?: string | null;
  adultos: number;
  ninos: number;
  /** Tarifa de hospedaje de esta habitación, escrita a mano tras verificarla en Cloudbeds. */
  tarifa: number;
}

/**
 * Adopta una reserva de Cloudbeds con VARIAS habitaciones: crea una reserva del POS por habitación, todas con el mismo
 * `grupo_id`. El código de Cloudbeds va en `cloudbeds_grupo_ref` (no en `cloudbeds_reservation_id`), así que la sincronización
 * 1 a 1 con Cloudbeds no las toca. La tarifa de cada una es la escrita a mano (tarifa manual: el total de Cloudbeds no se
 * reparte solo). Los cargos extra de Cloudbeds (actividades, impuestos) se anotan una sola vez, en la primera.
 */
export async function adoptarGrupoCloudbeds(
  det: ReservaCloudbedsDetalle, lineas: LineaAdopcionGrupo[],
  op: { clienteId?: string | null; huesped?: { nombre: string; apellido: string; email: string; telefono: string }; usuarioNombre?: string } = {},
): Promise<ReservaHotel[]> {
  if (det.estado === 'canceled' || det.estado === 'no_show') throw new Error('Esta reserva está cancelada en Cloudbeds.');
  if (lineas.length < 2) throw new Error('Un grupo necesita al menos dos habitaciones.');
  // La marca de «columna disponible» pudo quedar en falso por una carga hecha antes de ejecutar la migración (vive hasta recargar
  // la página): se vuelve a intentar y solo si Postgres rechaza la columna se avisa de la migración.
  grupoRefDisponible = true;
  const grupoId = crypto.randomUUID();
  const h = op.huesped ?? det.huesped;
  const pais = /^[A-Za-z]{2}$/.test(det.huesped.pais) ? det.huesped.pais.toUpperCase() : 'EC';
  const filas = lineas.map((l, i) => ({
    id: crypto.randomUUID(),
    organization_id: orgActiva(),
    cloudbeds_grupo_ref: det.reservationID,
    room_type_id: l.roomTypeID,
    ...(l.roomID && unidadReservaDisponible ? { room_id: l.roomID } : {}),
    cabana: l.cabana,
    llegada: det.llegada,
    salida: det.salida,
    adultos: Math.max(1, l.adultos),
    ninos: Math.max(0, l.ninos),
    huesped_nombre: h.nombre.trim() || 'Huésped',
    huesped_apellido: h.apellido.trim() || '—',
    huesped_email: h.email.trim(),
    huesped_telefono: h.telefono.trim() || null,
    huesped_pais: pais,
    total_cloudbeds: null,
    total_estadia: Math.round(l.tarifa * 100) / 100,
    tarifa_manual: true,
    tarifa_motivo: 'Tarifa de la habitación verificada en Cloudbeds al adoptar el grupo',
    grupo_id: grupoId,
    ...(op.clienteId ? { cliente_id: op.clienteId } : {}),
    extras: i === 0 ? extrasDeCloudbeds(det) : [],
    estado: 'confirmada' as const,
    sync_estado: 'sincronizada' as const,
    adoptada: true,
    fuente_nombre: det.fuente,
    fuente_externa: det.fuenteExterna,
    usuario_nombre: op.usuarioNombre ?? null,
    ...(historialDisponible ? { historial: [{ ...eventoCreada(op.usuarioNombre), tipo: 'conciliacion' as const, texto: `Adoptada desde Cloudbeds (reserva ${det.reservationID}) como parte de un grupo de ${lineas.length} habitaciones` }] } : {}),
  }));
  const { data, error } = await supabase.from('hotel_reservas').insert(filas).select(columnas());
  if (error) {
    if (/cloudbeds_grupo_ref/.test(error.message)) { grupoRefDisponible = false; throw new Error('Para adoptar grupos ejecuta la migración 20261022000200_hotel_cloudbeds_grupo_ref.sql en Supabase (si ya la ejecutaste, espera unos segundos a que Supabase actualice su esquema y reintenta)'); }
    throw new Error(error.message);
  }
  return (data ?? []).map(normalizar);
}

/**
 * CONVIERTE un grupo de Cloudbeds (una reserva con varias habitaciones) en reservas individuales gestionadas desde el POS:
 * guarda una reserva por habitación como pendiente (nada se pierde), cancela la reserva original en Cloudbeds y sube cada habitación
 * como reserva propia (el Worker comprueba disponibilidad en vivo, por eso la cancelación va antes). Si la cancelación falla se
 * deshace lo guardado y no cambia nada. Si alguna subida es rechazada, esa habitación queda cancelada en el POS y la original ya
 * no existe en Cloudbeds: hay que avisar para que se cree de nuevo a mano. Cloudbeds crea con su tarifa estándar; el precio
 * real queda como tarifa manual del POS. Los cargos extra de Cloudbeds pasan a extras normales del POS (en la primera habitación).
 */
export async function convertirGrupoCloudbeds(
  det: ReservaCloudbedsDetalle, lineas: LineaAdopcionGrupo[],
  op: { clienteId?: string | null; huesped?: { nombre: string; apellido: string; email: string; telefono: string }; usuarioId?: string; usuarioNombre?: string } = {},
  alProgreso?: (p: ProgresoCreacion) => void,
): Promise<{ reservas: ReservaHotel[]; resultados: ResultadoSync[] }> {
  if (det.estado === 'canceled' || det.estado === 'no_show') throw new Error('Esta reserva ya está cancelada en Cloudbeds.');
  if (det.fuenteExterna) throw new Error('Una reserva de un canal externo no se puede convertir.');
  if (lineas.length < 2) throw new Error('Un grupo necesita al menos dos habitaciones.');
  const grupoId = crypto.randomUUID();
  const etiqueta = `Grupo - ${lineas.map((l) => l.codigo || l.cabana).join(',')}`;
  const h = op.huesped ?? det.huesped;
  const pais = /^[A-Za-z]{2}$/.test(det.huesped.pais) ? det.huesped.pais.toUpperCase() : 'EC';
  const fecha = new Date().toISOString();
  // Los cargos de Cloudbeds desaparecen con la reserva cancelada: se conservan como extras normales del POS.
  const extrasCb = extrasDeCloudbeds(det).filter((e) => e.monto > 0).map((e) => ({ id: crypto.randomUUID(), descripcion: e.descripcion, monto: e.monto, fecha, usuario: op.usuarioNombre }));
  const filas = lineas.map((l, i) => ({
    id: crypto.randomUUID(),
    organization_id: orgActiva(),
    room_type_id: l.roomTypeID,
    ...(l.roomID && unidadReservaDisponible ? { room_id: l.roomID } : {}),
    cabana: l.cabana,
    llegada: det.llegada,
    salida: det.salida,
    adultos: Math.max(1, l.adultos),
    ninos: Math.max(0, l.ninos),
    huesped_nombre: h.nombre.trim() || 'Huésped',
    huesped_apellido: h.apellido.trim() || '—',
    huesped_email: h.email.trim(),
    huesped_telefono: h.telefono.trim() || null,
    huesped_pais: pais,
    total_cloudbeds: Math.round(l.tarifa * 100) / 100,
    total_estadia: Math.round(l.tarifa * 100) / 100,
    tarifa_manual: true,
    tarifa_motivo: 'Tarifa de la habitación verificada en Cloudbeds al convertir el grupo',
    grupo_id: grupoId,
    grupo_etiqueta: etiqueta,
    ...(op.clienteId && conciliacionDisponible ? { cliente_id: op.clienteId } : {}),
    extras: i === 0 ? extrasCb : [],
    estado: 'confirmada' as const,
    sync_estado: 'pendiente' as const,
    usuario_id: op.usuarioId ?? null,
    usuario_nombre: op.usuarioNombre ?? null,
    ...(historialDisponible ? { historial: [{ ...eventoCreada(op.usuarioNombre), tipo: 'conciliacion' as const, texto: `Convertida desde la reserva ${det.reservationID} de Cloudbeds (grupo de ${lineas.length} habitaciones): se canceló allá y se creó una reserva por habitación` }] } : {}),
  }));
  const { data, error } = await supabase.from('hotel_reservas').insert(filas).select(columnas());
  if (error) throw new Error(error.message);
  const reservas = (data ?? []).map(normalizar);
  alProgreso?.({ fase: 'guardado' });

  // La original ocupa las habitaciones: se cancela antes de subir. Si no se puede, se deshace lo guardado.
  try {
    await cancelarReservaCloudbeds(det.reservationID);
  } catch (e) {
    await supabase.from('hotel_reservas').delete().in('id', reservas.map((r) => r.id)).eq('organization_id', orgActiva());
    throw new Error(`No se pudo cancelar la reserva original en Cloudbeds, así que no se cambió nada. ${e instanceof Error ? e.message : ''}`.trim());
  }

  const resultados = await Promise.all(reservas.map(async (r) => {
    const res = await subirACloudbeds(r);
    alProgreso?.({ fase: 'cabana', roomTypeID: claveEnlace(r.room_type_id, r.room_id), sync: res.sync });
    return res;
  }));
  return { reservas: reservas.map((r, i) => ({ ...r, sync_estado: resultados[i].sync, estado: resultados[i].sync === 'error' ? 'cancelada' as const : r.estado })), resultados };
}

export async function adoptarReservaHotel(det: ReservaCloudbedsDetalle, habitaciones: Array<{ nombre: string; cloudbeds_room_type_id: string | null; cloudbeds_room_id?: string | null }>, op: OpcionesAdopcion = {}): Promise<ReservaHotel> {
  validarAdopcion(det);
  const hab = det.habitaciones[0];
  const nombreCabana = habitacionDeUnidad(habitaciones, hab.roomTypeID, hab.roomID)?.nombre ?? hab.nombreUnidad ?? hab.nombre;
  const fila = {
    id: crypto.randomUUID(),
    organization_id: orgActiva(),
    cloudbeds_reservation_id: det.reservationID,
    room_type_id: hab.roomTypeID,
    ...(hab.roomID && unidadReservaDisponible ? { room_id: hab.roomID } : {}),
    cabana: nombreCabana,
    llegada: det.llegada,
    salida: det.salida,
    adultos: Math.max(1, hab.adultos),
    ninos: Math.max(0, hab.ninos),
    huesped_nombre: (op.huesped?.nombre ?? det.huesped.nombre).trim() || 'Huésped',
    huesped_apellido: (op.huesped?.apellido ?? det.huesped.apellido).trim() || '—',
    huesped_email: (op.huesped?.email ?? det.huesped.email).trim(),
    huesped_telefono: (op.huesped?.telefono ?? det.huesped.telefono).trim() || null,
    huesped_pais: /^[A-Za-z]{2}$/.test(det.huesped.pais) ? det.huesped.pais.toUpperCase() : 'EC',
    total_cloudbeds: hospedajeDe(det),
    total_estadia: op.tarifaManual ? op.tarifaManual.total : hospedajeDe(det),
    extras: extrasDeCloudbeds(det),
    tarifa_manual: !!op.tarifaManual,
    tarifa_motivo: op.tarifaManual?.motivo ?? null,
    ...(op.ventaId ? { venta_id: op.ventaId } : {}),
    ...(op.clienteId ? { cliente_id: op.clienteId } : {}),
    estado: 'confirmada' as const,
    sync_estado: 'sincronizada' as const,
    adoptada: true,
    fuente_nombre: det.fuente,
    fuente_externa: det.fuenteExterna,
  };
  const { data, error } = await supabase.from('hotel_reservas').insert(fila).select(columnas()).single();
  if (error) {
    // 23505: ya hay un registro del POS enlazado a esa reserva de Cloudbeds.
    throw new Error(error.code === '23505' ? 'Esta reserva ya está enlazada en el POS.' : error.message);
  }
  return normalizar(data);
}

/** Quita un extra de la reserva en el POS. La nota que ya se anotó en Cloudbeds no se puede borrar: allá es solo informativa. */
export async function quitarExtraHotel(r: ReservaHotel, extraId: string, usuario?: string): Promise<ReservaHotel> {
  const quitado = r.extras.find((e) => e.id === extraId);
  // Un cargo de Cloudbeds no desaparece del todo: queda anotado cuánto se cubrió con productos del POS, para que la
  // conciliación no lo vuelva a traer mientras Cloudbeds tenga el mismo importe.
  const extras = await modificarExtras(r.id, (actuales) => {
    const q = actuales.find((e) => e.id === extraId);
    if (!q) return actuales;
    const resto = actuales.filter((e) => e.id !== extraId);
    if (q.origen !== 'cloudbeds') return resto;
    const base = q.id.replace(/-p$/, '');
    const previo = resto.find((e) => e.id === base);
    return [...resto.filter((e) => e.id !== base), { ...q, id: base, monto: 0, cubre: (previo?.cubre ?? 0) + q.monto + (q.cubre ?? 0) }];
  });
  if (quitado) void registrarEventoHotel(r.id, 'extra', `Extra quitado: ${quitado.descripcion} $${quitado.monto.toFixed(2)}`, usuario);
  return { ...r, extras };
}

export interface DatosHuespedEditables {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  pais: string;
  notas: string;
  clienteId: string | null;
}

/** Cambia los datos del huésped SOLO en el POS: Cloudbeds conserva los que tiene. */
export async function actualizarDatosHuespedHotel(r: ReservaHotel, d: DatosHuespedEditables, usuario?: string): Promise<ReservaHotel> {
  const patch: Record<string, unknown> = {
    huesped_nombre: d.nombre.trim(),
    huesped_apellido: d.apellido.trim(),
    huesped_email: d.email.trim(),
    huesped_telefono: d.telefono.trim() || null,
    huesped_pais: d.pais.trim().toUpperCase(),
    notas: d.notas.trim() || null,
    ...(conciliacionDisponible ? { cliente_id: d.clienteId } : {}),
  };
  await actualizar(r.id, patch);
  void registrarEventoHotel(r.id, 'cliente', 'Datos del huésped actualizados en el POS', usuario);
  return {
    ...r,
    huesped_nombre: patch.huesped_nombre as string,
    huesped_apellido: patch.huesped_apellido as string,
    huesped_email: patch.huesped_email as string,
    huesped_telefono: patch.huesped_telefono as string | null,
    huesped_pais: patch.huesped_pais as string,
    notas: patch.notas as string | null,
    cliente_id: conciliacionDisponible ? d.clienteId : r.cliente_id,
  };
}

export const nombreHuesped = (r: Pick<ReservaHotel, 'huesped_nombre' | 'huesped_apellido'>) =>
  `${r.huesped_nombre} ${r.huesped_apellido}`.trim();

export const totalConExtras = (r: Pick<ReservaHotel, 'total_estadia' | 'extras'>) =>
  r.total_estadia + r.extras.reduce((a, e) => a + e.monto, 0);

/** Marca que a esta reserva no se le abrirá cuenta de habitación en Mesas: la tira de llegadas deja de mostrarla. */
export async function omitirLlegadaMesas(r: ReservaHotel, usuario?: string): Promise<void> {
  if (!sinCuentaMesasDisponible) throw new Error('Para ocultar llegadas ejecuta la migración 20261023000300_hotel_reservas_sin_cuenta_mesas.sql en Supabase');
  await actualizar(r.id, { sin_cuenta_mesas: true });
  void registrarEventoHotel(r.id, 'conciliacion', 'Llegada ocultada en Mesas: no se abrirá cuenta de habitación', usuario);
}
