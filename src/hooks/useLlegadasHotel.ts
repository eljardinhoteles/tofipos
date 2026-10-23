import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { listarReservasHotel, type ReservaHotel } from '../lib/hotelReservasApi';
import { listarHabitaciones, type HabitacionHotel } from '../lib/hotelHabitacionesApi';
import { useHotelEnVivo } from './useHotelEnVivo';

// Las que llegaron hace más de esto y siguen sin cuenta ya no se listan (se ven en el módulo Hotel).
export const DIAS_ATRASO_MAX = 3;
const REFRESCO_MS = 90_000;

/**
 * Reservas del módulo Hotel que llegan desde hace `DIAS_ATRASO_MAX` días hasta mañana (vigentes, una por habitación), para las
 * «Llegadas» de Mesas. Se leen de Supabase: se recargan al abrir, cada 90 s, al volver la conexión y cuando Realtime avisa de un cambio.
 * Si una carga falla (sin red) se conserva lo último que se leyó.
 */
export function useLlegadasHotel(): { reservas: ReservaHotel[]; habitaciones: HabitacionHotel[]; recargar: () => void } {
  const [reservas, setReservas] = useState<ReservaHotel[]>([]);
  // Las habitaciones del Hotel dicen qué habitación de Mesas tiene asignada cada reserva (enlace opcional).
  const [habitaciones, setHabitaciones] = useState<HabitacionHotel[]>([]);

  const cargar = useCallback(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const desde = dayjs().subtract(DIAS_ATRASO_MAX, 'day').format('YYYY-MM-DD');
    const manana = dayjs().add(1, 'day').format('YYYY-MM-DD');
    listarReservasHotel(desde, manana)
      .then((lista) => setReservas(lista.filter((r) => r.estado === 'confirmada' && r.llegada >= desde && r.llegada <= manana)))
      .catch(() => { /* se conserva lo último leído */ });
    listarHabitaciones().then(setHabitaciones).catch(() => { /* sin habitaciones no hay sugerencia, solo eso */ });
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar(); }, REFRESCO_MS);
    window.addEventListener('online', cargar);
    return () => { clearInterval(t); window.removeEventListener('online', cargar); };
  }, [cargar]);

  useHotelEnVivo(cargar);
  return { reservas, habitaciones, recargar: cargar };
}
