// Consumos de habitación cobrados con la venta de la reserva de hotel. Al hacer el checkout de una habitación cuya cuenta viene de una
// reserva, la venta de la reserva (que ya nació ajustada por su valor) recibe UN ajuste por lo cargado a la habitación y un comentario con
// el total del checkout y las comandas. Esos textos son también lo que permite reconocer a esa venta como «Reserva hotel + Consumo habitación».

export const MARCA_CHECKOUT = 'Total checkout';

const lista = (folios: string[]) => folios.map((f) => `#${f}`).join(', ');

/** Motivo del ajuste por los consumos (identifica el checkout: el mismo conjunto de comandas da el mismo texto, así un reintento no lo repite). */
export const motivoAjusteConsumos = (habitacion: string, folios: string[]) => `Consumos de ${habitacion} · Comandas ${lista(folios)}`;

/**
 * Comentario con el valor total del checkout: evita sumar a mano las comandas dispersas. Si entre lo cobrado hay alojamiento
 * (`alojamiento` = su valor), avisa de revisar el excedente: ese hospedaje ya está en el valor de la reserva y se duplicaría.
 */
export const textoTotalCheckout = (habitacion: string, folios: string[], total: number, alojamiento = 0) =>
  `${MARCA_CHECKOUT} $${total.toFixed(2)} · ${habitacion} · Comandas ${lista(folios)}`
  + (alojamiento > 0.005 ? ` · Revisar excedente: incluye alojamiento por $${alojamiento.toFixed(2)}, ya cobrado en el valor de la reserva` : '');

/** ¿El nombre de un producto es de alojamiento/hospedaje? (sin tildes ni mayúsculas) */
export const esProductoAlojamiento = (nombre: string) =>
  /^(aloj|hosped)/.test(nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase());

type VentaLike = { origen: string; movimientos?: Array<{ tipo: string; anulado?: boolean; motivo?: string }> };

/** ¿Esta venta de reserva de hotel ya recibió consumos de habitación en un checkout? */
export const tieneConsumosHabitacion = (v: VentaLike) =>
  v.origen === 'reserva_hotel' && (v.movimientos ?? []).some((m) => m.tipo === 'comentario' && !m.anulado && !!m.motivo?.startsWith(MARCA_CHECKOUT));

/** Orígenes de una venta: el propio y, si cobra consumos de habitación, también «habitacion». */
export const origenesDeVenta = <T extends VentaLike>(v: T): string[] => (tieneConsumosHabitacion(v) ? [v.origen, 'habitacion'] : [v.origen]);
