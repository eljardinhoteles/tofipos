import { useMemo, useState } from 'react';
import { CalendarBlank, MagnifyingGlass, Users } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { type Reserva, type Mesa } from '../../db/database';
import { ReservaCard } from './ReservaCard';
import { codigosReserva, toISO } from './reservaUtils';

interface ReservasListaProps {
  reservas: Reserva[];
  mesas: Mesa[];
  /** Reserva abierta en el sidebar: su tarjeta lleva el aro de activa. */
  activaId?: string | null;
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
export function ReservasLista({ reservas, mesas, activaId, onCardClick, onAssign }: ReservasListaProps) {
  // El buscador vive aquí (no en el header): busca entre las próximas reservas por nombre.
  const [search, setSearch] = useState('');
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

  const buscador = (
    <div className="px-4 pt-3 pb-1 shrink-0">
      <div className="relative">
        <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input type="search" aria-label="Buscar reserva" placeholder="Buscar reserva por nombre" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-11 text-base" />
      </div>
    </div>
  );

  if (grupos.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-background min-h-0">
        {buscador}
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
        <img src={search.trim() ? '/no_resultado.webp' : '/Reservas.webp'} alt="" aria-hidden="true" className="size-28 object-contain" />
        <span className="t-cuerpo-fuerte text-foreground">{search.trim() ? 'Sin resultados' : 'No hay reservas próximas'}</span>
        <span className="t-meta text-muted-foreground">
          {search.trim() ? 'Prueba con otro nombre.' : 'Las reservas de hoy en adelante aparecerán aquí.'}
        </span>
      </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
    {buscador}
    <div className="flex-1 overflow-y-auto">
      {grupos.map(([fecha, items]) => {
        const { principal, detalle } = etiquetaDia(fecha);
        const personas = items.reduce((s, r) => s + (r.personas || 0), 0);
        return (
          <section key={fecha}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2.5 bg-muted border-b border-border">
              <div className="flex items-baseline gap-2 min-w-0">
                <h3 className="t-cuerpo-fuerte text-foreground first-letter:uppercase truncate">{principal}</h3>
                {detalle && <span className="t-meta text-muted-foreground first-letter:uppercase truncate">{detalle}</span>}
              </div>
              <span className="flex items-center gap-2 t-meta text-muted-foreground shrink-0">
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
                  isHighlighted={r.id === activaId}
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
    </div>
  );
}
