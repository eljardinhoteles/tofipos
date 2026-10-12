import { useEffect, useState } from 'react';
import { Printer, X } from '@phosphor-icons/react';
import { checkCloudServerOnline, getCachedCloudPrintServer } from '../../lib/printServerClient';

const REVISAR_CADA_MS = 30_000;

/**
 * Aviso flotante cuando el servidor de impresión vinculado dejó de dar señal
 * (programa cerrado, PC apagada o sin internet). No aparece sin servidor vinculado
 * ni cuando no se puede consultar (no se asume caído por falta de datos).
 */
export function AvisoServidorImpresion() {
  const [caido, setCaido] = useState(false);
  // Descartado a mano: no vuelve a salir hasta que el servidor se recupere y vuelva a caer.
  const [descartado, setDescartado] = useState(false);

  useEffect(() => {
    let vivo = true;
    const revisar = async () => {
      const server = getCachedCloudPrintServer();
      if (!server || document.visibilityState === 'hidden') return;
      const online = await checkCloudServerOnline(server.id);
      if (vivo && online !== null) { setCaido(!online); if (online) setDescartado(false); }
    };
    revisar();
    const id = setInterval(revisar, REVISAR_CADA_MS);
    document.addEventListener('visibilitychange', revisar);
    return () => { vivo = false; clearInterval(id); document.removeEventListener('visibilitychange', revisar); };
  }, []);

  if (!caido || descartado) return null;
  return (
    <div role="alert" className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-destructive-soft pl-4 pr-1.5 py-1 t-cuerpo-fuerte text-destructive shadow-md">
        <Printer size={18} weight="bold" className="shrink-0" />
        <span>Servidor de impresión desconectado: los tickets no saldrán. Abre el programa en la PC de impresión.</span>
        <button type="button" onClick={() => setDescartado(true)} aria-label="Cerrar aviso"
          className="shrink-0 size-8 pointer-coarse:size-11 rounded-full flex items-center justify-center cursor-pointer hover:bg-destructive/10 transition-colors touch-manipulation">
          <X size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
