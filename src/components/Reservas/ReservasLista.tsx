import { useMemo, useRef, useState } from 'react';
import { CalendarBlank, MagnifyingGlass, Users } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { type Reserva, type Mesa } from '../../db/database';
import { ReservaCard } from './ReservaCard';
import { cn } from '@/lib/utils';
import { codigosReserva, toISO } from './reservaUtils';

interface ReservasListaProps {
  reservas: Reserva[];
  /** Zonas del restaurante, en su orden: dentro de cada día las reservas se agrupan por zona. */
  zonas: Array<{ id: string; nombre: string; orden?: number }>;
  mesas: Mesa[];
  /** Total del pedido de cada reserva (id → total). */
  totalPorReserva?: Map<string, number>;
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
export function ReservasLista({ reservas, zonas, mesas, totalPorReserva, activaId, onCardClick, onAssign }: ReservasListaProps) {
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

  // Tira de días: hoy y los 13 siguientes, cada uno con cuántas reservas tiene. Tocar un día salta a su sección en la lista.
  const secciones = useRef<Record<string, HTMLElement | null>>({});
  const [diaActivo, setDiaActivo] = useState<string | null>(null);
  const tira = useMemo(() => {
    const cuenta = new Map(grupos.map(([fecha, items]) => [fecha, items.length]));
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i);
      const fecha = toISO(d);
      return { fecha, d, n: cuenta.get(fecha) ?? 0 };
    });
  }, [grupos]);
  const irADia = (fecha: string) => {
    setDiaActivo(fecha);
    secciones.current[fecha]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const ordenZona = useMemo(() => new Map(zonas.map((z, i) => [z.id, { nombre: z.nombre, pos: z.orden ?? i }])), [zonas]);
  // Las reservas de un día agrupadas por zona (en el orden de las zonas; «Sin zona» al final), cada grupo por hora.
  const porZona = (items: Reserva[]) => {
    const m = new Map<string, Reserva[]>();
    items.forEach(r => { const k = r.zona_id && ordenZona.has(r.zona_id) ? r.zona_id : 'sin_zona'; m.set(k, [...(m.get(k) ?? []), r]); });
    return [...m.entries()]
      .map(([id, lista]) => ({ id, nombre: ordenZona.get(id)?.nombre ?? 'Sin zona', pos: ordenZona.get(id)?.pos ?? 9999, lista }))
      .sort((a, b) => a.pos - b.pos);
  };

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

  const tiraDias = (
    <div className="shrink-0 flex gap-2 overflow-x-auto hide-scrollbar px-4 py-2" role="tablist" aria-label="Días">
      {tira.map(({ fecha, d, n }, i) => {
        const activo = (diaActivo ?? tira.find(t => t.n > 0)?.fecha) === fecha;
        return (
          <button
            key={fecha} type="button" role="tab" aria-selected={activo} disabled={n === 0} onClick={() => irADia(fecha)}
            className={cn('shrink-0 w-14 py-2 rounded-2xl flex flex-col items-center gap-0.5 border transition-colors',
              n === 0 ? 'bg-transparent border-transparent opacity-50'
                : activo ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border cursor-pointer')}
          >
            <span className="t-etiqueta uppercase">{i === 0 ? 'Hoy' : d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}</span>
            <span className="t-fila leading-none">{d.getDate()}</span>
            <span className={cn('min-w-5 h-5 px-1 rounded-full flex items-center justify-center t-dato leading-none',
              n === 0 ? 'text-muted-foreground' : activo ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground')}>{n === 0 ? '·' : n}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
    {buscador}
    {tiraDias}
    <div className="flex-1 overflow-y-auto">
      {grupos.map(([fecha, items]) => {
        const { principal, detalle } = etiquetaDia(fecha);
        const personas = items.reduce((s, r) => s + (r.personas || 0), 0);
        const esHoy = principal === 'Hoy';
        const esManana = principal === 'Mañana';
        return (
          <section key={fecha} ref={(el) => { secciones.current[fecha] = el; }}>
            <div className={cn('sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border',
              esHoy ? 'bg-primary/15' : esManana ? 'bg-primary/[0.07]' : 'bg-muted')}>
              <div className="flex items-baseline gap-2 min-w-0">
                <h3 className={cn('t-cuerpo-fuerte first-letter:uppercase truncate', esHoy ? 'text-primary' : 'text-foreground')}>{principal}</h3>
                {detalle && <span className="t-meta text-muted-foreground first-letter:uppercase truncate">{detalle}</span>}
              </div>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-border t-dato text-foreground"><CalendarBlank size={13} /> {items.length}</span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-border t-dato text-foreground"><Users size={13} /> {personas}</span>
              </span>
            </div>
            <div className="flex flex-col gap-4 p-3">
              {porZona(items).map(z => (
                <div key={z.id} className="flex flex-col gap-2">
                  <span className="t-etiqueta text-muted-foreground px-1">{z.nombre}</span>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {z.lista.map(r => (
                      <ReservaCard
                        key={r.id}
                        reserva={r}
                        completa
                        isHighlighted={r.id === activaId}
                        codigo={codigos[r.id]}
                        mesaNombre={r.mesa_id ? mesaPorId.get(r.mesa_id) : undefined}
                        total={totalPorReserva?.get(r.id)}
                        onClick={() => onCardClick(r.id)}
                        onAssign={() => onAssign(r)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
    </div>
  );
}
