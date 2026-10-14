import { Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/** Casilla de fila (mismo patrón que FiltroOpcion): caja size-5 rounded-md, verde al marcarla, zona táctil de 44px. `compacta` usa texto pequeño. */
export function Casilla({ checked, onChange, children, compacta = false }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; compacta?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}
      className={cn('min-h-9 pointer-coarse:min-h-11 w-fit flex items-center gap-2.5 text-left text-foreground cursor-pointer touch-manipulation', compacta ? 't-meta' : 't-cuerpo')}>
      <span className={cn('size-5 rounded-md border flex items-center justify-center shrink-0 transition-colors', checked ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-border')}>
        {checked && <Check size={14} weight="bold" />}
      </span>
      {children}
    </button>
  );
}

