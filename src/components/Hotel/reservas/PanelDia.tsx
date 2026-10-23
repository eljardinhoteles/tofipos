import dayjs from 'dayjs';
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { Ocupacion } from './modelo';

interface Props {
  /** Día que se está mirando («AAAA-MM-DD»). */
  fecha: string;
  hoy: string;
  onFecha: (f: string) => void;
  ocupacion: Ocupacion;
}

const botonFlecha = 'size-9 pointer-coarse:size-11 shrink-0 rounded-2xl border border-border bg-card flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors';

const RADIO = 38;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/**
 * Columna del día: la fecha que se mira (con flechas para cambiarla) y la ocupación de las habitaciones ese día.
 * Cambiar el día cambia lo que cuentan las tarjetas de actividad y la tabla.
 */
export function PanelDia({ fecha, hoy, onFecha, ocupacion }: Props) {
  const d = dayjs(fecha);
  const esHoy = fecha === hoy;
  const filas: Array<{ punto: string; etiqueta: string; valor: number }> = [
    { punto: 'bg-success', etiqueta: 'Disponibles', valor: ocupacion.disponibles },
    { punto: 'bg-primary', etiqueta: 'Ocupadas', valor: ocupacion.ocupadas },
    { punto: 'bg-destructive', etiqueta: 'Fuera de servicio', valor: ocupacion.fueraDeServicio },
    { punto: 'bg-warning', etiqueta: 'Bloqueadas', valor: ocupacion.bloqueadas },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
      <section aria-label="Día que se consulta" className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="t-etiqueta text-muted-foreground capitalize">{d.format('dddd')}</span>
          {esHoy ? <span className="t-dato text-primary">Hoy</span> : (
            <button type="button" onClick={() => onFecha(hoy)} className="t-dato text-primary hover:underline cursor-pointer min-h-6 pointer-coarse:min-h-11 flex items-center">Ir a hoy</button>
          )}
        </div>
        <span className="t-hero tabular-nums">{d.format('D')}</span>
        <div className="flex items-center justify-between gap-2">
          <span className="t-cuerpo text-muted-foreground capitalize flex items-center gap-1.5"><CalendarBlank size={16} aria-hidden /> {d.format('MMMM YYYY')}</span>
          <span className="flex items-center gap-1.5">
            <button type="button" aria-label="Día anterior" title="Día anterior" onClick={() => onFecha(d.subtract(1, 'day').format('YYYY-MM-DD'))} className={botonFlecha}><CaretLeft size={16} weight="bold" /></button>
            <button type="button" aria-label="Día siguiente" title="Día siguiente" onClick={() => onFecha(d.add(1, 'day').format('YYYY-MM-DD'))} className={botonFlecha}><CaretRight size={16} weight="bold" /></button>
          </span>
        </div>
      </section>

      <section aria-label="Ocupación" className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
        <span className="t-etiqueta text-muted-foreground">Ocupación</span>
        <div className="relative self-center size-28" role="img" aria-label={`${ocupacion.tasa.toFixed(0)} por ciento de ocupación`}>
          <svg className="size-28 -rotate-90" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r={RADIO} className="stroke-muted" strokeWidth="10" fill="transparent" />
            <circle
              cx="50" cy="50" r={RADIO} className="stroke-primary transition-all duration-500 ease-out motion-reduce:transition-none" strokeWidth="10" fill="transparent"
              strokeDasharray={CIRCUNFERENCIA} strokeDashoffset={CIRCUNFERENCIA - (ocupacion.tasa / 100) * CIRCUNFERENCIA} strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="t-valor">{ocupacion.tasa.toFixed(0)}%</span>
          </div>
        </div>
        <span className="t-meta text-muted-foreground text-center -mt-1">de {ocupacion.total} habitaciones activas</span>
        <ul className="flex flex-col gap-2 border-t border-border pt-3">
          {filas.map((f) => (
            <li key={f.etiqueta} className="flex items-center justify-between gap-2">
              <span className="t-cuerpo text-muted-foreground flex items-center gap-2"><span className={cn('size-2 rounded-full', f.punto)} aria-hidden /> {f.etiqueta}</span>
              <span className="t-cuerpo-fuerte tabular-nums">{f.valor}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
