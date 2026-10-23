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
 * Vista compacta del grupo: una cuadrícula de mini tarjetas de dos líneas (habitación; adultos, niños y precio), una por
 * habitación. El punto de la tarjeta indica lo pagado a esa habitación; Al tocar una tarjeta se
 * elige la habitación para verla y editarla, sin cambiar de pestaña.
 */
export function GrupoResumen({ filas, seleccionada, ventas, onElegir }: Props) {
  const datos = filas.map((f) => ({ f, total: totalConExtras(f), ventaId: f.venta_id, venta: f.venta_id ? ventas.get(f.venta_id) : undefined }));
  return (
    <section className="flex flex-col gap-2" aria-label="Habitaciones del grupo">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] gap-1.5">
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
                  'w-full min-h-12 px-3 py-1.5 rounded-xl border flex flex-col justify-between text-left transition-colors cursor-pointer',
                  activa ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary',
                )}>
                <span className="flex items-start gap-1.5 min-w-0">
                  {punto && <span aria-hidden className={cn('size-2 rounded-full shrink-0 mt-1.5', punto)} />}
                  <span className="t-cuerpo-fuerte line-clamp-2 break-words leading-tight">{f.cabana}</span>
                </span>
                <span className={cn('t-meta tabular-nums flex items-center gap-x-2 mt-0.5 min-w-0', activa ? 'text-primary-foreground/85' : 'text-muted-foreground')}>
                  <span className="flex items-center gap-0.5 shrink-0" aria-label={plural(f.adultos, 'adulto', 'adultos')}><User size={13} weight="bold" aria-hidden />{f.adultos}</span>
                  {f.ninos > 0 && <span className="flex items-center gap-0.5 shrink-0" aria-label={plural(f.ninos, 'niño', 'niños')}><Baby size={13} weight="bold" aria-hidden />{f.ninos}</span>}
                  <b className={cn('ml-auto truncate', activa ? 'text-primary-foreground' : 'text-foreground')}>{dinero(total)}</b>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
