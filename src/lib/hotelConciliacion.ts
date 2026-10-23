import dayjs from 'dayjs';
import type { RxCliente } from '../db/rxdb';
import type { VentaConMovimientos } from './ventaConMovimientos';
import type { ReservaCloudbedsDetalle } from './cloudbeds';
import type { ReservaHotel } from './hotelReservasApi';

/**
 * Conciliación de una reserva de Cloudbeds (al adoptarla) con el Centro de Ventas y con la ficha del cliente. Aquí solo
 * hay lógica pura: sugerir candidatos y comparar datos. Nunca decide sola: la persona elige 1 a 1 en el asistente.
 */

/** Minúsculas, sin tildes ni signos: «José Pérez-Ruiz» → «jose perez ruiz». */
export const normalizarTexto = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim();

/** Los últimos 8 dígitos: el mismo número con o sin prefijo de país (+593 / 0) coincide. */
export const digitosTelefono = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-8);

const palabras = (s: string) => new Set(normalizarTexto(s).split(' ').filter((p) => p.length >= 3));

/** Cuántas palabras de un nombre aparecen en el otro (0 a 1). «Miguel Tite» vs «MIGUEL ANGEL TITE» = 1. */
export function parecidoNombre(a: string, b: string): number {
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.size === 0 || pb.size === 0) return 0;
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes += 1;
  return comunes / Math.min(pa.size, pb.size);
}

export const nombreCompleto = (det: ReservaCloudbedsDetalle) => `${det.huesped.nombre} ${det.huesped.apellido}`.trim();

export interface CandidatoVenta {
  item: VentaConMovimientos;
  puntos: number;
  motivos: string[];
  /** Otras reservas del POS ya conciliadas con esta venta (una venta puede cubrir varias habitaciones). */
  yaEnlazadaCon: number;
}

const DIAS_TOLERANCIA = 2;

/**
 * Ventas `reserva_hotel` que podrían ser esta reserva: fechas iguales o cercanas y nombre parecido. Se excluyen las
 * anuladas. Ordenadas de más a menos probable; solo las que tienen alguna coincidencia.
 */
export function candidatosVenta(
  det: ReservaCloudbedsDetalle,
  items: VentaConMovimientos[],
  clientes: RxCliente[],
  enlazadas: Map<string, number>,
  max = 6,
): CandidatoVenta[] {
  const nombre = nombreCompleto(det);
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const out: CandidatoVenta[] = [];
  for (const item of items) {
    const v = item.venta;
    if (v.origen !== 'reserva_hotel' || item.anulado) continue;
    const motivos: string[] = [];
    let puntos = 0;

    if (v.llegada) {
      const dif = Math.abs(dayjs(v.llegada).diff(dayjs(det.llegada), 'day'));
      if (dif === 0 && v.salida === det.salida) { puntos += 4; motivos.push('Mismas fechas'); }
      else if (dif === 0) { puntos += 3; motivos.push('Misma llegada'); }
      else if (dif <= DIAS_TOLERANCIA) { puntos += 1.5; motivos.push(`Llegada a ${dif} ${dif === 1 ? 'día' : 'días'}`); }
    }

    const cliente = v.cliente_id ? porId.get(v.cliente_id) : undefined;
    const nombreVenta = [v.cliente_nombre, cliente?.nombre, v.referencia].filter(Boolean).join(' ');
    const parecido = parecidoNombre(nombre, nombreVenta);
    if (parecido >= 0.99) { puntos += 3; motivos.push('Mismo nombre'); }
    else if (parecido >= 0.5) { puntos += 1.5; motivos.push('Nombre parecido'); }

    const email = normalizarTexto(det.huesped.email);
    if (email && cliente?.email && normalizarTexto(cliente.email) === email) { puntos += 2; motivos.push('Mismo correo'); }

    // Sin fechas cercanas ni nombre parecido no se sugiere (evita listas largas de ventas sin relación).
    if (puntos < 1.5) continue;
    out.push({ item, puntos, motivos, yaEnlazadaCon: enlazadas.get(v.id) ?? 0 });
  }
  return out.sort((a, b) => b.puntos - a.puntos).slice(0, max);
}

export interface CandidatoCliente {
  cliente: RxCliente;
  puntos: number;
  motivos: string[];
}

/** Clientes del POS que podrían ser este huésped, por correo, teléfono y nombre. */
export function candidatosCliente(det: ReservaCloudbedsDetalle, clientes: RxCliente[], max = 5): CandidatoCliente[] {
  const email = normalizarTexto(det.huesped.email);
  const tel = digitosTelefono(det.huesped.telefono);
  const nombre = nombreCompleto(det);
  const out: CandidatoCliente[] = [];
  for (const c of clientes) {
    const motivos: string[] = [];
    let puntos = 0;
    if (email && c.email && normalizarTexto(c.email) === email) { puntos += 5; motivos.push('Mismo correo'); }
    if (tel.length >= 7 && digitosTelefono(c.telefono) === tel) { puntos += 4; motivos.push('Mismo teléfono'); }
    const parecido = parecidoNombre(nombre, c.nombre);
    if (parecido >= 0.99) { puntos += 3; motivos.push('Mismo nombre'); }
    else if (parecido >= 0.5) { puntos += 1.5; motivos.push('Nombre parecido'); }
    if (puntos < 1.5) continue;
    out.push({ cliente: c, puntos, motivos });
  }
  return out.sort((a, b) => b.puntos - a.puntos).slice(0, max);
}

/** Campos del huésped que se comparan entre Cloudbeds y la ficha del cliente del POS. */
export type CampoCliente = 'nombre' | 'email' | 'telefono';

export const ETIQUETA_CAMPO: Record<CampoCliente, string> = { nombre: 'Nombre', email: 'Correo', telefono: 'Teléfono' };

export function valoresCloudbeds(det: ReservaCloudbedsDetalle): Record<CampoCliente, string> {
  return { nombre: nombreCompleto(det), email: det.huesped.email.trim(), telefono: det.huesped.telefono.trim() };
}

/** Campos que difieren (ignorando mayúsculas, tildes y el formato del teléfono). Si un lado está vacío, no es conflicto. */
export function diferencias(det: ReservaCloudbedsDetalle, c: RxCliente): CampoCliente[] {
  const cb = valoresCloudbeds(det);
  const pos: Record<CampoCliente, string> = { nombre: c.nombre ?? '', email: c.email ?? '', telefono: c.telefono ?? '' };
  return (Object.keys(cb) as CampoCliente[]).filter((k) => {
    if (!cb[k] || !pos[k]) return false;
    return k === 'telefono' ? digitosTelefono(cb[k]) !== digitosTelefono(pos[k]) : normalizarTexto(cb[k]) !== normalizarTexto(pos[k]);
  });
}

/** Una reserva que ya está en el POS, en la forma que usan los candidatos (para conciliarla después de adoptarla). */
export function detDeReserva(r: ReservaHotel): ReservaCloudbedsDetalle {
  return {
    reservationID: r.cloudbeds_reservation_id ?? r.id,
    estado: 'confirmed',
    llegada: r.llegada,
    salida: r.salida,
    total: r.total_estadia, // la tarifa que manda en el POS (manual o la de Cloudbeds)
    saldo: null,
    fuente: r.fuente_nombre,
    fuenteExterna: r.fuente_externa,
    habitaciones: [{ roomTypeID: r.room_type_id, roomID: r.room_id, nombreUnidad: r.cabana, nombre: r.cabana, adultos: r.adultos, ninos: r.ninos }],
    huesped: { nombre: r.huesped_nombre, apellido: r.huesped_apellido, email: r.huesped_email, telefono: r.huesped_telefono ?? '', pais: r.huesped_pais },
  };
}

/** «Juan Carlos Pérez» → nombre «Juan», apellido «Carlos Pérez» (Cloudbeds pide nombre y apellido por separado). */
export function partirNombre(completo: string): { nombre: string; apellido: string } {
  const [primero, ...resto] = completo.trim().split(/\s+/);
  return { nombre: primero ?? '', apellido: resto.join(' ') };
}
