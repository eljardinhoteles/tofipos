import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Fondo atenuado detrás de una hoja inferior. El overlay del Drawer del sistema es transparente y no recibe toques; este se
 * atenúa y se desvanece al abrir y al cerrar (sigue montado mientras la hoja baja) y cierra al tocarlo.
 */
export function FondoHoja({ abierto, onClose }: { abierto: boolean; onClose: () => void }) {
  // Entra en el siguiente cuadro: si nace ya visible no hay nada que animar.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(abierto));
    return () => cancelAnimationFrame(id);
  }, [abierto]);

  return (
    <div
      aria-hidden onClick={abierto ? onClose : undefined}
      className={cn('fixed inset-0 z-[45] bg-black/30 transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0 pointer-events-none')}
    />
  );
}
