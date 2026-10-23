import type { OfertaCabana, TarjetaCalendario } from './cloudbeds';
import { claveEnlace, type HabitacionHotel } from './hotelHabitacionesApi';
import type { ReservaHotel } from './hotelReservasApi';

/**
 * Convierte las ofertas de Cloudbeds (una por TIPO de habitación) en ofertas por UNIDAD para los tipos que el POS maneja con
 * varias unidades (Matrimonial #2, #4, #5…): una oferta por unidad, con la clave «tipo|unidad» en `roomTypeID`. Los tipos de
 * una sola habitación quedan igual. `ocupadas`: unidades ocupadas o bloqueadas según el calendario (null = sin datos: se asumen
 * libres y el Worker comprueba la disponibilidad real al crear).
 */
export function expandirOfertasPorUnidad(ofertas: OfertaCabana[], habitaciones: HabitacionHotel[], ocupadas: Set<string> | null): OfertaCabana[] {
  return ofertas.flatMap((o) => {
    const unidades = habitaciones.filter((h) => h.activo && h.cloudbeds_room_type_id === o.roomTypeID && h.cloudbeds_room_id);
    if (unidades.length === 0) return [o];
    return unidades.map((h) => {
      const clave = claveEnlace(o.roomTypeID, h.cloudbeds_room_id);
      const libre = o.reservable && !ocupadas?.has(clave);
      return {
        ...o,
        roomTypeID: clave,
        roomTypeName: h.nombre,
        roomsAvailable: libre ? 1 : 0,
        reservable: libre,
        motivo: o.reservable && !libre ? 'Sin disponibilidad' : o.motivo,
        capacidad: h.capacidad ?? o.capacidad,
      };
    });
  });
}

/**
 * Busca la reserva del POS que corresponde a una tarjeta de Cloudbeds: por código de Cloudbeds, por el id del POS (reservas
 * creadas aquí) o, en un grupo adoptado de Cloudbeds (una reserva con varias habitaciones), por código de grupo + tipo + unidad.
 * Los grupos adoptados antes de guardar la unidad (sin `room_id`) se reconocen solo por tipo.
 */
export function buscadorDeReservaLocal(reservas: ReservaHotel[]): (t: Pick<TarjetaCalendario, 'id' | 'roomTypeID' | 'roomID' | 'externo'>) => ReservaHotel | undefined {
  const porId = new Map(reservas.map((r) => [r.id, r]));
  const porCb = new Map(reservas.filter((r) => r.cloudbeds_reservation_id).map((r) => [r.cloudbeds_reservation_id as string, r]));
  const porGrupo = new Map(reservas.filter((r) => r.cloudbeds_grupo_ref).map((r) => [`${r.cloudbeds_grupo_ref}:${r.room_type_id}:${r.room_id ?? ''}`, r]));
  return (t) => porCb.get(t.id) ?? porGrupo.get(`${t.id}:${t.roomTypeID}:${t.roomID ?? ''}`) ?? porGrupo.get(`${t.id}:${t.roomTypeID}:`) ?? (t.externo ? porId.get(t.externo) : undefined);
}
