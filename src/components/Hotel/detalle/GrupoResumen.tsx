import { UsersThree } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { EstadoBadge } from '../../Common/EstadoBadge';
import type { VentaConMovimientos } from '../../../lib/ventaConMovimientos';
import { totalConExtras, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { atribucionDePago } from '../../../lib/hotelCobros';
import { dinero, plural, totalesGrupo } from './formatos';

interface Props {
  /** Reservas vigentes del grupo, incluida la que se está viendo. */
  filas: ReservaHotel[];
  seleccionada: string;
  ventas: Map<string, VentaConMovimientos>;
  onElegir: (r: ReservaHotel) => void;
}

/** Vista única del grupo: todas las cabañas con su total y estado de pago. Al tocar una se elige para editarla. */
export function GrupoResumen({ filas, seleccionada, ventas, onElegir }: Props) {
  const datos = filas.map((f) => ({ f, total: totalConExtras(f), ventaId: f.venta_id, venta: f.venta_id ? ventas.get(f.venta_id) : undefined }));
  const tot = totalesGrupo(datos);
  return (
    <section className="flex flex-col gap-3">
      <h3 className="t-fila flex items-center gap-2"><UsersThree size={18} className="text-primary shrink-0" /> Grupo · {plural(filas.length, 'cabaña', 'cabañas')}</h3>
      <ul className="flex flex-col gap-1.5">
        {datos.map(({ f, total, venta }) => {
          // Pagos asignados a esta cabaña (los de «todo el grupo» se ven en el total del grupo).
          const propio = (venta?.movimientos ?? []).reduce((a, m) => {
            const at = m.tipo === 'pago' && !m.anulado ? atribucionDePago(m.motivo) : null;
            return at?.destino === f.id ? a + (m.monto ?? 0) : a;
          }, 0);
          const activa = f.id === seleccionada;
          return (
            <li key={f.id}>
              <button type="button" onClick={() => onElegir(f)} aria-pressed={activa}
                className={`w-full min-h-11 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${activa ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary'}`}>
                <span className="flex flex-col min-w-0">
                  <span className="t-cuerpo-fuerte truncate">{f.cabana}</span>
                  <span className="t-meta text-muted-foreground truncate">
                    {dayjs(f.llegada).format('D MMM')} → {dayjs(f.salida).format('D MMM')} · {plural(f.adultos + f.ninos, 'huésped', 'huéspedes')}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {propio > 0 && <EstadoBadge tono="success">Pagó {dinero(propio)}</EstadoBadge>}
                  <span className="t-cuerpo-fuerte tabular-nums">{dinero(total)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <span className="t-cuerpo-fuerte">Total del grupo</span>
        <span className="flex flex-col items-end">
          <span className="t-valor tabular-nums">{dinero(tot.total)}</span>
          <span className="t-meta text-muted-foreground">Pagado {dinero(tot.pagado)} · Saldo {dinero(tot.saldo)}</span>
        </span>
      </div>
    </section>
  );
}
