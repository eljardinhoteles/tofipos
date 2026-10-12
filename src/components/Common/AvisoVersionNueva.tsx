import { ArrowsClockwise, X } from '@phosphor-icons/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

const REVISAR_CADA_MS = 10 * 60_000;

/**
 * Aviso de versión nueva de la app (PWA). La app no se recarga sola, porque podría hacerlo en medio de un cobro:
 * avisa con un botón "Actualizar". Busca versiones nuevas al abrir, cada 10 minutos y al volver a la pestaña o
 * recuperar la conexión, para que una tablet que lleva días abierta no se quede con código viejo.
 */
export function AvisoVersionNueva() {
  const { needRefresh: [necesitaActualizar, setNecesitaActualizar], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      if (!registro) return;
      const buscar = () => { if (navigator.onLine) void registro.update().catch(() => { /* sin red: se reintenta luego */ }); };
      setInterval(buscar, REVISAR_CADA_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscar(); });
      window.addEventListener('online', buscar);
    },
  });

  if (!necesitaActualizar) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] md:bottom-6 z-[60] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-card pl-4 pr-1.5 py-1 shadow-lg border border-border">
        <ArrowsClockwise size={18} weight="bold" className="shrink-0 text-primary" />
        <span className="t-cuerpo-fuerte text-foreground">Hay una versión nueva</span>
        <Button type="button" size="sm" className="rounded-full" onClick={() => void updateServiceWorker(true)}>
          Actualizar
        </Button>
        <button type="button" onClick={() => setNecesitaActualizar(false)} aria-label="Ahora no"
          className="shrink-0 size-8 pointer-coarse:size-11 rounded-full flex items-center justify-center cursor-pointer text-muted-foreground hover:bg-muted transition-colors touch-manipulation">
          <X size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
