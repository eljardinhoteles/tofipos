import { Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

// Opción de habitación activa: misma presentación al abrir una mesa vinculada
// y al cargar una comanda a una habitación (etiqueta HAB + huésped + tipo).

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
        'flex items-center justify-between p-3 rounded-2xl border-2 transition-all cursor-pointer text-left select-none',
        seleccionada ? (azul ? 'border-info bg-info-soft shadow-sm' : 'border-primary bg-primary/10 shadow-sm') : 'border-border bg-card'
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn('w-10 h-10 rounded-xl flex flex-col items-center justify-center font-black text-sm shrink-0 leading-none',
          seleccionada ? (azul ? 'bg-info text-white' : 'bg-primary text-primary-foreground') : 'bg-muted text-muted-foreground')}>
          <span className="text-[9px] uppercase font-extrabold opacity-70">HAB</span>
          <span>{numero}</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-extrabold text-sm text-foreground truncate">{huesped}</span>
          {tipo && <span className="text-xs font-semibold text-muted-foreground truncate">{tipo}</span>}
        </div>
      </div>
      {seleccionada && (
        <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm', azul ? 'bg-info text-white' : 'bg-primary text-primary-foreground')}>
          <Check size={14} weight="bold" />
        </div>
      )}
    </button>
  );
}
