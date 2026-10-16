import { Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/** Casilla de fila (mismo patrón que FiltroOpcion): caja size-5 rounded-md, verde al marcarla, zona táctil de 44px. `compacta` usa texto pequeño. */
export function Casilla({ checked, onChange, children, compacta = false, multilinea = false, className }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; compacta?: boolean; /** Texto de varias líneas (título + descripción): la casilla se alinea con la primera línea. */ multilinea?: boolean; className?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}
      className={cn('min-h-9 pointer-coarse:min-h-11 w-fit flex gap-2.5 text-left text-foreground cursor-pointer touch-manipulation', multilinea ? 'items-start' : 'items-center', compacta ? 't-meta' : 't-cuerpo', className)}>
      <span className={cn('size-5 rounded-md border flex items-center justify-center shrink-0 transition-colors', multilinea && 'mt-0.5', checked ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-border')}>
        {checked && <Check size={14} weight="bold" />}
      </span>
      {children}
    </button>
  );
}

