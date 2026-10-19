import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { showToast } from '@/lib/toast';

const orgActiva = () => localStorage.getItem('pos_active_org_id') || '';
const ESPERA_MS = 800;

type Fila = { id?: string; adoptada?: boolean; usuario_nombre?: string | null; huesped_nombre?: string; huesped_apellido?: string; cabana?: string; fuente_nombre?: string | null; aviso_cloudbeds?: { texto?: string; fecha?: string } | null };
// Avisos ya mostrados en esta sesión: Realtime no manda el valor anterior de un UPDATE, así que cualquier edición de una
// reserva con el aviso aún sin revisar lo repetiría.
const avisados = new Set<string>();
const nombre = (f: Fila) => `${f.huesped_nombre ?? ''} ${f.huesped_apellido ?? ''}`.trim() || 'Huésped';

// Páginas que muestran reservas (Hotel, Hoy): se enteran de los cambios por aquí, sin abrir un canal propio.
const oyentes = new Set<() => void>();

/**
 * Cambios de `hotel_reservas` en tiempo real (Supabase Realtime): lo que hacen otros equipos y lo que el Worker aplica solo
 * desde Cloudbeds (reservas nuevas de Booking/Expedia/el motor de reservas, cancelaciones y cambios hechos allá).
 *
 * Se monta UNA vez en el layout de la app, así el aviso sale en cualquier pantalla. Un solo canal: muestra un aviso de lo que
 * vino de Cloudbeds y, una vez por ráfaga, avisa a las páginas que muestran reservas (`useHotelEnVivo`) para que recarguen.
 * `activo` apaga la suscripción para quien no gestiona el hotel; `onVer` lleva al Hotel desde el botón del aviso.
 */
export function useAvisosHotelEnVivo({ activo, onVer }: { activo: boolean; onVer?: () => void }) {
  const verRef = useRef(onVer);
  useEffect(() => { verRef.current = onVer; }, [onVer]);
  const org = orgActiva();

  useEffect(() => {
    if (!activo || !org) return;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    const pedir = () => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => oyentes.forEach((f) => f()), ESPERA_MS);
    };
    // El botón «Ver» solo existe si no se está ya en el Hotel (en ese caso `onVer` es undefined).
    const ver = () => (verRef.current ? { accion: { etiqueta: 'Ver', onClick: () => verRef.current?.() } } : undefined);
    const canal = supabase
      // Nombre único por montaje: en desarrollo React monta dos veces y Supabase, al terminar de cerrar el primer canal, borra
      // por nombre también el segundo (la página se quedaba sin canal y nunca recibía los avisos).
      .channel(`hotel-reservas-${org}-${crypto.randomUUID().slice(0, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_reservas', filter: `organization_id=eq.${org}` }, (p) => {
        const nueva = p.new as Fila;
        // Solo lo que hizo el servidor desde Cloudbeds (lo de este equipo ya se avisó al hacerlo).
        if (p.eventType === 'INSERT' && nueva.adoptada && nueva.usuario_nombre === 'Cloudbeds') {
          showToast.info(`Nueva reserva${nueva.fuente_nombre ? ` de ${nueva.fuente_nombre}` : ''}: ${nombre(nueva)}`, nueva.cabana ? `${nueva.cabana}. Ya está en el POS.` : 'Ya está en el POS.', ver());
        } else if (p.eventType === 'UPDATE' && nueva.aviso_cloudbeds?.texto && !avisados.has(`${nueva.id}:${nueva.aviso_cloudbeds.fecha}`)) {
          avisados.add(`${nueva.id}:${nueva.aviso_cloudbeds.fecha}`);
          showToast.info(`${nombre(nueva)}: ${nueva.aviso_cloudbeds.texto}`, 'Ya se aplicó en el POS. Revisa su venta desde la reserva.', ver());
        }
        pedir();
      })
      .subscribe();
    return () => {
      if (temporizador) clearTimeout(temporizador);
      void supabase.removeChannel(canal);
    };
  }, [activo, org]);
}

/** Para las páginas que muestran reservas: `onCambio` se llama una vez por ráfaga de cambios (los avisos los da el layout). */
export function useHotelEnVivo(onCambio: () => void) {
  const ultimo = useRef(onCambio);
  useEffect(() => { ultimo.current = onCambio; }, [onCambio]);
  useEffect(() => {
    const f = () => ultimo.current();
    oyentes.add(f);
    return () => { oyentes.delete(f); };
  }, []);
}
