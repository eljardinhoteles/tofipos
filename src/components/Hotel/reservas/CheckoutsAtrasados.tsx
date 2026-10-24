import dayjs from 'dayjs';
import { SignOut } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Girando } from '../Espera';
import type { Fila } from './modelo';

interface Props {
  filas: Fila[];
  /** Clave de la fila que se está procesando (para su indicador). */
  haciendo: string | null;
  onCheckout: (f: Fila) => void;
  onClose: () => void;
}

/**
 * Huéspedes que debían salir antes de hoy y siguen «en casa» en Cloudbeds (el check-out no se hizo). No son de las Salidas de hoy: aquí se
 * ven aparte y se les puede hacer el check-out, con la misma comprobación de cuentas abiertas en Mesas.
 */
export function CheckoutsAtrasados({ filas, haciendo, onCheckout, onClose }: Props) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="t-titulo">Check-outs atrasados</DialogTitle>
          <DialogDescription className="t-meta">Debían salir antes de hoy y siguen en casa en Cloudbeds. Si ya se fueron, haz su check-out para que dejen de aparecer aquí.</DialogDescription>
        </DialogHeader>
        {filas.length === 0 ? (
          <p className="t-cuerpo text-muted-foreground py-6 text-center">No quedan check-outs atrasados.</p>
        ) : (
          <ul className="min-h-0 overflow-y-auto flex flex-col divide-y divide-border rounded-2xl border border-border">
            {filas.map((f) => (
              <li key={f.clave} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="flex flex-col min-w-0">
                  <span className="t-fila truncate">{f.nombre}</span>
                  <span className="t-meta text-muted-foreground truncate">{f.cabana} · salía el {dayjs(f.salida).format('ddd D MMM')}</span>
                </span>
                <Button type="button" className="h-10 gap-1.5 shrink-0" disabled={haciendo === f.clave} onClick={() => onCheckout(f)}>
                  {haciendo === f.clave ? <Girando /> : <SignOut size={16} weight="bold" aria-hidden />} Check-out
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
