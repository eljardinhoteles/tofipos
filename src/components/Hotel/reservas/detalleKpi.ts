import dayjs from 'dayjs';
import { totalConExtras } from '../../../lib/hotelReservasApi';
import type { Fila, Vista } from './modelo';

const dinero = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const noches = (filas: Fila[]) => filas.reduce((a, f) => a + Math.max(0, dayjs(f.salida).diff(dayjs(f.llegada), 'day')), 0);
// Los ingresos salen de las reservas del POS (total de la estadía con extras); una reserva de Cloudbeds sin enlazar no trae su total.
const ingresos = (filas: Fila[]) => filas.reduce((a, f) => a + (f.r ? totalConExtras(f.r) : 0), 0);
const habitaciones = (filas: Fila[]) => new Set(filas.map((f) => `${f.roomTypeID}|${f.roomID ?? ''}`)).size;

/**
 * Detalle de cada tarjeta de actividad. La tarjeta cuenta RESERVAS; su línea muestra las personas (adultos y niños, sin el que sea 0)
 * y el tooltip (`titulo`) el resto: habitaciones y, según la vista, noches e ingresos.
 */
export interface DetalleKpi { adultos: number; ninos: number; titulo: string }

export function detalleKpi(vista: Vista, filas: Fila[]): DetalleKpi {
  if (filas.length === 0 || vista === 'todas') return { adultos: 0, ninos: 0, titulo: '' };
  const a = filas.reduce((x, f) => x + f.adultos, 0);
  const n = filas.reduce((x, f) => x + f.ninos, 0);
  const p = a + n;
  const hab = habitaciones(filas);
  const base = `${plural(p, 'huésped', 'huéspedes')} (${plural(a, 'adulto', 'adultos')}, ${plural(n, 'niño', 'niños')}) · ${plural(hab, 'habitación', 'habitaciones')}`;
  switch (vista) {
    case 'nuevas': return { adultos: a, ninos: n, titulo: `${base} · Noches de estancia: ${noches(filas)} · Ingresos: ${dinero(ingresos(filas))}` };
    case 'canceladas': return { adultos: a, ninos: n, titulo: `${base} · Noches de estancia perdidas: ${noches(filas)} · Ingresos perdidos: ${dinero(ingresos(filas))}` };
    default: return { adultos: a, ninos: n, titulo: base };
  }
}
