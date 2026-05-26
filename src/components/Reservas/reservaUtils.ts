import { type Reserva } from '../../db/database';

export const toISO = (d: Date) => {
  const local = new Date(d);
  local.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return local.toISOString().split('T')[0];
};

export const STATUS_HEX: Record<Reserva['estado'], string> = {
  pendiente: '#f59e0b',
  confirmada: '#22c55e',
  cancelada: '#ef4444',
  completada: '#9ca3af',
};

export const STATUS_COLOR: Record<Reserva['estado'], string> = {
  pendiente: 'yellow',
  confirmada: 'green',
  cancelada: 'red',
  completada: 'gray',
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
