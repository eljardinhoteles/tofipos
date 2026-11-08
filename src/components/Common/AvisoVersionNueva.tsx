import { useRef, useState } from 'react';
import { ArrowsClockwise, WifiSlash, X } from '@phosphor-icons/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const REVISAR_CADA_MS = 10 * 60_000;
// Si tras pulsar «Actualizar» la página no se recargó sola en este tiempo, se pasa al plan B.
const ESPERA_PLAN_B_MS = 4000;

/**
 * Aviso de versión nueva de la app (PWA). La app no se recarga sola, porque podría hacerlo en medio de un cobro:
 * avisa con un botón "Actualizar". Busca versiones nuevas al abrir, cada 10 minutos y al volver a la pestaña o
 * recuperar la conexión, para que una tablet que lleva días abierta no se quede con código viejo.
 *
 * «Actualizar» a veces no hacía nada: el aviso puede quedar viejo (la versión en espera ya la reemplazó otra más nueva, o ya se activó)
 * y entonces pedirle al service worker que se active no tiene a quién llegar. Por eso el botón ahora:
 *  1. pide la activación normal; si no hay ninguna versión en espera, vuelve a buscar una;
 *  2. si en unos segundos la página no se recargó, y hay conexión, quita el service worker y los cachés de la app y recarga desde la red
 *     (no toca los datos locales: RxDB vive en IndexedDB);
 *  3. sin conexión avisa que hace falta internet, en vez de quedarse mudo.
 */
export function AvisoVersionNueva() {
  const registroRef = useRef<ServiceWorkerRegistration | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);

  const { needRefresh: [necesitaActualizar, setNecesitaActualizar], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      if (!registro) return;
      registroRef.current = registro;
      const buscar = () => { if (navigator.onLine) void registro.update().catch(() => { /* sin red: se reintenta luego */ }); };
      setInterval(buscar, REVISAR_CADA_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscar(); });
      window.addEventListener('online', buscar);
    },
  });

  const actualizar = async () => {
    if (actualizando) return;
    setActualizando(true);
    setSinConexion(false);
    let seRecargo = false;
    window.addEventListener('pagehide', () => { seRecargo = true; }, { once: true });

    // 1) Camino normal: activar la versión en espera y recargar. Si no hay ninguna (aviso viejo), se busca otra antes de reintentar.
    try {
      const registro = registroRef.current;
      if (registro && !registro.waiting && navigator.onLine) await registro.update().catch(() => undefined);
      void updateServiceWorker(true);
    } catch { /* se pasa al plan B */ }

    // 2) Plan B: no se recargó sola.
    window.setTimeout(async () => {
      if (seRecargo) return;
      if (!navigator.onLine) { setActualizando(false); setSinConexion(true); return; }
      try {
        const registros = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registros.map(r => r.unregister()));
        const claves = await caches.keys();
        await Promise.all(claves.filter(k => /precache|workbox/i.test(k)).map(k => caches.delete(k)));
      } catch { /* aun así se intenta recargar */ }
      window.location.reload();
    }, ESPERA_PLAN_B_MS);
  };

  if (!necesitaActualizar) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] md:bottom-6 z-[60] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-card pl-4 pr-1.5 py-1 shadow-lg border border-border">
        {sinConexion
          ? <WifiSlash size={18} weight="bold" className="shrink-0 text-warning-foreground" />
          : <ArrowsClockwise size={18} weight="bold" className={cn('shrink-0 text-primary', actualizando && 'animate-spin motion-reduce:animate-none')} />}
        <span className="t-cuerpo-fuerte text-foreground">
          {sinConexion ? 'Necesitas internet para actualizar' : actualizando ? 'Actualizando…' : 'Hay una versión nueva'}
        </span>
        <Button type="button" size="sm" className="rounded-full" disabled={actualizando} onClick={() => void actualizar()}>
          {sinConexion ? 'Reintentar' : 'Actualizar'}
        </Button>
        <button type="button" onClick={() => setNecesitaActualizar(false)} aria-label="Ahora no" disabled={actualizando}
          className="shrink-0 size-8 pointer-coarse:size-11 rounded-full flex items-center justify-center cursor-pointer text-muted-foreground hover:bg-muted transition-colors touch-manipulation disabled:opacity-40">
          <X size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
