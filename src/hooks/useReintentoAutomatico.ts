import { useCallback, useEffect, useRef } from 'react';
import { showToast } from '@/lib/toast';
import { reintentarPendientes, type ReservaHotel } from '../lib/hotelReservasApi';

const ESPERA_ENTRE_INTENTOS_MS = 45_000;
const CADA_MS = 60_000;

/**
 * Reintenta solas las reservas que quedaron guardadas en el POS pero sin subir a Cloudbeds: mientras no suban, el
 * calendario de Cloudbeds sigue libre y esa habitación se podría vender por otro canal. Se intenta al abrir la página, cada
 * minuto y al volver la conexión. Nunca corren dos reintentos a la vez, y una misma reserva no se reintenta más de una
 * vez cada 45 s. El Worker comprueba que no exista ya en Cloudbeds antes de crearla, así que no duplica.
 */
export function useReintentoAutomatico(reservas: ReservaHotel[], onCambio: () => void) {
  const enCurso = useRef(false);
  const ultimoIntento = useRef(new Map<string, number>());
  const ultimas = useRef(reservas);
  useEffect(() => { ultimas.current = reservas; }, [reservas]);

  const correr = useCallback(async () => {
    if (enCurso.current || !navigator.onLine) return;
    const ahora = Date.now();
    const pendientes = ultimas.current.filter(
      (r) => r.estado === 'confirmada' && r.sync_estado === 'pendiente' && !r.cloudbeds_reservation_id
        && ahora - (ultimoIntento.current.get(r.id) ?? 0) > ESPERA_ENTRE_INTENTOS_MS,
    );
    if (pendientes.length === 0) return;
    enCurso.current = true;
    try {
      pendientes.forEach((r) => ultimoIntento.current.set(r.id, ahora));
      const res = await reintentarPendientes(pendientes);
      if (res.sincronizadas > 0) showToast.success(res.sincronizadas === 1 ? 'Una reserva pendiente ya está en Cloudbeds' : `${res.sincronizadas} reservas pendientes ya están en Cloudbeds`);
      if (res.rechazadas > 0) showToast.error(res.rechazadas === 1 ? 'Cloudbeds rechazó una reserva pendiente' : `Cloudbeds rechazó ${res.rechazadas} reservas pendientes`, 'Quedan en «Canceladas».');
      if (res.sincronizadas > 0 || res.rechazadas > 0) onCambio();
    } catch {
      // Sin red u otro fallo: se vuelve a intentar en el siguiente ciclo.
    } finally {
      enCurso.current = false;
    }
  }, [onCambio]);

  useEffect(() => {
    const primero = setTimeout(() => { void correr(); }, 1500);
    const cada = setInterval(() => { void correr(); }, CADA_MS);
    const alVolverLaRed = () => { void correr(); };
    window.addEventListener('online', alVolverLaRed);
    return () => { clearTimeout(primero); clearInterval(cada); window.removeEventListener('online', alVolverLaRed); };
  }, [correr]);
}
