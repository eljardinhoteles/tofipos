import { useEffect, useState } from 'react';
import { Paperclip, Trash, FilePdf, Receipt, Eye, ArrowSquareOut } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { resolverComprobanteUrl, resolverComprobanteUrlAsync } from '@/lib/comprobantes';

interface ArchivoVentaCardProps {
  doc: { id: string; url: string; nombre: string; origen: string };
  /** Etiqueta, ícono y color del movimiento al que pertenece el archivo (el documento de la venta usa los de factura). */
  etiqueta: string;
  icono?: typeof Receipt;
  colorClasses?: string;
  onEliminar?: () => void;
  eliminando?: boolean;
}

// Misma anatomía que las tarjetas del historial: miniatura de 44px con insignia del tipo en la esquina, título, meta y acción a la derecha.
export function ArchivoVentaCard({ doc, etiqueta, icono: Icono = Paperclip, colorClasses = 'bg-muted text-muted-foreground', onEliminar, eliminando }: ArchivoVentaCardProps) {
  const [miniatura, setMiniatura] = useState('');
  const esPdf = doc.url.toLowerCase().split('?')[0].endsWith('.pdf');
  const [visor, setVisor] = useState(false);

  useEffect(() => {
    let activo = true;
    if (esPdf) { setMiniatura(''); return; }
    resolverComprobanteUrlAsync(doc.url).then(u => { if (activo) setMiniatura(u); });
    return () => { activo = false; };
  }, [doc.url, esPdf]);

  const href = miniatura || resolverComprobanteUrl(doc.url);

  return (
    <div className="group rounded-2xl bg-card shadow-2xs p-2.5 flex items-center gap-2.5 min-w-0">
      <div className="relative shrink-0">
        <a href={href} target="_blank" rel="noreferrer" title="Abrir archivo"
          className="w-11 h-11 rounded-xl border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
          {miniatura && !esPdf
            ? <img src={miniatura} alt="" className="w-full h-full object-cover" />
            : esPdf ? <FilePdf size={20} className="text-destructive" /> : <Paperclip size={18} className="text-muted-foreground" />}
        </a>
        <div title={etiqueta} className={cn('absolute -bottom-1 -right-1 w-5 h-5 rounded-full border border-background flex items-center justify-center shadow-xs', colorClasses)}>
          <Icono size={10} weight="bold" />
        </div>
      </div>

      <a href={href} target="_blank" rel="noreferrer" className="flex flex-col min-w-0 flex-1 hover:text-primary transition-colors">
        <span className="t-cuerpo-fuerte text-foreground truncate" title={doc.nombre}>{doc.nombre}</span>
        <span className="t-meta text-muted-foreground truncate">{etiqueta}</span>
      </a>

      <Button type="button" variant="ghost" size="icon" onClick={() => setVisor(true)}
        title="Ver archivo" aria-label={`Ver ${doc.nombre}`} className="shrink-0 text-muted-foreground hover:text-foreground">
        <Eye size={18} weight="bold" />
      </Button>

      {onEliminar && (
        <Button type="button" variant="ghost" size="icon" onClick={onEliminar} disabled={eliminando}
          title="Eliminar archivo" aria-label={`Eliminar ${doc.nombre}`}
          className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
          <Trash size={16} weight="bold" />
        </Button>
      )}

      <Dialog open={visor} onOpenChange={setVisor}>
        <DialogContent className="max-w-3xl w-[calc(100%-2rem)] max-h-[90dvh] flex flex-col gap-3">
          <DialogHeader className="pr-8">
            <DialogTitle className="t-fila text-foreground truncate" title={doc.nombre}>{doc.nombre}</DialogTitle>
            <DialogDescription className="t-meta text-muted-foreground">{etiqueta}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 rounded-2xl bg-muted/40 overflow-auto flex items-center justify-center">
            {esPdf
              ? <iframe src={href} title={doc.nombre} className="w-full h-[70dvh] border-0" />
              : <img src={href} alt={doc.nombre} className="max-w-full max-h-[70dvh] object-contain" />}
          </div>
          <a href={href} target="_blank" rel="noreferrer" className="self-end t-dato text-primary flex items-center gap-1.5">
            <ArrowSquareOut size={14} weight="bold" /> Abrir en pestaña nueva
          </a>
        </DialogContent>
      </Dialog>
    </div>
  );
}
