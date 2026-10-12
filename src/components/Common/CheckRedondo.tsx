import { Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface CheckRedondoProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  'aria-label': string;
  id?: string;
  className?: string;
}

/**
 * Casilla circular: el mismo círculo de "elegido" de las listas de selección, usada para
 * activo/inactivo. Marcada = verde con check; desmarcada = círculo vacío.
 * La zona táctil es de 44px aunque el círculo mida 28px.
 */
export function CheckRedondo({ checked, onCheckedChange, id, className, ...rest }: CheckRedondoProps) {
  return (
    <button
      type="button"
      id={id}
      role="checkbox"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      onClick={(e) => { e.stopPropagation(); onCheckedChange(!checked); }}
      className={cn('-m-2 p-2 pointer-coarse:-m-2 flex shrink-0 cursor-pointer touch-manipulation', className)}
    >
      <span className={cn('size-7 rounded-full border-2 flex items-center justify-center transition-colors',
        checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border bg-card')}>
        {checked && <Check size={16} weight="bold" />}
      </span>
    </button>
  );
}
