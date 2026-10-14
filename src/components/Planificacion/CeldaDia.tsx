import { memo, type KeyboardEvent, type RefObject } from 'react';
import { Plus, Tag, Trash } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { HOY_CELDA } from '../../lib/planificadorFechas';
import { TONOS_ETIQUETA, quitarCelda, type CeldaPlan, type EtiquetaPlan } from '../../lib/planificacion';

interface FilaProps { etiqueta: EtiquetaPlan }

// Cabecera de fila: la etiqueta, en una columna fija a la izquierda como las zonas del calendario de Reservas.
export const EtiquetaFila = memo(function EtiquetaFila({ etiqueta }: FilaProps) {
  const tono = TONOS_ETIQUETA[etiqueta.tono];
  return (
    <div className={cn('sticky left-0 z-10 flex items-start gap-2 px-4 py-3 bg-background border-b border-r border-border shadow-[2px_0_0_0_var(--border)]', tono.fila)}>
      <Tag size={16} weight="fill" className="shrink-0 mt-0.5" />
      <span className="t-cuerpo-fuerte">{etiqueta.nombre}</span>
    </div>
  );
});

interface CeldaProps {
  etiqueta: EtiquetaPlan;
  fecha: string;
  items: CeldaPlan[];
  nombreProducto: (id: string) => string;
  esHoy: boolean;
  pasado: boolean;
  bloqueado: boolean;
  elegida: boolean;
  minAncho: string;
  /** Ref de la celda elegida (para llevarla a la vista cuando el sidebar angosta el área). */
  refElegida: RefObject<HTMLDivElement | null>;
  onAbrir: (etiquetaId: string, fecha: string) => void;
  /** Sin permiso para editar (mesero): la celda solo muestra sus productos. */
  soloLectura?: boolean;
}

// Celda de una etiqueta en un día: toda es un objetivo táctil que abre el sidebar. Los productos son
// tarjetas del color de su etiqueta; la papelera solo aparece en la celda abierta.
export const CeldaDia = memo(function CeldaDia({
  etiqueta, fecha, items, nombreProducto, esHoy, pasado, bloqueado, elegida, minAncho, refElegida, onAbrir, soloLectura = false,
}: CeldaProps) {
  const tono = TONOS_ETIQUETA[etiqueta.tono];
  const inerte = pasado || soloLectura;
  const abrir = () => onAbrir(etiqueta.id, fecha);
  const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } };
  return (
    <div
      ref={elegida ? refElegida : undefined}
      role={inerte ? undefined : 'button'}
      tabIndex={inerte ? undefined : 0}
      aria-label={inerte ? undefined : `Productos de ${etiqueta.nombre}, ${fecha}`}
      aria-pressed={inerte ? undefined : elegida}
      onClick={inerte ? undefined : abrir}
      onKeyDown={inerte ? undefined : alTeclear}
      className={cn('group/celda flex flex-col gap-2 px-3 py-2.5 min-h-20 border-b border-r border-border bg-background transition-colors outline-none touch-manipulation focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40',
        minAncho,
        pasado && 'opacity-60',
        esHoy && !elegida && HOY_CELDA,
        !inerte && !elegida && 'cursor-pointer hover:bg-muted/40 active:bg-muted/60',
        elegida && cn('cursor-pointer ring-2 ring-inset', tono.activa))}
    >
      {/* Celda vacía: solo un + muy tenue (sin recuadro) para indicar que se toca para añadir. Solo en días vigentes y
          sin confirmar; desaparece en cuanto hay un producto. */}
      {items.length === 0 && !inerte && !bloqueado && (
        <span aria-hidden="true" className={cn('flex h-11 items-center justify-center transition-colors',
          elegida ? 'text-muted-foreground' : 'text-muted-foreground/40 group-hover/celda:text-muted-foreground/60')}>
          <Plus size={20} />
        </span>
      )}
      {items.map((c) => {
        const nombre = nombreProducto(c.producto_id);
        return (
          <div key={c.id} className={cn('flex items-center gap-2 h-11 px-3 rounded-2xl border ring-1 ring-inset ring-white/60 shadow-[0_1px_2px_rgba(15,23,42,0.06)]', tono.chip)}>
            <span className="flex-1 min-w-0 truncate t-cuerpo-fuerte" title={nombre}>{nombre}</span>
            {elegida && !bloqueado && (
              <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${nombre}`}
                onClick={(e) => { e.stopPropagation(); quitarCelda(c.id); }}
                className="size-10 -mr-2.5 text-muted-foreground hover:text-destructive touch-manipulation">
                <Trash size={18} />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
});
