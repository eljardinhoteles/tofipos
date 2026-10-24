import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { listarReservasHotel, type ReservaHotel } from '../lib/hotelReservasApi';
import { listarHabitaciones, type HabitacionHotel } from '../lib/hotelHabitacionesApi';
import { useHotelEnVivo } from './useHotelEnVivo';

// Las que llegaron hace más de esto y siguen sin cuenta ya no se listan (se ven en el módulo Hotel).
export const DIAS_ATRASO_MAX = 3;
const REFRESCO_MS = 90_000;

// Lo último leído, por organización: al volver a Mesas (o de otra pantalla) la fila arranca con eso y se actualiza por detrás, sin vaciarse.
let ultimasReservas: { org: string; lista: ReservaHotel[] } | null = null;
let ultimasHabitaciones: { org: string; lista: HabitacionHotel[] } | null = null;
const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';

/**
 * Reservas del módulo Hotel que llegan desde hace `DIAS_ATRASO_MAX` días hasta mañana (vigentes, una por habitación), para las
 * «Llegadas» de Mesas. Se leen de Supabase: se recargan al abrir, cada 90 s, al volver la conexión y cuando Realtime avisa de un cambio.
 * Si una carga falla (sin red) se conserva lo último que se leyó.
 */
export function useLlegadasHotel(): { reservas: ReservaHotel[]; habitaciones: HabitacionHotel[]; recargar: () => void; cargado: boolean } {
  // Falso hasta que termina la primera lectura (con éxito o no): mientras tanto Mesas reserva el espacio de la fila para que no «salte».
  const [cargado, setCargado] = useState(ultimasReservas?.org === orgActiva());
  const [reservas, setReservas] = useState<ReservaHotel[]>(() => (ultimasReservas?.org === orgActiva() ? ultimasReservas.lista : []));
  // Las habitaciones del Hotel dicen qué habitación de Mesas tiene asignada cada reserva (enlace opcional).
  const [habitaciones, setHabitaciones] = useState<HabitacionHotel[]>(() => (ultimasHabitaciones?.org === orgActiva() ? ultimasHabitaciones.lista : []));

  const cargar = useCallback(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setCargado(true); return; }
    const desde = dayjs().subtract(DIAS_ATRASO_MAX, 'day').format('YYYY-MM-DD');
    const manana = dayjs().add(1, 'day').format('YYYY-MM-DD');
    listarReservasHotel(desde, manana)
      .then((lista) => {
        const vigentes = lista.filter((r) => r.estado === 'confirmada' && r.llegada >= desde && r.llegada <= manana);
        setReservas(vigentes);
        ultimasReservas = { org: orgActiva(), lista: vigentes };
      })
      .catch(() => { /* se conserva lo último leído */ })
      .finally(() => setCargado(true));
    listarHabitaciones().then((hs) => { setHabitaciones(hs); ultimasHabitaciones = { org: orgActiva(), lista: hs }; }).catch(() => { /* sin habitaciones no hay sugerencia, solo eso */ });
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar(); }, REFRESCO_MS);
    window.addEventListener('online', cargar);
    return () => { clearInterval(t); window.removeEventListener('online', cargar); };
  }, [cargar]);

  useHotelEnVivo(cargar);
  return { reservas, habitaciones, recargar: cargar, cargado };
}
