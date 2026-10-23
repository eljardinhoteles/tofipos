import { supabase } from './supabase';

// Cliente del Worker `pos-cloudbeds` (ver PLAN-cloudbeds-canal-directo.md). La API key de Cloudbeds vive solo en el Worker;
// aquí solo se envía la sesión de Supabase del usuario.
const WORKER_URL = (import.meta.env.VITE_CLOUDBEDS_WORKER_URL as string | undefined)?.replace(/\/$/, '');

export interface OfertaCabana {
  roomTypeID: string;
  roomTypeName: string;
  roomsAvailable: number;
  rateID: string | null;
  /** Total de la estadía (no por noche). */
  totalRate: number;
  noches: Array<{ date: string; rate: number; disponible: boolean }>;
  reservable: boolean;
  motivo: string | null;
  /** Si no se cumple la estadía mínima: cuántas noches pide como mínimo para esas fechas. */
  minNoches?: number | null;
  nombrePlan?: string | null;
  /** Capacidad máxima de la habitación (adultos + niños) y adultos incluidos en la tarifa, según Cloudbeds. */
  capacidad?: number | null;
  adultosIncluidos?: number | null;
  /** Otros planes de tarifa de la misma habitación (paquetes). Hoy solo se ofrece el plan básico. */
  planes?: Array<{ rateID: string | null; nombrePlan: string | null; totalRate: number; reservable: boolean; motivo: string | null }>;
}

export interface DisponibilidadResp {
  start: string;
  end: string;
  adults: number;
  children: number;
  ofertas: OfertaCabana[];
}

export interface CrearReservaInput {
  start: string;
  end: string;
  adults: number;
  children?: number;
  roomTypeID: string;
  /** Unidad concreta del tipo (modelo con varias unidades por tipo). Sin ella, Cloudbeds asigna una. */
  roomID?: string;
  rateID?: string;
  guest: { firstName: string; lastName: string; email: string; phone?: string; country: string };
  /** Id de la venta del POS (thirdPartyIdentifier en Cloudbeds). */
  externalId?: string;
  sendEmailConfirmation?: boolean;
}

export interface ModificarReservaInput {
  roomTypeID: string;
  start: string;
  end: string;
  adults: number;
  children?: number;
  subReservationID?: string;
  /** Unidad destino al cambiar de habitación cuando el tipo tiene varias (verificar en sandbox: depende de que putReservation acepte roomID). */
  roomID?: string;
  rateID?: string;
  adjustPrice?: boolean;
}

/**
 * `reintentable`: el fallo es pasajero — red, servidor, límite de peticiones o la sesión del POS (caducó o falta) — y la
 * reserva puede quedar «pendiente» y reintentarse. Si es false, Cloudbeds la rechazó con una razón definitiva (sin cupo,
 * datos inválidos): no sirve reintentar igual. Ojo: un rechazo definitivo hace que el POS cancele la reserva local.
 */
export class CloudbedsError extends Error {
  status: number;
  reintentable: boolean;
  constructor(message: string, status: number, reintentable: boolean) {
    super(message);
    this.name = 'CloudbedsError';
    this.status = status;
    this.reintentable = reintentable;
  }
}

export const cloudbedsConfigurado = Boolean(WORKER_URL);

// Crear una reserva (disponibilidad en vivo + alta en Cloudbeds) tarda unos segundos; esto es solo el tope.
const TIEMPO_MAX_MS = 30_000;
const AVISO_LENTO_MS = 3_000;

async function llamar<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!WORKER_URL) throw new CloudbedsError('Cloudbeds no está configurado (falta VITE_CLOUDBEDS_WORKER_URL)', 0, true);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new CloudbedsError('Sesión no disponible. Vuelve a iniciar sesión con conexión.', 401, true);
  // Cada organización (sucursal) tiene su propia cuenta de Cloudbeds: el Worker usa la de la organización activa.
  const orgId = localStorage.getItem('pos_active_org_id') || '';
  if (!orgId) throw new CloudbedsError('No hay una organización activa en este dispositivo.', 401, true);

  const inicio = performance.now();
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, 'X-Org-Id': orgId, 'Content-Type': 'application/json' },
      // Sin límite, una petición colgada dejaría la pantalla esperando para siempre.
      signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    });
  } catch (e) {
    // Sin conexión, Worker inaccesible o sin respuesta a tiempo. (Una creación pudo llegar igual: el reintento la busca.)
    const tiempo = e instanceof DOMException && e.name === 'TimeoutError';
    throw new CloudbedsError(tiempo ? 'Cloudbeds tardó demasiado en responder' : 'No hay conexión con Cloudbeds', 0, true);
  }

  // Si una llamada tarda, se deja en la consola dónde se fue el tiempo (cabecera Server-Timing del Worker).
  const ms = Math.round(performance.now() - inicio);
  if (ms > AVISO_LENTO_MS) console.warn(`[Cloudbeds lento] ${path.split('?')[0]} ${ms} ms · Worker: ${res.headers.get('Server-Timing') ?? 'sin datos'}`);

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensaje = (body as { error?: string }).error || `Error ${res.status}`;
    // 5xx, 429 y los de sesión (401/403: caducó o se cambió de usuario) son pasajeros. El resto de 4xx (409 sin cupo,
    // 400 datos inválidos) son rechazos definitivos.
    const pasajero = res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 403;
    throw new CloudbedsError(mensaje, res.status, pasajero);
  }
  return body as T;
}

export interface OpcionesDisponibilidad {
  /** Solo qué habitaciones están libres: sin tarifas ni noches (los precios llegan al cotizar). */
  lista?: boolean;
  /** Pedir solo estas habitaciones (roomTypeID): para cotizar únicamente las elegidas. */
  roomTypeIDs?: string[];
}

export function getDisponibilidad(start: string, end: string, adults: number, children = 0, opciones: OpcionesDisponibilidad = {}) {
  const q = new URLSearchParams({ start, end, adults: String(adults), children: String(children) });
  if (opciones.lista) q.set('lista', '1');
  if (opciones.roomTypeIDs?.length) q.set('roomTypeIDs', opciones.roomTypeIDs.join(','));
  return llamar<DisponibilidadResp>(`/api/availability?${q}`);
}

/** `idempotencyKey` debe ser estable por reserva (p. ej. el id de la venta): un reintento no crea un duplicado. */
export function crearReservaCloudbeds(input: CrearReservaInput, idempotencyKey: string, reintento = false) {
  // `reintento` hace que el Worker compruebe antes si Cloudbeds ya tiene esta reserva (un intento anterior pudo
  // haberse creado aunque la respuesta se perdiera): así un reintento tardío no la duplica. En ese caso no hay total.
  return llamar<{ reservationID: string; status: string; grandTotal: number | null }>('/api/reservations', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey, ...(reintento ? { 'X-Reintento': '1' } : {}) },
    body: JSON.stringify(input),
  });
}

export function cancelarReservaCloudbeds(reservationId: string) {
  return llamar<{ ok: true }>(`/api/reservations/${encodeURIComponent(reservationId)}/cancel`, { method: 'POST' });
}

/** Check-in en Cloudbeds (la reserva pasa a «En casa»). */
export function checkinReservaCloudbeds(reservationId: string) {
  return llamar<{ ok: true }>(`/api/reservations/${encodeURIComponent(reservationId)}/checkin`, { method: 'POST' });
}

/** Check-out en Cloudbeds (la reserva pasa a «Salió»). */
export function checkoutReservaCloudbeds(reservationId: string) {
  return llamar<{ ok: true }>(`/api/reservations/${encodeURIComponent(reservationId)}/checkout`, { method: 'POST' });
}

export function modificarReservaCloudbeds(reservationId: string, input: ModificarReservaInput) {
  return llamar<{ ok: true; total?: number | null }>(`/api/reservations/${encodeURIComponent(reservationId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Anota en la reserva de Cloudbeds un extra comprado en el POS (spa, tour…). Texto libre, máx. 500 caracteres. */
export function anotarReservaCloudbeds(reservationId: string, nota: string) {
  return llamar<{ ok: true }>(`/api/reservations/${encodeURIComponent(reservationId)}/notes`, {
    method: 'POST',
    body: JSON.stringify({ nota }),
  });
}

export interface TipoHabitacionCloudbeds {
  roomTypeID: string;
  nombre: string;
  codigo: string | null;
  capacidad: number | null;
}

/** Una unidad (habitación física) de Cloudbeds. Un tipo puede tener varias; `roomID` es «<tipo>-<n>». */
export interface UnidadCloudbeds {
  roomID: string;
  nombre: string;
  roomTypeID: string;
}

/** Tipos de habitación y sus unidades en Cloudbeds, para enlazarlos con el mapa de habitaciones del POS. */
export async function getInventarioCloudbeds() {
  const r = await llamar<{ tipos: TipoHabitacionCloudbeds[]; unidades?: UnidadCloudbeds[] }>('/api/room-types');
  return { tipos: r.tipos, unidades: r.unidades ?? [] };
}

/** Tipos de habitación (habitaciones) de Cloudbeds, solo para enlazarlos con el mapa del POS. */
export async function getTiposHabitacion() {
  return (await getInventarioCloudbeds()).tipos;
}

/** Tarjeta del calendario: una reserva o un bloqueo de habitación de Cloudbeds. `hasta` es el día de salida (no incluido). */
export interface TarjetaCalendario {
  tipo: 'reserva' | 'bloqueo';
  id: string;
  roomTypeID: string;
  /** Unidad de Cloudbeds («<tipo>-<n>»). Un tipo puede tener varias; una reserva de varias unidades da una tarjeta por unidad. */
  roomID?: string | null;
  nombre: string;
  desde: string;
  hasta: string;
  estado?: string;
  fuente?: string | null;
  /** Saldo según Cloudbeds: solo referencia (dato heredado). Los pagos se registran en el POS; no se sincronizan. */
  saldo?: number | null;
  /** Id de la reserva del POS cuando la creó el POS (thirdPartyIdentifier). */
  externo?: string | null;
  adultos?: number;
  ninos?: number;
  /** Cuándo se creó la reserva en Cloudbeds («AAAA-MM-DD HH:mm:ss»). */
  creada?: string | null;
  /** Bloqueos: motivo completo (puede tener varias líneas). */
  motivo?: string | null;
  /** Bloqueos: 'blocked_dates' | 'out_of_service' | 'courtesy_hold'. */
  tipoBloqueo?: string | null;
}

export interface CalendarioResp {
  start: string;
  end: string;
  tarjetas: TarjetaCalendario[];
  /** Cuándo se consultó Cloudbeds por última vez (ms). */
  actualizado: number;
  /** El Worker respondió con lo guardado y lo está refrescando: conviene volver a pedirlo en un instante. */
  obsoleto: boolean;
}

/**
 * Reservas y bloqueos entre `start` y `end` (hasta 62 noches), sin tarifas ni disponibilidad. Responde al instante con
 * lo guardado; `fresh` obliga a consultar a Cloudbeds y esperar (botón de actualizar, o tras crear/cancelar).
 */
export function getCalendario(start: string, end: string, fresh = false) {
  const q = new URLSearchParams({ start, end });
  if (fresh) q.set('fresh', '1');
  return llamar<CalendarioResp>(`/api/calendar?${q}`);
}

export interface SaludResp {
  cloudbeds: { ok: boolean; ms: number; error: string | null; propiedad: string | null };
  /** Cuándo llegó el último aviso real de Cloudbeds (ms), o null si nunca. */
  ultimoAvisoWebhook: number | null;
  /** Última ronda del servidor que sube las reservas pendientes (tarea programada). Ausente en un Worker antiguo. */
  reintentoServidor?: { t: number; subidas: number; rechazadas: number; pendientes: number } | null;
  /** Sincronización de vuelta Cloudbeds → POS. `activa` es false si al Worker le falta la clave de servicio de Supabase. Ausente en un Worker antiguo. */
  sincronizacion?: { activa: boolean; ultima: { t: number; creada: number; cancelada: number; cambiada: number; enlazada: number; errores: number } | null };
}

/** Comprobación real (sin caché) de la conexión con Cloudbeds y de los avisos. */
export function getSalud() {
  return llamar<SaludResp>('/api/health');
}

// ---------- bloqueos de habitación ----------

export interface BloqueoInput {
  /** Habitaciones a bloquear (su roomTypeID de Cloudbeds). Con varias se crea UN bloqueo con todas. */
  roomTypeIDs: string[];
  /** Unidades concretas (tipos con varias): mandan sobre `roomTypeIDs` al crear el bloqueo. */
  rooms?: Array<{ roomTypeID: string; roomID: string }>;
  start: string;
  /** Día de salida: no se incluye, igual que en una reserva. */
  end: string;
  motivo: string;
  tipo?: 'blocked_dates' | 'out_of_service';
}

export function crearBloqueoCloudbeds(input: BloqueoInput) {
  return llamar<{ roomBlockID: string | null }>('/api/blocks', { method: 'POST', body: JSON.stringify(input) });
}

/** Elimina el bloqueo entero (todas las habitaciones que incluya). */
export function eliminarBloqueoCloudbeds(roomBlockID: string) {
  return llamar<{ ok: true }>(`/api/blocks/${encodeURIComponent(roomBlockID)}/delete`, { method: 'POST' });
}

// ---------- reserva existente en Cloudbeds ----------

export interface ReservaCloudbedsDetalle {
  reservationID: string;
  estado: string;
  llegada: string;
  salida: string;
  total: number;
  /** De qué se compone el total en Cloudbeds: hospedaje (noches), extras cargados allá e impuestos. Null si no lo informa. */
  desglose?: { hospedaje: number; extras: number; impuestos: number; total: number; pagado: number; impuestosIncluidos?: boolean } | null;
  saldo: number | null;
  fuente: string | null;
  /** Viene de un canal externo (Booking, Expedia…): sus fechas y cancelación las controla el canal. */
  fuenteExterna: boolean;
  habitaciones: Array<{
    roomTypeID: string; nombre: string; adultos: number; ninos: number;
    /** Unidad asignada y su nombre, la sub-reserva y el total de esa habitación dentro de la reserva (null si Cloudbeds no lo informa). */
    roomID?: string | null; nombreUnidad?: string | null; subReservationID?: string | null; total?: number | null;
  }>;
  huesped: { nombre: string; apellido: string; email: string; telefono: string; pais: string };
}

export function getReservaCloudbeds(reservationId: string) {
  return llamar<ReservaCloudbedsDetalle>(`/api/reservations/${encodeURIComponent(reservationId)}`);
}

// ---------- Ajustes › Integraciones (solo administradores) ----------

/** Estado de la conexión de la organización con Cloudbeds. La API key nunca vuelve al navegador. */
export interface EstadoIntegracionCloudbeds {
  conectado: boolean;
  /** 'ajustes' = guardada desde esta pantalla; 'secreto' = configurada en el servidor (no se puede quitar desde aquí). */
  origen: 'ajustes' | 'secreto' | null;
  hotel: string | null;
  propiedad: string | null;
  /** Hay una fuente de reservas del POS configurada. */
  fuente: boolean;
  /** Qué le falta al servidor para guardar credenciales (false = falta). */
  listos: { servidor: boolean; cifrado: boolean };
  actualizado?: string;
}

export const getIntegracionCloudbeds = () => llamar<EstadoIntegracionCloudbeds>('/api/integrations/cloudbeds');

/** Prueba la clave contra Cloudbeds y, si la acepta, la guarda cifrada en el servidor. */
export const guardarIntegracionCloudbeds = (apiKey: string, sourceId?: string) =>
  llamar<EstadoIntegracionCloudbeds>('/api/integrations/cloudbeds', { method: 'POST', body: JSON.stringify({ apiKey, sourceId: sourceId?.trim() || undefined }) });

/** Fuentes de reservas de la cuenta (id «s-…» y nombre): una de ellas es la del POS. */
export const getFuentesCloudbeds = () => llamar<{ fuentes: Array<{ id: string; nombre: string }> }>('/api/integrations/cloudbeds/fuentes');

export const probarIntegracionCloudbeds = () =>
  llamar<{ ok: boolean; hotel?: string | null; propiedad?: string | null; error?: string }>('/api/integrations/cloudbeds/probar', { method: 'POST' });

export const desconectarIntegracionCloudbeds = () =>
  llamar<EstadoIntegracionCloudbeds>('/api/integrations/cloudbeds/desconectar', { method: 'POST' });

/** Registra en Cloudbeds los avisos en vivo (reservas y bloqueos) hacia el Worker de esta organización. */
export const registrarAvisosCloudbeds = () =>
  llamar<{ registrados: number; total: number; fallidos: string[] }>('/api/integrations/cloudbeds/webhooks', { method: 'POST' });
