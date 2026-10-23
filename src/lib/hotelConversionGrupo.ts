import dayjs from 'dayjs';
import type { ReservaCloudbedsDetalle } from './cloudbeds';
import { coincideUnidad, type HabitacionHotel } from './hotelHabitacionesApi';

/**
 * Comprobaciones previas para CONVERTIR un grupo de Cloudbeds (una reserva con varias habitaciones) en reservas individuales:
 * cancelarlo en Cloudbeds y crear una reserva por habitación desde el POS. Aquí solo se evalúa si se puede; no se cambia nada.
 * `bloqueos`: impiden la conversión. `avisos`: cosas que cambian o se pierden y conviene saber antes de decidir.
 */
export interface EvaluacionConversion {
  convertible: boolean;
  bloqueos: string[];
  avisos: string[];
}

export function evaluarConversionGrupo(det: ReservaCloudbedsDetalle, habitaciones: HabitacionHotel[]): EvaluacionConversion {
  const bloqueos: string[] = [];
  const avisos: string[] = [];

  if (det.estado === 'canceled' || det.estado === 'no_show') bloqueos.push('La reserva ya está cancelada en Cloudbeds.');
  if (det.estado === 'checked_in' || det.estado === 'checked_out') bloqueos.push('El grupo ya hizo el check-in: no se puede cancelar y recrear.');
  if (det.fuenteExterna) bloqueos.push(`Viene de un canal externo${det.fuente ? ` (${det.fuente})` : ''}: cancelarla allá tiene comisiones y penalidades del canal.`);
  if (det.llegada < dayjs().format('YYYY-MM-DD')) bloqueos.push('La llegada ya pasó: Cloudbeds no permite crear reservas con fecha pasada.');
  const sinCabana = det.habitaciones.filter((h) => !habitaciones.some((x) => x.activo && coincideUnidad(x, h.roomTypeID, h.roomID)));
  if (sinCabana.length > 0) bloqueos.push(`Sin habitación enlazada en el POS: ${[...new Set(sinCabana.map((h) => h.nombre || h.roomTypeID))].join(', ')}. Enlázala en Habitaciones.`);

  const pagado = det.desglose?.pagado ?? 0;
  if (pagado > 0.005) avisos.push(`Cloudbeds tiene $${pagado.toFixed(2)} pagados en esta reserva. Al cancelarla quedan en la reserva cancelada: migra esos pagos al Centro de Ventas antes de convertir.`);
  avisos.push('Cloudbeds crea cada habitación con su tarifa estándar; el precio real queda como tarifa manual del POS, así que el total en Cloudbeds puede diferir.');
  avisos.push('Se usará el plan de tarifa por defecto de cada habitación (el plan original no se lee).');
  avisos.push('Las notas de la reserva original en Cloudbeds no se copian.');
  avisos.push('La reserva nueva queda con el origen del POS, no con el canal actual.');
  avisos.push('Al cancelar, Cloudbeds puede enviar un aviso de cancelación al huésped si tienes esa automatización activa.');
  return { convertible: bloqueos.length === 0, bloqueos, avisos };
}
