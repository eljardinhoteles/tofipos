import { CalendarPlus, House, ListBullets, Moon, Prohibit, SignIn, SignOut, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { Vista } from './modelo';
import type { DetalleKpi } from './detalleKpi';

const VISTAS_ACTIVIDAD: Array<{ id: Vista; etiqueta: string; icono: Icon; ayuda: string }> = [
  { id: 'llegadas', etiqueta: 'Llegadas', icono: SignIn, ayuda: 'Reservas que llegan ese día y aún no hicieron el check-in (hoy; al hacerlo pasan a En casa)' },
  { id: 'salidas', etiqueta: 'Salidas', icono: SignOut, ayuda: 'Reservas que salen ese día' },
  { id: 'in_house', etiqueta: 'En casa', icono: House, ayuda: 'Reservas que ya hicieron el check-in y siguen alojadas' },
  { id: 'pernoctaciones', etiqueta: 'Pernoctan', icono: Moon, ayuda: 'Todas las reservas que duermen esa noche, incluidas las que llegan ese día' },
  { id: 'nuevas', etiqueta: 'Nuevas', icono: CalendarPlus, ayuda: 'Reservas creadas ese día' },
  { id: 'canceladas', etiqueta: 'Canceladas', icono: Prohibit, ayuda: 'Reservas canceladas que cubrían ese día' },
  { id: 'todas', etiqueta: 'Todas', icono: ListBullets, ayuda: 'Todas las reservas del POS, de cualquier fecha' },
];

interface Props {
  /** Vista elegida; null cuando se está mirando la lista de cotizaciones. */
  vista: Vista | null;
  onVista: (v: Vista) => void;
  conteos: Record<Vista, number>;
  /** Personas de cada vista (adultos y niños) y el detalle completo para el tooltip. */
  detalles?: Record<Vista, DetalleKpi>;
}

/**
 * Tarjetas de actividad del día: cada una cuenta RESERVAS (número grande) y, debajo, las personas en texto («4 adultos · 2 niños»; los niños solo si hay). Al tocarlas filtran la tabla; la activa se marca con el verde de marca.
 */
export function ActividadKpis({ vista, onVista, conteos, detalles }: Props) {
  return (
    <div role="tablist" aria-label="Actividad" className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
      {VISTAS_ACTIVIDAD.map(({ id, etiqueta, icono: Icono, ayuda }) => {
        const activa = vista === id;
        const d = detalles?.[id];
        return (
          <button
            key={id} type="button" role="tab" aria-selected={activa} title={d?.titulo ? `${ayuda}\n${d.titulo}` : ayuda} onClick={() => onVista(id)}
            className={cn(
              'rounded-2xl border px-3.5 py-3 text-left flex flex-col gap-2 cursor-pointer transition-colors',
              activa ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:bg-muted/60',
            )}
          >
            <span className={cn('flex items-center gap-1.5 t-dato', activa ? 'text-primary' : 'text-muted-foreground')}>
              <Icono size={16} weight={activa ? 'fill' : 'bold'} aria-hidden />
              <span className={cn('truncate', activa && 'font-bold')}>{etiqueta}</span>
            </span>
            <span className="t-cifra tabular-nums leading-none">{conteos[id]}</span>
            {/* Siempre ocupa su línea para que las tarjetas no cambien de alto según tengan o no personas. */}
            <span className="t-meta text-muted-foreground tabular-nums truncate min-h-5">
              {d ? [d.adultos > 0 ? `${d.adultos} ${d.adultos === 1 ? 'adulto' : 'adultos'}` : '', d.ninos > 0 ? `${d.ninos} ${d.ninos === 1 ? 'niño' : 'niños'}` : ''].filter(Boolean).join(' · ') : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
