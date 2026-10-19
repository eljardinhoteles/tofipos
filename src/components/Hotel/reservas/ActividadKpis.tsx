import { CalendarPlus, House, ListBullets, Moon, Prohibit, SignIn, SignOut, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { Vista } from './modelo';

const VISTAS_ACTIVIDAD: Array<{ id: Vista; etiqueta: string; icono: Icon; ayuda: string }> = [
  { id: 'llegadas', etiqueta: 'Llegadas', icono: SignIn, ayuda: 'Reservas que llegan ese día' },
  { id: 'salidas', etiqueta: 'Salidas', icono: SignOut, ayuda: 'Reservas que salen ese día' },
  { id: 'in_house', etiqueta: 'En casa', icono: House, ayuda: 'Huéspedes que ya llegaron y siguen alojados' },
  { id: 'pernoctaciones', etiqueta: 'Pernoctan', icono: Moon, ayuda: 'Todas las reservas que duermen esa noche, incluidas las que llegan ese día' },
  { id: 'nuevas', etiqueta: 'Nuevas', icono: CalendarPlus, ayuda: 'Reservas creadas ese día' },
  { id: 'canceladas', etiqueta: 'Canceladas', icono: Prohibit, ayuda: 'Reservas canceladas que cubrían ese día' },
  { id: 'todas', etiqueta: 'Todas', icono: ListBullets, ayuda: 'Todas las reservas del POS, de cualquier fecha' },
];

interface Props {
  vista: Vista;
  onVista: (v: Vista) => void;
  conteos: Record<Vista, number>;
}

/** Tarjetas de actividad del día: cuentan lo que hay y, al tocarlas, filtran la tabla. La activa se marca con el verde de marca. */
export function ActividadKpis({ vista, onVista, conteos }: Props) {
  return (
    <div role="tablist" aria-label="Actividad" className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
      {VISTAS_ACTIVIDAD.map(({ id, etiqueta, icono: Icono, ayuda }) => {
        const activa = vista === id;
        return (
          <button
            key={id} type="button" role="tab" aria-selected={activa} title={ayuda} onClick={() => onVista(id)}
            className={cn(
              'min-h-16 rounded-2xl border p-3 text-left flex flex-col gap-1 cursor-pointer transition-colors',
              activa ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:bg-muted/60',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="t-cifra tabular-nums">{conteos[id]}</span>
              <Icono size={18} weight={activa ? 'fill' : 'bold'} className={activa ? 'text-primary' : 'text-muted-foreground'} aria-hidden />
            </span>
            <span className={cn('t-meta', activa ? 'text-foreground font-bold' : 'text-muted-foreground')}>{etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}
