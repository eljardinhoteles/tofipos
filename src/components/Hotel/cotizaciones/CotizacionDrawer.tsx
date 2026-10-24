import { ArrowRight, PencilSimple, Trash, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EstadoBadge } from '../../Common/EstadoBadge';
import { estadoEfectivo, numeroCotizacion, type Cotizacion } from '../../../lib/hotelCotizacionesApi';
import { ResultadoCotizacion } from './ResultadoCotizacion';
import { useExportarCotizacion } from './useExportarCotizacion';

interface Props {
  cotizacion: Cotizacion;
  onClose: () => void;
  onConvertir: (c: Cotizacion) => void;
  onBorrar: (c: Cotizacion) => void;
  /** Reabre la cotización en el cotizador para editarla completa. */
  onEditar: (c: Cotizacion) => void;
}

/** Una cotización guardada: el documento con sus salidas (PDF, imagen…) y las acciones de convertirla en reserva o borrarla. */
export function CotizacionDrawer({ cotizacion: c, onClose, onConvertir, onBorrar, onEditar }: Props) {
  const estado = estadoEfectivo(c);
  const { docRef, botones } = useExportarCotizacion(c);
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl p-0 flex flex-col gap-0 data-[side=right]:border-l-0 bg-background">
        <SheetHeader className="px-5 py-3 border-b border-border bg-card flex flex-row items-center gap-3 text-left">
          <SheetTitle className="t-titulo">{numeroCotizacion(c.numero)}</SheetTitle>
          <SheetDescription className="sr-only">Cotización de {c.cliente.nombre}</SheetDescription>
          <EstadoBadge tono={estado === 'vigente' ? 'success' : estado === 'convertida' ? 'info' : 'neutral'}>{estado === 'vigente' ? 'Vigente' : estado === 'convertida' ? 'Convertida' : 'Vencida'}</EstadoBadge>
          <div className="ml-auto">{botones}</div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="size-11 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0">
            <X size={18} weight="bold" />
          </button>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto p-5"><ResultadoCotizacion cotizacion={c} docRef={docRef} /></div>
        <div className="border-t border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="h-11 gap-2 text-destructive" onClick={() => onBorrar(c)}><Trash size={16} weight="bold" /> Borrar</Button>
            <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => onEditar(c)}><PencilSimple size={16} weight="bold" /> Editar</Button>
          </div>
          {estado !== 'convertida' && (
            <Button type="button" className="h-11 gap-2 px-5" onClick={() => onConvertir(c)}>Convertir en reserva <ArrowRight size={16} weight="bold" /></Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
