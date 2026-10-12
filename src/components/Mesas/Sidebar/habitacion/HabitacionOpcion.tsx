import { Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

// Opción de habitación activa: misma presentación al abrir una mesa vinculada
// y al cargar una comanda a una habitación (número de habitación + huésped + tipo).

interface HabitacionOpcionProps {
  /** Nombre de la mesa de la habitación, p. ej. "Hab. 3 (CABAÑA JACUZZI)". */
  mesaNombre?: string | null;
  huesped: string;
  seleccionada: boolean;
  onSelect: () => void;
  /** Color de la opción elegida: el de marca (por defecto) o azul de habitaciones. */
  tono?: 'primary' | 'info';
}

export function HabitacionOpcion({ mesaNombre, huesped, seleccionada, onSelect, tono = 'primary' }: HabitacionOpcionProps) {
  const azul = tono === 'info';
  const nombre = mesaNombre || '';
  const numero = nombre.match(/Hab\.\s*(\d+)/)?.[1] || nombre || '—';
  const tipo = nombre.match(/\(([^)]+)\)/)?.[1] || '';

  return (
    <button
      type="button"
      aria-pressed={seleccionada}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 py-2 pl-2 pr-3 rounded-2xl border text-left select-none cursor-pointer transition-colors touch-manipulation active:scale-[0.99]',
        seleccionada
          ? (azul ? 'border-info bg-info-soft ring-1 ring-info' : 'border-primary bg-primary/10 ring-1 ring-primary')
          : 'border-border bg-card hover:bg-muted/40'
      )}
    >
      <div className={cn('size-12 rounded-md flex items-center justify-center shrink-0',
        seleccionada ? (azul ? 'bg-info text-white' : 'bg-primary text-primary-foreground') : 'bg-muted text-muted-foreground')}>
        <span className="t-valor leading-none">{numero}</span>
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="t-fila text-foreground truncate">{huesped}</span>
        {tipo && <span className="t-meta text-muted-foreground truncate capitalize">{tipo.toLowerCase()}</span>}
      </div>
      <span aria-hidden="true" className={cn('size-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
        seleccionada ? (azul ? 'bg-info border-info text-white' : 'bg-primary border-primary text-primary-foreground') : 'border-border')}>
        {seleccionada && <Check size={16} weight="bold" />}
      </span>
    </button>
  );
}
