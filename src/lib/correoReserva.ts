import dayjs from 'dayjs';
import { supabase } from './supabase';
import { initVerticalRxDb } from '../db/rxdb';
import { getOrgCache } from './orgCache';
import { documentoCliente } from './documentoCliente';
import { habitacionDeUnidad, listarHabitaciones } from './hotelHabitacionesApi';
import { incluyePorPersona, planSeCobra } from './hotelPlanesApi';
import type { EventoHistorial } from './hotelReservasApi';
import { leerReservaHotel, registrarEventoHotel, textoMascota, totalConExtras, type ReservaHotel } from './hotelReservasApi';
import { calcularVenta } from './ventaConMovimientos';
import type { RxVenta } from '../db/rxdb';

// Correo al huésped (Resend, vía la Edge Function `enviar-correo-reserva`). Lleva la misma información que la hoja de
// reserva (imprimirReservaA4) sin la parte de cobros. El POS arma los datos; la función pone el destinatario desde la
// base (nunca desde aquí) y dibuja el correo.

export interface DocCorreoReserva {
  org: { nombre: string; ruc: string; telefono: string; direccion: string };
  codigo: string | null;
  canal: string | null;
  huesped: { nombre: string; documento: string | null; email: string; telefono: string; pais: string; direccion: string };
  llegada: string;
  salida: string;
  noches: number;
  cabanas: Array<{ nombre: string; cama: string | null; adultos: number; ninos: number; tarifa: number; vista: string | null }>;
  extras: Array<{ descripcion: string; monto: number; notas: string[] }>;
  total: number;
  /** Lo cobrado en las ventas enlazadas (el Centro de Ventas es la fuente); el detalle de pagos no va en el correo. */
  cobros: { pagado: number; saldo: number };
  notas: string | null;
  notasGenerales: string[];
  mascotas: string[];
  plan: { nombre: string; adultos: number; ninos: number; incluyeAdulto: string; incluyeNino: string; incluido: boolean } | null;
}

const fechaLarga = (f: string) => dayjs(f).format('ddd D MMM YYYY');

/** Pagado y saldo de las reservas, sumando una sola vez cada venta compartida y sin contar las anuladas. */
async function cobrosDe(filas: ReservaHotel[], total: number): Promise<{ pagado: number; saldo: number }> {
  let pagado = 0;
  try {
    const db = await initVerticalRxDb();
    for (const id of new Set(filas.map((f) => f.venta_id).filter((x): x is string => !!x))) {
      const doc = await db.ventas.findOne(id).exec();
      if (!doc) continue;
      const v = calcularVenta(doc.toJSON() as RxVenta);
      if (!v.anulado) pagado += v.totalPagado;
    }
  } catch { /* sin ventas en este dispositivo: se asume sin pagos */ }
  return { pagado, saldo: Math.max(0, total - pagado) };
}

const ETIQUETA_CORREO = { confirmacion: 'Correo de confirmación', cancelacion: 'Correo de cancelación' } as const;

/** true si el historial ya registra el envío de ese correo (para ofrecer «Reenviar»). */
export const correoYaEnviado = (historial: EventoHistorial[] | undefined, tipo: 'confirmacion' | 'cancelacion') =>
  (historial ?? []).some((e) => e.tipo === 'correo' && e.texto.startsWith(ETIQUETA_CORREO[tipo]));

async function armarDoc(filas: ReservaHotel[]): Promise<DocCorreoReserva> {
  const r = filas[0];
  const org = getOrgCache();
  const habitaciones = await listarHabitaciones().catch(() => []);
  let documento: string | null = null;
  let direccion = '';
  if (r.cliente_id) {
    try {
      const db = await initVerticalRxDb();
      const c = await db.clientes.findOne(r.cliente_id).exec();
      if (c) { documento = documentoCliente(c.toJSON()); direccion = c.direccion ?? ''; }
    } catch { /* sin ficha: el correo sale sin documento */ }
  }
  const unidad = (f: ReservaHotel) => habitacionDeUnidad(habitaciones, f.room_type_id, f.room_id);
  const varias = filas.length > 1;
  const total = filas.reduce((a, f) => a + totalConExtras(f), 0);
  return {
    org: { nombre: org.nombre ?? '', ruc: org.ruc ?? '', telefono: org.telefono ?? '', direccion: org.direccion ?? '' },
    codigo: r.cloudbeds_reservation_id,
    canal: r.fuente_nombre,
    huesped: { nombre: `${r.huesped_nombre} ${r.huesped_apellido}`.trim(), documento, email: r.huesped_email, telefono: r.huesped_telefono ?? '', pais: r.huesped_pais, direccion },
    llegada: fechaLarga(r.llegada),
    salida: fechaLarga(r.salida),
    noches: Math.max(1, dayjs(r.salida).diff(dayjs(r.llegada), 'day')),
    cabanas: filas.map((f) => ({ nombre: unidad(f)?.nombre ?? f.cabana, cama: f.cama, adultos: f.adultos, ninos: f.ninos, tarifa: f.total_estadia, vista: unidad(f)?.vista ?? null })),
    extras: filas.flatMap((f) => f.extras.filter((e) => e.monto > 0).map((e) => ({
      descripcion: varias ? `${e.descripcion} (${f.cabana})` : e.descripcion,
      monto: e.monto,
      notas: f.notas_items.filter((n) => n.extra_id === e.id).map((n) => n.texto),
    }))),
    total,
    cobros: await cobrosDe(filas, total),
    notas: r.notas,
    notasGenerales: [
      ...new Set(filas.flatMap((f) => f.notas_items.filter((n) => n.grupo && !n.extra_id).map((n) => n.texto))),
      ...filas.flatMap((f) => f.notas_items.filter((n) => !n.grupo && (!n.extra_id || !f.extras.some((e) => e.id === n.extra_id))).map((n) => (varias ? `${n.texto} (${f.cabana})` : n.texto))),
    ],
    mascotas: filas.filter((f) => f.mascota).map((f) => (varias ? `${textoMascota(f.mascota!)} (${f.cabana})` : textoMascota(f.mascota!))),
    plan: r.plan_alimentacion ? {
      nombre: r.plan_alimentacion.nombre,
      adultos: filas.reduce((a, f) => a + f.adultos, 0),
      ninos: filas.reduce((a, f) => a + f.ninos, 0),
      incluyeAdulto: incluyePorPersona(r.plan_alimentacion).adulto,
      incluyeNino: incluyePorPersona(r.plan_alimentacion).nino,
      incluido: !planSeCobra(r.plan_alimentacion),
    } : null,
  };
}

/**
 * Envía el correo de confirmación o cancelación de una reserva (o de todas las de un grupo). Nunca lanza: la reserva ya
 * está hecha y, si falla, solo se avisa en la consola y se devuelve el motivo para quien lo pidió a mano.
 */
export async function avisarPorCorreo(tipo: 'confirmacion' | 'cancelacion', filas: ReservaHotel[], usuario?: string): Promise<{ enviado: boolean; motivo?: string }> {
  try {
    if (filas.length === 0) return { enviado: false, motivo: 'sin reservas' };
    // Datos frescos: extras, plan y venta pueden haberse añadido después de crear la reserva.
    const frescas = await Promise.all(filas.map((f) => leerReservaHotel(f.id).then((x) => x ?? f).catch(() => f)));
    const doc = await armarDoc(frescas);
    const { data, error } = await supabase.functions.invoke('enviar-correo-reserva', { body: { tipo, reserva_ids: filas.map((f) => f.id), doc } });
    if (error) {
      // En un 4xx/5xx la respuesta real viene en `error.context`.
      const ctx = (error as { context?: Response }).context;
      const cuerpo = ctx ? await ctx.json().catch(() => null) : null;
      throw new Error(cuerpo?.error ?? error.message);
    }
    const enviado = data?.enviado === true;
    // Constancia en el historial de cada reserva incluida (no falla: registrarEventoHotel nunca lanza).
    if (enviado) for (const f of frescas) await registrarEventoHotel(f.id, 'correo', `${ETIQUETA_CORREO[tipo]} enviado a ${f.huesped_email}`, usuario);
    return { enviado, motivo: data?.motivo };
  } catch (e) {
    console.warn('No se pudo enviar el correo de la reserva', e);
    return { enviado: false, motivo: e instanceof Error ? e.message : 'Error desconocido' };
  }
}
