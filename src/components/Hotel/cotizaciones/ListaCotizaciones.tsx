import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { FileText, Trash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { EstadoBadge, type TonoEstado } from '../../Common/EstadoBadge';
import { estadoEfectivo, numeroCotizacion, type Cotizacion, type EstadoCotizacion } from '../../../lib/hotelCotizacionesApi';

const dinero = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADO: Record<EstadoCotizacion, { etiqueta: string; tono: TonoEstado }> = {
  vigente: { etiqueta: 'Vigente', tono: 'success' },
  vencida: { etiqueta: 'Vencida', tono: 'neutral' },
  convertida: { etiqueta: 'Convertida', tono: 'info' },
};

/** «Vence en 31 h», «Vence en 40 min» o «Venció hace 3 h». */
function textoVigencia(c: Cotizacion, ahora: number): string {
  const ms = Date.parse(c.vence_at) - ahora;
  const abs = Math.abs(ms);
  const horas = Math.floor(abs / 3600_000);
  const cuanto = horas >= 1 ? `${horas} h` : `${Math.max(1, Math.round(abs / 60_000))} min`;
  return ms >= 0 ? `Vence en ${cuanto}` : `Venció hace ${cuanto}`;
}

interface Props {
  cotizaciones: Cotizacion[];
  busqueda: string;
  onAbrir: (c: Cotizacion) => void;
  onBorrar: (c: Cotizacion) => void;
}

/** Lista de cotizaciones guardadas (Reservas › Cotizaciones): se busca por número o cliente, y al tocar una se abre para verla y enviarla. */
export function ListaCotizaciones({ cotizaciones, busqueda, onAbrir, onBorrar }: Props) {
  const ahora = Date.now();
  const q = busqueda.trim().toLowerCase();
  const visibles = cotizaciones.filter((c) => !q || `${numeroCotizacion(c.numero)} ${c.cliente.nombre} ${c.lineas.map((l) => l.nombre).join(' ')}`.toLowerCase().includes(q));

  return (
    <section aria-label="Lista de cotizaciones" className="mx-4 sm:mx-6 mb-[calc(env(safe-area-inset-bottom)+96px)] md:mb-4 lg:mb-6 rounded-2xl border border-border bg-card overflow-hidden flex flex-col lg:flex-1 lg:min-h-0">
      <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
        {visibles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
            <span className="size-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground"><FileText size={24} aria-hidden /></span>
            <h2 className="t-titulo text-foreground">{q ? 'Ninguna cotización coincide' : 'Aún no hay cotizaciones'}</h2>
            <p className="t-meta text-muted-foreground">{q ? 'Prueba con otro número o nombre.' : 'Crea una con «Cotizar», arriba a la derecha. Vale 48 horas y no reserva las habitaciones.'}</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_var(--border)] t-etiqueta text-muted-foreground">
              <tr>
                <th className="px-3 sm:px-6 py-3.5">Cotización</th>
                <th className="px-3 sm:px-6 py-3.5 hidden md:table-cell">Estadía</th>
                <th className="px-3 sm:px-6 py-3.5 hidden lg:table-cell">Habitaciones</th>
                <th className="px-3 sm:px-6 py-3.5">Estado</th>
                <th className="w-px whitespace-nowrap px-3 sm:px-6 py-3.5 text-right">Total</th>
                <th className="w-px px-3 py-3.5"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibles.map((c) => {
                const estado = estadoEfectivo(c, ahora);
                const noches = dayjs(c.salida).diff(dayjs(c.llegada), 'day');
                return (
                  <tr key={c.id} tabIndex={0} onClick={() => onAbrir(c)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(c); } }}
                    aria-label={`Abrir la cotización ${numeroCotizacion(c.numero)} de ${c.cliente.nombre}`}
                    className="cursor-pointer hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary transition-colors">
                    <td className="px-3 sm:px-6 py-3 h-14">
                      <div className="flex flex-col min-w-0">
                        <span className="t-fila text-foreground truncate">{c.cliente.nombre || 'Sin nombre'}</span>
                        <span className="t-meta text-muted-foreground tabular-nums">{numeroCotizacion(c.numero)} · {dayjs(c.created_at).locale('es').format('D MMM HH:mm')}</span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 hidden md:table-cell">
                      <div className="flex flex-col">
                        <span className="t-cuerpo text-foreground tabular-nums whitespace-nowrap">{c.referencial ? 'Fechas por definir' : `${dayjs(c.llegada).format('DD/MM')} → ${dayjs(c.salida).format('DD/MM/YY')}`}</span>
                        <span className="t-meta text-muted-foreground">{noches} {noches === 1 ? 'noche' : 'noches'}{c.referencial ? ' · referencial' : ''}</span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 hidden lg:table-cell"><span className="t-cuerpo text-foreground line-clamp-2">{c.lineas.map((l) => l.nombre).join(', ')}</span></td>
                    <td className="px-3 sm:px-6 py-3">
                      <div className="flex flex-col items-start gap-0.5">
                        <EstadoBadge tono={ESTADO[estado].tono}>{ESTADO[estado].etiqueta}</EstadoBadge>
                        {estado !== 'convertida' && <span className="t-meta text-muted-foreground whitespace-nowrap">{textoVigencia(c, ahora)}</span>}
                      </div>
                    </td>
                    <td className="w-px whitespace-nowrap px-3 sm:px-6 py-3 text-right"><span className="t-cuerpo-fuerte tabular-nums">{dinero(c.total)}</span></td>
                    <td className="w-px px-2 py-3">
                      <Button type="button" variant="ghost" size="icon" title="Borrar la cotización" aria-label={`Borrar la cotización ${numeroCotizacion(c.numero)}`}
                        onClick={(e) => { e.stopPropagation(); onBorrar(c); }} className="size-11 text-muted-foreground hover:text-destructive touch-manipulation"><Trash size={18} /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
