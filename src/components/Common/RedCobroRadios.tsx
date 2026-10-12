import { cn } from '@/lib/utils';

interface RedCobroRadiosProps {
  redes: string[];
  value: string;
  onChange: (red: string) => void;
  /** Resalta el grupo cuando falta elegir (campo obligatorio). */
  invalido?: boolean;
}

/** Red de cobro de la tarjeta: opciones tipo radio en una sola fila si hay espacio; si no, pasan a la siguiente fila. */
export function RedCobroRadios({ redes, value, onChange, invalido = false }: RedCobroRadiosProps) {
  if (redes.length === 0) return <p className="t-meta text-muted-foreground">Sin redes configuradas</p>;
  return (
    <div role="radiogroup" aria-label="Red de cobro"
      className={cn('grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-2 rounded-2xl', invalido && 'ring-2 ring-destructive/40 ring-offset-2 ring-offset-card')}>
      {redes.map(r => {
        const activa = value === r;
        return (
          <button key={r} type="button" role="radio" aria-checked={activa} onClick={() => onChange(r)}
            className={cn('min-h-11 px-3 rounded-2xl border flex items-center gap-2.5 t-cuerpo text-left cursor-pointer transition-colors touch-manipulation',
              activa ? 'bg-primary/10 border-primary/40 text-foreground' : 'bg-card border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
            <span className={cn('size-5 rounded-full border flex items-center justify-center shrink-0', activa ? 'border-primary' : 'border-border')}>
              {activa && <span className="size-2.5 rounded-full bg-primary" />}
            </span>
            <span className="truncate">{r}</span>
          </button>
        );
      })}
    </div>
  );
}
