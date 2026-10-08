import { type Reserva } from '../../db/database';

export const toISO = (d: Date) => {
  const local = new Date(d);
  local.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return local.toISOString().split('T')[0];
};

export const STATUS_LABEL: Record<Reserva['estado'], string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Completada',
};

export const isToday = (d: Date) => d.toDateString() === new Date().toDateString();

export const isWeekend = (d: Date) => {
  const day = d.getDay();
  return day === 0 || day === 6;
};

// Código corto estable de cada reserva ("R12"): orden de creación.
export const codigosReserva = (reservas: Reserva[]) => {
  const map: Record<string, string> = {};
  [...reservas]
    .sort((a, b) => (a.created_at !== b.created_at ? a.created_at.localeCompare(b.created_at) : a.id.localeCompare(b.id)))
    .forEach((r, i) => { map[r.id] = `R${i + 1}`; });
  return map;
};
