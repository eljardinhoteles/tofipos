import dayjs from 'dayjs';
import { bloques, mesDe, tarjetasDeMeses } from './hotelCalendarioCache';
import type { ReservaHotel } from './hotelReservasApi';

/**
 * Detecta reservas del POS que ya no coinciden con Cloudbeds (se cancelaron o cambiaron allá). No hace ninguna consulta
 * nueva: compara con las tarjetas que el calendario y «Hoy» ya cargaron, enlazadas por `thirdPartyIdentifier`.
 *
 * El enlace es el código de la reserva de Cloudbeds; el identificador externo (`thirdPartyIdentifier`) es el respaldo.
 *
 * Para no dar falsas alarmas solo se juzga una reserva cuando TODOS los meses que toca están en la caché, se pidieron
 * después de la última acción hecha desde el POS (`version`) y después de crearse la reserva, y tienen pocos minutos.
 * Si falta cualquier dato fiable, no se dice nada.
 */
const MAX_EDAD_MS = 10 * 60_000;
const MARGEN_CREACION_MS = 90_000;

export interface Divergencia {
  id: string;
  tipo: 'cancelada' | 'cambiada';
  /** Texto corto para mostrar. */
  resumen: string;
  llegada?: string;
  salida?: string;
  room_type_id?: string;
  room_id?: string;
}

function mesesQueToca(r: ReservaHotel): string[] {
  const meses = new Set<string>();
  for (let d = dayjs(r.llegada); d.isBefore(dayjs(r.salida)); d = d.add(1, 'day')) meses.add(mesDe(d.format('YYYY-MM-DD')));
  return [...meses];
}

export function detectarDivergencias(reservas: ReservaHotel[], version: number): Map<string, Divergencia> {
  const out = new Map<string, Divergencia>();
  const hoy = dayjs().format('YYYY-MM-DD');
  const ahora = Date.now();
  for (const r of reservas) {
    if (r.estado !== 'confirmada' || r.sync_estado !== 'sincronizada' || !r.cloudbeds_reservation_id || r.salida < hoy) continue;
    const meses = mesesQueToca(r);
    const creada = Date.parse(r.created_at);
    const fiable = meses.every((m) => {
      const b = bloques.get(m);
      return !!b && b.version === version && ahora - b.actualizado < MAX_EDAD_MS && b.actualizado > creada + MARGEN_CREACION_MS;
    });
    if (!fiable) continue;

    const t = tarjetasDeMeses(meses).find((x) => x.tipo === 'reserva' && (x.id === r.cloudbeds_reservation_id || x.externo === r.id));
    if (!t) {
      out.set(r.id, { id: r.id, tipo: 'cancelada', resumen: 'Ya no está vigente en Cloudbeds (se canceló o se eliminó)' });
      continue;
    }
    const fechas = t.desde !== r.llegada || t.hasta !== r.salida;
    // Otra habitación: otro tipo, o —si la reserva ya tenía unidad— otra unidad del mismo tipo.
    const cabana = t.roomTypeID !== r.room_type_id || (r.room_id != null && t.roomID != null && t.roomID !== r.room_id);
    if (fechas || cabana) {
      const partes = [
        fechas ? `fechas ${dayjs(t.desde).format('DD/MM')} → ${dayjs(t.hasta).format('DD/MM')}` : null,
        cabana ? 'otra habitación' : null,
      ].filter(Boolean);
      out.set(r.id, { id: r.id, tipo: 'cambiada', resumen: `En Cloudbeds cambió: ${partes.join(' y ')}`, llegada: t.desde, salida: t.hasta, room_type_id: t.roomTypeID, room_id: t.roomID ?? undefined });
    }
  }
  return out;
}
