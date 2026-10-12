import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check, CaretDown, X, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface FiltroChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  activo?: boolean;
  /** Muestra la flecha de los filtros que abren un menú. */
  menu?: boolean;
}

/**
 * Chip de filtro único de la app (píldora): reposo = tarjeta con borde; activo = relleno `primary`, el mismo verde de los chips de la barra de herramientas.
 * Mide 32px con mouse y 44px en táctil. El estado activo es siempre el mismo, sea cual sea el filtro.
 */
export const FiltroChip = forwardRef<HTMLButtonElement, FiltroChipProps>(function FiltroChip(
  { activo = false, menu = false, className, children, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={menu ? undefined : activo}
      className={cn(
        'min-h-8 pointer-coarse:min-h-11 px-3.5 py-1 rounded-full border t-dato whitespace-nowrap flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors touch-manipulation',
        activo ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
      {menu && <CaretDown size={12} weight="bold" className="shrink-0" />}
    </button>
  );
});

export interface OpcionFiltro<T extends string> { value: T; label: string; icono?: Icon }

interface FiltroMultipleProps<T extends string> {
  etiqueta: string;
  opciones: OpcionFiltro<T>[];
  seleccion: Set<T>;
  onToggle: (valor: T) => void;
  onLimpiar: () => void;
  /** Ancho del menú (clase de Tailwind). */
  ancho?: string;
}

/** Filtro de selección múltiple: chip con la cuenta de elegidos y un menú de opciones con casillas. */
export function FiltroMultiple<T extends string>({ etiqueta, opciones, seleccion, onToggle, onLimpiar, ancho = 'w-56' }: FiltroMultipleProps<T>) {
  const [abierto, setAbierto] = useState(false);
  const n = seleccion.size;
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <FiltroChip menu activo={n > 0}>{etiqueta}{n > 0 ? ` (${n})` : ''}</FiltroChip>
      </PopoverTrigger>
      <PopoverContent className={cn(ancho, 'p-1.5')} align="start">
        {opciones.map(({ value, label, icono: Icono }) => {
          const on = seleccion.has(value);
          return (
            <FiltroOpcion key={value} activo={on} onClick={() => onToggle(value)}>
              {Icono && <Icono size={16} weight="bold" className="text-muted-foreground shrink-0" />}
              <span className="flex-1 truncate">{label}</span>
            </FiltroOpcion>
          );
        })}
        {n > 0 && (
          <button type="button" onClick={onLimpiar}
            className="w-full mt-1 pt-0.5 border-t border-border min-h-9 pointer-coarse:min-h-11 px-2.5 rounded-2xl text-left t-cuerpo text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
            Limpiar filtro
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Fila de un menú de filtro: casilla a la izquierda y el contenido; mismo tamaño táctil en todos los filtros. */
export function FiltroOpcion({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={activo} onClick={onClick}
      className="w-full flex items-center gap-2.5 min-h-9 pointer-coarse:min-h-11 px-2.5 rounded-2xl text-left t-cuerpo text-foreground hover:bg-muted cursor-pointer transition-colors touch-manipulation">
      <span className={cn('size-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
        activo ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>
        {activo && <Check size={12} weight="bold" />}
      </span>
      {children}
    </button>
  );
}

/** Acción "Limpiar todo" que va a la derecha del último chip; solo se muestra cuando hay algún filtro aplicado. */
export function FiltroLimpiarTodo({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="min-h-8 pointer-coarse:min-h-11 px-2 flex items-center gap-1 t-dato text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0 cursor-pointer touch-manipulation">
      <X size={12} weight="bold" /> Limpiar todo
    </button>
  );
}
