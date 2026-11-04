import { cn } from '@/lib/utils';

export type OrdenTop = 'monto' | 'unidades';

/** Interruptor para ordenar un ranking por dinero o por unidades. */
export function OrdenTopToggle({ valor, onChange, className }: { valor: OrdenTop; onChange: (o: OrdenTop) => void; className?: string }) {
  return (
    <div role="group" aria-label="Ordenar ranking por" className={cn('inline-flex items-center rounded-full bg-muted p-0.5 shrink-0', className)}>
      {(['monto', 'unidades'] as const).map((o) => (
        <button key={o} type="button" aria-pressed={valor === o} onClick={() => onChange(o)}
          className={cn('h-7 pointer-coarse:h-10 px-3 rounded-full t-dato cursor-pointer transition-colors',
            valor === o ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground')}>
          {o === 'monto' ? 'Monto' : 'Unidades'}
        </button>
      ))}
    </div>
  );
}
