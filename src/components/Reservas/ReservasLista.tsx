import { useMemo } from 'react';
import { CalendarBlank, Users } from '@phosphor-icons/react';
import { type Reserva, type Mesa } from '../../db/database';
import { ReservaCard } from './ReservaCard';
import { codigosReserva, toISO } from './reservaUtils';

interface ReservasListaProps {
  reservas: Reserva[];
  mesas: Mesa[];
  search: string;
  onCardClick: (id: string) => void;
  onAssign: (r: Reserva) => void;
}

const etiquetaDia = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const dias = Math.round((d.getTime() - hoy.getTime()) / 86_400_000);
  const largo = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  if (dias === 0) return { principal: 'Hoy', detalle: largo };
  if (dias === 1) return { principal: 'Mañana', detalle: largo };
  return { principal: largo, detalle: '' };
};

// Vista alternativa del calendario (cómoda en celular): de hoy en adelante, las
// reservas agrupadas por día en tarjetas, ordenadas por hora.
export function ReservasLista({ reservas, mesas, search, onCardClick, onAssign }: ReservasListaProps) {
  const codigos = useMemo(() => codigosReserva(reservas), [reservas]);
  const mesaPorId = useMemo(() => new Map(mesas.map(m => [m.id, m.nombre])), [mesas]);

  const grupos = useMemo(() => {
    const hoy = toISO(new Date());
    const q = search.trim().toLowerCase();
    const porDia = new Map<string, Reserva[]>();
    reservas
      .filter(r => r.fecha >= hoy && (!q || r.nombre.toLowerCase().includes(q)))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))
      .forEach(r => porDia.set(r.fecha, [...(porDia.get(r.fecha) ?? []), r]));
    return [...porDia.entries()];
  }, [reservas, search]);

  if (grupos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8 bg-background">
        <CalendarBlank size={44} className="text-muted-foreground/40" />
        <span className="font-bold text-sm text-foreground">{search.trim() ? 'Sin resultados' : 'No hay reservas próximas'}</span>
        <span className="text-xs text-muted-foreground">
          {search.trim() ? 'Prueba con otro nombre.' : 'Las reservas de hoy en adelante aparecerán aquí.'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      {grupos.map(([fecha, items]) => {
        const { principal, detalle } = etiquetaDia(fecha);
        const personas = items.reduce((s, r) => s + (r.personas || 0), 0);
        return (
          <section key={fecha}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2.5 bg-muted border-b border-border">
              <div className="flex items-baseline gap-2 min-w-0">
                <h3 className="font-extrabold text-sm text-foreground first-letter:uppercase truncate">{principal}</h3>
                {detalle && <span className="text-xs font-semibold text-muted-foreground first-letter:uppercase truncate">{detalle}</span>}
              </div>
              <span className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground shrink-0">
                <span className="flex items-center gap-1"><CalendarBlank size={13} /> {items.length}</span>
                <span className="flex items-center gap-1"><Users size={13} /> {personas}</span>
              </span>
            </div>
            <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map(r => (
                <ReservaCard
                  key={r.id}
                  reserva={r}
                  completa
                  codigo={codigos[r.id]}
                  mesaNombre={r.mesa_id ? mesaPorId.get(r.mesa_id) : undefined}
                  onClick={() => onCardClick(r.id)}
                  onAssign={() => onAssign(r)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
