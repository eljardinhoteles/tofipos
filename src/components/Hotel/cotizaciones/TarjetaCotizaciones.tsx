import { CaretRight, FileText } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface Props {
  /** Cotizaciones vigentes (dentro de sus 48 horas). */
  vigentes: number;
  porVencer: number;
  activa: boolean;
  onClick: () => void;
}

/** Acceso a la lista de cotizaciones, aparte de las tarjetas operativas del día (debajo de la ocupación). */
export function TarjetaCotizaciones({ vigentes, porVencer, activa, onClick }: Props) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} title="Cotizaciones guardadas (vigentes 48 horas)"
      className={cn('w-full rounded-2xl border p-4 text-left flex items-center gap-3 cursor-pointer transition-colors', activa ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:bg-muted/60')}>
      <span className={cn('size-10 shrink-0 rounded-xl flex items-center justify-center', activa ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
        <FileText size={20} weight={activa ? 'fill' : 'bold'} aria-hidden />
      </span>
      <span className="flex flex-col min-w-0 grow">
        <span className={cn('t-etiqueta', activa ? 'text-primary' : 'text-muted-foreground')}>Cotizaciones</span>
        <span className="t-meta text-muted-foreground truncate">{vigentes === 0 ? 'Sin vigentes' : porVencer > 0 ? `${porVencer} por vencer` : 'Vigentes 48 h'}</span>
      </span>
      <span className="t-cifra tabular-nums leading-none shrink-0">{vigentes}</span>
      <CaretRight size={16} weight="bold" className="text-muted-foreground shrink-0" aria-hidden />
    </button>
  );
}
