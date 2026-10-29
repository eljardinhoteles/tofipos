import { Baby, User } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { VentaConMovimientos } from '../../../lib/ventaConMovimientos';
import { totalConExtras, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { atribucionDePago } from '../../../lib/hotelCobros';
import { EPS, dinero, plural } from './formatos';

interface Props {
  /** Reservas vigentes del grupo, incluida la que se está viendo. */
  filas: ReservaHotel[];
  seleccionada: string;
  ventas: Map<string, VentaConMovimientos>;
  onElegir: (r: ReservaHotel) => void;
}

/**
 * Selector del grupo: una píldora por habitación (nombre, que puede ocupar dos líneas para distinguir «Cabaña Familiar Piscina #2» de «#3»; y debajo personas y precio), en cuadrícula, para que con muchas
 * habitaciones no se alargue. El punto indica lo pagado a esa habitación. Al tocar una se elige para verla y editarla.
 */
export function GrupoResumen({ filas, seleccionada, ventas, onElegir }: Props) {
  const datos = filas.map((f) => ({ f, total: totalConExtras(f), venta: f.venta_id ? ventas.get(f.venta_id) : undefined }));
  return (
    <section aria-label="Habitaciones del grupo">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
        {datos.map(({ f, total, venta }) => {
          const propio = (venta?.movimientos ?? []).reduce((a, m) => {
            const at = m.tipo === 'pago' && !m.anulado ? atribucionDePago(m.motivo) : null;
            return at?.destino === f.id ? a + (m.monto ?? 0) : a;
          }, 0);
          const activa = f.id === seleccionada;
          const punto = propio <= EPS ? null : propio + EPS >= total ? 'bg-success' : 'bg-warning';
          return (
            <li key={f.id} className="min-w-0">
              <button type="button" onClick={() => onElegir(f)} aria-pressed={activa}
                title={`${f.cabana} · ${plural(f.adultos + f.ninos, 'persona', 'personas')} · ${dinero(total)}${propio > EPS ? ` · pagó ${dinero(propio)}` : ''}`}
                className={cn(
                  'w-full min-h-[3.25rem] pointer-coarse:min-h-14 px-3.5 py-2 rounded-2xl border flex flex-col justify-center gap-0.5 text-left transition-colors cursor-pointer active:scale-[0.98]',
                  activa ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-foreground hover:border-primary hover:bg-primary-soft',
                )}>
                <span className="flex items-start gap-1.5 min-w-0">
                  {punto && <span aria-hidden className={cn('size-2 rounded-full shrink-0 ring-2 mt-1.5', punto, activa ? 'ring-primary-foreground/40' : 'ring-card')} />}
                  <span className="t-cuerpo-fuerte line-clamp-2 break-words leading-tight">{f.cabana}</span>
                </span>
                <span className={cn('t-meta tabular-nums flex items-center gap-2 min-w-0', activa ? 'text-primary-foreground/85' : 'text-muted-foreground')}>
                  <span className="inline-flex items-center gap-0.5 shrink-0" aria-label={plural(f.adultos, 'adulto', 'adultos')}><User size={13} weight="bold" aria-hidden />{f.adultos}</span>
                  {f.ninos > 0 && <span className="inline-flex items-center gap-0.5 shrink-0" aria-label={plural(f.ninos, 'niño', 'niños')}><Baby size={13} weight="bold" aria-hidden />{f.ninos}</span>}
                  <b className={cn('ml-auto font-semibold truncate', activa ? 'text-primary-foreground' : 'text-foreground')}>{dinero(total)}</b>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
