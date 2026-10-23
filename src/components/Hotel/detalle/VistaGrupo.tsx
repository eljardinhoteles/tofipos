import { Baby, Bed, CalendarBlank, ForkKnife, User } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { EstadoBadge } from '../../Common/EstadoBadge';
import type { VentaConMovimientos } from '../../../lib/ventaConMovimientos';
import { totalConExtras, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { atribucionDePago } from '../../../lib/hotelCobros';
import { EPS, dinero, plural } from './formatos';

interface Props {
  filas: ReservaHotel[];
  ventas: Map<string, VentaConMovimientos>;
  onElegir: (r: ReservaHotel) => void;
}

/** Todas las habitaciones del grupo en una lista con sus datos, para comprobar cómo quedaron acomodadas. Al tocar una se abre su detalle. */
export function VistaGrupo({ filas, ventas, onElegir }: Props) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Habitaciones del grupo">
      {filas.map((f) => {
        const total = totalConExtras(f);
        const venta = f.venta_id ? ventas.get(f.venta_id) : undefined;
        const pagado = (venta?.movimientos ?? []).reduce((a, m) => {
          const at = m.tipo === 'pago' && !m.anulado ? atribucionDePago(m.motivo) : null;
          return at?.destino === f.id ? a + (m.monto ?? 0) : a;
        }, 0);
        const extras = f.extras.filter((e) => e.monto > 0 && e.origen !== 'plan').length;
        const noches = dayjs(f.salida).diff(dayjs(f.llegada), 'day');
        return (
          <li key={f.id}>
            <button type="button" onClick={() => onElegir(f)} className="w-full text-left rounded-2xl border border-border bg-card px-4 py-3 flex flex-col gap-2 cursor-pointer hover:border-primary transition-colors">
              <span className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <Bed size={18} className="text-muted-foreground shrink-0" aria-hidden />
                  <span className="t-fila break-words">{f.cabana}</span>
                  {f.cama && <span className="t-meta text-muted-foreground break-words">· {f.cama}</span>}
                </span>
                <span className="t-valor tabular-nums shrink-0">{dinero(total)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 t-meta text-muted-foreground">
                <span className="flex items-center gap-1"><CalendarBlank size={14} aria-hidden /><span className="capitalize">{dayjs(f.llegada).format('ddd D MMM')} → {dayjs(f.salida).format('ddd D MMM')}</span> · {plural(noches, 'noche', 'noches')}</span>
                <span className="flex items-center gap-1" aria-label={plural(f.adultos, 'adulto', 'adultos')}><User size={14} aria-hidden />{f.adultos}</span>
                {f.ninos > 0 && <span className="flex items-center gap-1" aria-label={plural(f.ninos, 'niño', 'niños')}><Baby size={14} aria-hidden />{f.ninos}</span>}
                {f.plan_alimentacion && <span className="flex items-center gap-1"><ForkKnife size={14} aria-hidden />{f.plan_alimentacion.nombre}</span>}
                {extras > 0 && <span>{plural(extras, 'extra', 'extras')}</span>}
              </span>
              {(pagado > EPS || f.sync_estado !== 'sincronizada') && (
                <span className="flex flex-wrap items-center gap-1.5">
                  {pagado > EPS && <EstadoBadge tono={pagado + EPS >= total ? 'success' : 'warning'}>{pagado + EPS >= total ? 'Pagada' : `Pagó ${dinero(pagado)}`}</EstadoBadge>}
                  {f.sync_estado === 'pendiente' && <EstadoBadge tono="warning">Sin subir a Cloudbeds</EstadoBadge>}
                  {f.sync_estado === 'error' && <EstadoBadge tono="destructive">Error en Cloudbeds</EstadoBadge>}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
