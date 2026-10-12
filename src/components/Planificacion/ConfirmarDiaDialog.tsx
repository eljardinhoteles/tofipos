import { SealCheck } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResumenDia } from './ResumenDia';
import type { CeldaPlan, EtiquetaPlan } from '../../lib/planificacion';

interface Props {
  /** Fecha (YYYY-MM-DD) a confirmar; null = cerrado. */
  fecha: string | null;
  diaTexto: string;
  usuario: string;
  etiquetas: EtiquetaPlan[];
  celdas: CeldaPlan[];
  nombreProducto: (id: string) => string;
  onConfirmar: () => void;
  onCerrar: () => void;
}

// Modal de firma: resumen del menú del día y el botón que lo confirma.
export function ConfirmarDiaDialog({ fecha, diaTexto, usuario, etiquetas, celdas, nombreProducto, onConfirmar, onCerrar }: Props) {
  const total = fecha ? celdas.filter((c) => c.fecha === fecha).length : 0;
  return (
    <Dialog open={fecha !== null} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="max-w-md p-6 gap-4 max-h-[90dvh] flex flex-col">
        <DialogHeader className="text-left">
          <DialogTitle className="t-titulo">Confirmar menú · {diaTexto}</DialogTitle>
          <DialogDescription className="t-cuerpo">
            {total} {total === 1 ? 'producto' : 'productos'}. Al firmar, el día queda bloqueado: para cambiarlo habrá que anular la confirmación.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {fecha && <ResumenDia etiquetas={etiquetas} celdas={celdas} fecha={fecha} nombreProducto={nombreProducto} />}
        </div>
        <p className="t-meta text-muted-foreground">Firma: <span className="font-bold text-foreground">{usuario}</span></p>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" className="h-12 font-bold" onClick={onCerrar}>Cancelar</Button>
          <Button type="button" className="h-12 gap-2 font-bold" onClick={onConfirmar}>
            <SealCheck size={18} weight="bold" /> Firmar y confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
