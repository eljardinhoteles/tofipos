import type { Icon } from '@phosphor-icons/react';
import { ChatsCircle, Globe, Leaf, PencilSimple, PersonSimpleWalk, Prohibit, Wrench } from '@phosphor-icons/react';
import type { TarjetaVista } from '../../lib/hotelCalendarioCache';
import type { TonoEstado } from '../Common/EstadoBadge';
import type { VentaConMovimientos } from '../../lib/ventaConMovimientos';

/**
 * Lenguaje visual de las barras del calendario:
 *  - CANAL (de dónde llegó): el círculo de color con su icono.
 *  - PAGO: el fondo, SOLO si la reserva está conciliada con su venta del Centro de Ventas (ahí viven los cobros). Sin
 *    venta, la tarjeta es neutra. El saldo de Cloudbeds nunca se usa para esto (es un dato heredado).
 * Lo demás (sin confirmar o pendiente de subir, ya salió) se marca sin cambiar estos colores.
 */

export interface EstiloReserva {
  /** Identifica el estilo (para la leyenda). */
  clave: string;
  etiqueta: string;
  /** Fondo, texto y color del borde (clases). */
  fondo: string;
  /** Imagen de fondo (CSS), p. ej. rayas. Va en `style`. */
  imagen?: string;
  /** Círculo del icono del canal. */
  circulo: string;
  icono?: Icon;
  /** Letra en lugar de icono (marcas como Booking: «B.»). */
  letra?: string;
}

// Las clases se escriben completas para que Tailwind las encuentre.
const RESERVA = 'bg-card text-foreground border-border shadow-xs';
const RAYAS_MANTENIMIENTO = 'repeating-linear-gradient(135deg, transparent 0 7px, rgb(251 191 36 / 0.5) 7px 11px)'; // ámbar, sutil

// Bloqueos: gris. Mantenimiento (fuera de servicio): el mismo gris con rayas diagonales amarillas muy sutiles.
const BLOQUEO: EstiloReserva = { clave: 'bloqueo', etiqueta: 'Bloqueo', fondo: 'bg-[#E1E4EA] text-[#334155] border-[#BFC5D0]', circulo: 'bg-white text-[#64748B]', icono: Prohibit };
const FUERA_DE_SERVICIO: EstiloReserva = { ...BLOQUEO, clave: 'fuera', etiqueta: 'Mantenimiento', icono: Wrench, imagen: RAYAS_MANTENIMIENTO };
// Lo que no es de un canal conocido (manual, importada, teléfono…).
const OTRO: EstiloReserva = { clave: 'otro', etiqueta: 'Manual / otros', fondo: RESERVA, circulo: 'bg-slate-500 text-white', icono: PencilSimple };

// Un color por canal, en el círculo. Booking = azul y WeSpeak = violeta.
const POR_CANAL: Array<{ buscar: string } & EstiloReserva> = [
  { buscar: 'aguacate', clave: 'aguacate', etiqueta: 'POS (directa)', fondo: RESERVA, circulo: 'bg-[#12968F] text-white', icono: Leaf },
  { buscar: 'booking.com', clave: 'booking', etiqueta: 'Booking.com', fondo: RESERVA, circulo: 'bg-[#2F6FC4] text-white', letra: 'B.' },
  { buscar: 'wespeak', clave: 'wespeak', etiqueta: 'WeSpeak', fondo: RESERVA, circulo: 'bg-[#7A4FD1] text-white', icono: ChatsCircle },
  { buscar: 'walk', clave: 'walkin', etiqueta: 'Walk-In', fondo: RESERVA, circulo: 'bg-[#D6336C] text-white', icono: PersonSimpleWalk },
  { buscar: 'website', clave: 'web', etiqueta: 'Página web', fondo: RESERVA, circulo: 'bg-[#B5379F] text-white', icono: Globe },
  { buscar: 'expedia', clave: 'expedia', etiqueta: 'Expedia', fondo: RESERVA, circulo: 'bg-[#2F6FC4] text-white', letra: 'E' },
  { buscar: 'airbnb', clave: 'airbnb', etiqueta: 'Airbnb', fondo: RESERVA, circulo: 'bg-[#EA580C] text-white', letra: 'A' },
];

export function estiloDe(t: TarjetaVista): EstiloReserva {
  if (t.tipo === 'bloqueo') return t.tipoBloqueo === 'out_of_service' ? FUERA_DE_SERVICIO : BLOQUEO;
  const fuente = (t.fuente ?? t.local?.fuente_nombre ?? '').toLowerCase();
  // Las reservas que creó el POS se reconocen por su enlace, aunque la tarjeta aún no traiga la fuente.
  const propia = !!t.local && !t.local.adoptada && !fuente;
  return POR_CANAL.find((f) => (propia ? f.buscar === 'aguacate' : fuente.includes(f.buscar))) ?? OTRO;
}

/** Estado de pago según la venta conciliada del Centro de Ventas. */
export interface InfoPago {
  clave: 'pagado' | 'parcial' | 'sin_pago';
  etiqueta: string;
  /** Fondo, texto y borde de la tarjeta (clases). */
  fondo: string;
  /** Color de la barra de avance del popover. */
  barra: string;
  tono: TonoEstado;
}

const PAGADO: InfoPago = { clave: 'pagado', etiqueta: 'Pagado', fondo: 'bg-[#CBE8D4] text-[#14532D] border-[#8CC9A3]', barra: 'bg-[#3F8460]', tono: 'success' };
const PARCIAL: InfoPago = { clave: 'parcial', etiqueta: 'Pago parcial', fondo: 'bg-[#FAE2A5] text-[#5B3A04] border-[#E2BB55]', barra: 'bg-[#E2A92E]', tono: 'warning' };
const SIN_PAGO: InfoPago = { clave: 'sin_pago', etiqueta: 'Sin pago', fondo: 'bg-[#F6CBC4] text-[#7F1D1D] border-[#E49A8E]', barra: 'bg-[#D9705F]', tono: 'destructive' };

export const ESTADOS_PAGO = [PAGADO, PARCIAL, SIN_PAGO];

const EPS = 0.005;

/** null sin venta conciliada (o si la venta está anulada): la tarjeta queda neutra. */
export function pagoDeVenta(v: VentaConMovimientos | undefined): InfoPago | null {
  if (!v || v.anulado) return null;
  if (v.montoTotal > EPS && v.saldo <= EPS) return PAGADO;
  return v.totalPagado > EPS ? PARCIAL : SIN_PAGO;
}
