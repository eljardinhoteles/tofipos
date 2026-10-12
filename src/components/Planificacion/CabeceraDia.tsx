import { memo } from 'react';
import { CheckCircle, SealCheck } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { HOY_CABECERA, HOY_TEXTO } from '../../lib/planificadorFechas';

interface Props {
  fecha: string;
  /** Día de la semana completo, p. ej. "sábado". */
  diaSemana: string;
  /** Número del día del mes. */
  diaNumero: number;
  /** "Hoy", "Ayer" o "Mañana" cuando corresponde. */
  relativo?: string;
  esHoy: boolean;
  pasado: boolean;
  tieneProductos: boolean;
  confirmadoPor: string | null;
  minAncho: string;
  onConfirmar: (fecha: string) => void;
  onVerConfirmado: (fecha: string) => void;
}

// Cabecera fija de un día: nombre, fecha y el check que confirma el menú (o el sello si ya está
// confirmado). El fondo es siempre opaco: al hacer scroll no deja ver lo que pasa por debajo.
export const CabeceraDia = memo(function CabeceraDia({
  fecha, diaSemana, diaNumero, relativo, esHoy, pasado, tieneProductos, confirmadoPor, minAncho, onConfirmar, onVerConfirmado,
}: Props) {
  return (
    <header className={cn('sticky top-0 z-10 flex items-center justify-between gap-2 pl-4 pr-2 py-2 border-b border-r border-border', minAncho,
      esHoy ? HOY_CABECERA : 'bg-card')}>
      {/* El atenuado de días pasados va solo en el texto: en toda la cabecera la volvería transparente. */}
      <div className={cn('flex flex-col min-w-0', pasado && !confirmadoPor && 'opacity-60')}>
        {relativo && <span className={cn('t-dato leading-tight', esHoy ? HOY_TEXTO : 'text-foreground')}>{relativo}</span>}
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className={cn('t-etiqueta truncate', esHoy ? HOY_TEXTO : 'text-muted-foreground')}>{diaSemana}</span>
          <h3 className={cn('t-valor leading-none shrink-0', esHoy ? HOY_TEXTO : 'text-foreground')}>{diaNumero}</h3>
        </div>
      </div>
      {confirmadoPor ? (
        <Button type="button" variant="ghost" size="icon" title={`Confirmado por ${confirmadoPor}`} aria-label={`Menú confirmado por ${confirmadoPor}. Ver resumen`}
          onClick={() => onVerConfirmado(fecha)}
          className="size-11 shrink-0 touch-manipulation text-success hover:bg-success/10 hover:text-success">
          <SealCheck weight="fill" className="size-8" />
        </Button>
      ) : !pasado && (
        <Button type="button" variant="ghost" size="icon" disabled={!tieneProductos}
          title={tieneProductos ? 'Confirmar el menú del día' : 'Añade productos para poder confirmar'}
          aria-label="Confirmar el menú del día" onClick={() => onConfirmar(fecha)}
          className={cn('size-11 shrink-0 touch-manipulation', esHoy ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground')}>
          <CheckCircle className="size-8" />
        </Button>
      )}
    </header>
  );
});
