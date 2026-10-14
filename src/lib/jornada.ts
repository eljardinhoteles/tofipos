import dayjs, { type Dayjs } from 'dayjs';

// Jornada de caja: el "día" del restaurante no termina a la medianoche sino a la hora de corte. Un cobro a la 1:00
// a. m. (evento largo) pertenece a la jornada que empezó la tarde anterior, y ese turno se puede cerrar pasada la
// medianoche. A las 5:00 a. m. empieza la jornada siguiente.
export const HORA_CORTE_JORNADA = 5;

/** Jornada (día de caja, a las 00:00) a la que pertenece un instante. */
export function jornadaDe(fecha: Dayjs | Date | string | number = new Date()): Dayjs {
  return dayjs(fecha).subtract(HORA_CORTE_JORNADA, 'hour').startOf('day');
}

/** Instante en que empezó la jornada que está en curso. */
export function inicioJornadaActual(): Dayjs {
  return jornadaDe().add(HORA_CORTE_JORNADA, 'hour');
}

/** ¿El instante cae dentro de la jornada `dia` (cualquier hora de ese día calendario sirve para nombrarla)? */
export function esDeJornada(fecha: Dayjs | Date | string | number, dia: Dayjs): boolean {
  return jornadaDe(fecha).isSame(dia, 'day');
}
