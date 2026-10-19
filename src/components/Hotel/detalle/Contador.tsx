import { Minus, Plus } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { etiquetaCampo } from './formatos';

/** Contador con botones grandes (táctil), más rápido y sin errores de tipeo que un campo numérico. `compacto`: sin etiqueta. `enLinea`: etiqueta a la izquierda y tamaño reducido. */
export function Contador({ etiquetaTexto, valor, min, max, onCambio, compacto, enLinea, corto }: { etiquetaTexto: string; valor: number; min: number; max: number; onCambio: (n: number) => void; compacto?: boolean; enLinea?: boolean; corto?: string }) {
  const boton = enLinea ? 'size-9' : 'size-10';
  return (
    <div className={cn('flex gap-1.5', enLinea ? 'items-center' : 'flex-col')}>
      {!compacto && <span className={enLinea ? 't-meta text-muted-foreground' : etiquetaCampo}>{enLinea ? (corto ?? etiquetaTexto) : etiquetaTexto}</span>}
      <div className="flex items-center gap-0.5 rounded-2xl border border-border bg-card p-0.5 w-fit" role="group" aria-label={etiquetaTexto}>
        <button type="button" onClick={() => onCambio(Math.max(min, valor - 1))} disabled={valor <= min} aria-label={`Quitar uno (${etiquetaTexto.toLowerCase()})`}
          className={cn(boton, 'rounded-xl flex items-center justify-center cursor-pointer hover:bg-muted disabled:opacity-35 disabled:cursor-not-allowed')}><Minus size={enLinea ? 14 : 16} weight="bold" /></button>
        <span className={cn('text-center t-fila tabular-nums', enLinea ? 'min-w-6' : 'min-w-8')} aria-live="polite">{valor}</span>
        <button type="button" onClick={() => onCambio(Math.min(max, valor + 1))} disabled={valor >= max} aria-label={`Añadir uno (${etiquetaTexto.toLowerCase()})`}
          className={cn(boton, 'rounded-xl flex items-center justify-center cursor-pointer hover:bg-muted disabled:opacity-35 disabled:cursor-not-allowed')}><Plus size={enLinea ? 14 : 16} weight="bold" /></button>
      </div>
    </div>
  );
}
