import { CalendarCheck, Users } from '@phosphor-icons/react';
import { type Reserva, type Piso, type Mesa } from '../../db/database';
import { isToday, isWeekend, toISO } from './reservaUtils';
import { CalendarCell } from './CalendarCell';

interface CalendarGridProps {
  visibleDates: Date[];
  reservas: Reserva[] | undefined;
  zonasRows: Piso[] | undefined;
  mesas: Mesa[] | undefined;
  search: string;
  highlightedId: string | null;
  onCellClick: (date: Date, zonaId: string | undefined) => void;
  onCardClick: (id: string) => void;
  onAssign: (r: Reserva) => void;
  onCancel: (id: string) => void;
}

export function CalendarGrid({
  visibleDates,
  reservas,
  zonasRows,
  mesas,
  search,
  highlightedId,
  onCellClick,
  onCardClick,
  onAssign,
  onCancel
}: CalendarGridProps) {
  const DATE_COL_MIN = 200;
  const gridColumns = `140px repeat(${visibleDates.length}, minmax(${DATE_COL_MIN}px, 1fr))`;
  const gridMinWidth = 140 + (visibleDates.length * DATE_COL_MIN);

  const codigoMap = (() => {
    const map: Record<string, string> = {};
    if (!reservas) return map;
    const sorted = [...reservas].sort((a, b) => {
      if (a.created_at !== b.created_at) {
        return a.created_at.localeCompare(b.created_at);
      }
      return a.id.localeCompare(b.id);
    });
    sorted.forEach((r, idx) => {
      map[r.id] = `R${idx + 1}`;
    });
    return map;
  })();

  return (
    <div className="flex-1 w-full overflow-hidden bg-muted relative">
      <div className="w-full h-full overflow-auto">
        <div style={{ display: 'grid', gridTemplateColumns: gridColumns, minWidth: `${gridMinWidth}px` }}>
          {/* Header */}
          <div className="h-12 bg-background border-b border-r border-border" />
          {visibleDates.map(date => {
            const ds = toISO(date);
            const dayReservasAll = (reservas || []).filter(r => r.fecha === ds);
            const dayCount = dayReservasAll.length;
            const peopleCount = dayReservasAll.reduce((sum, r) => sum + (r.personas || 0), 0);
            const today = isToday(date);

            return (
              <div
                key={date.toISOString()}
                className={`h-12 px-3 bg-background border-b border-r border-border flex items-center justify-between font-bold text-xs ${today ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
              >
                <div className="flex items-baseline gap-1">
                  <span className="uppercase text-[10px] text-muted-foreground">
                    {date.toLocaleDateString('es-ES', { weekday: 'short' })}
                  </span>
                  <span className="text-base font-black leading-none">{date.getDate()}</span>
                </div>

                {dayCount > 0 ? (
                  <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <CalendarCheck size={13} className="text-primary" />
                      <span>{dayCount}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users size={13} className="text-muted-foreground" />
                      <span>{peopleCount}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-[9px] font-bold uppercase text-muted-foreground/60">LIBRE</span>
                )}
              </div>
            );
          })}

          {/* Grid Body */}
          {(!zonasRows ? Array.from({ length: 6 }, (_, i) => ({ id: `skel-${i}`, nombre: '', orden: i })) : zonasRows).map((zona) => (
            <div key={`row-group-${zona.id}`} className="contents">
              <div key={`zona-${zona.id}`} className="p-3 bg-background border-b border-r border-border flex flex-col justify-center">
                <span className="font-extrabold text-xs text-foreground truncate">{zona.nombre}</span>
                {zona.id !== 'sin_zona' && mesas && (
                  <span className="text-[9px] font-bold uppercase text-muted-foreground mt-0.5">
                    {mesas.filter(m => m.piso === zona.nombre).length} mesas
                  </span>
                )}
              </div>

              {visibleDates.map(date => {
                const ds = toISO(date);
                const q = search.trim().toLowerCase();
                const dayReservas = (reservas || [])
                  .filter(r => r.fecha === ds && (zona.id === 'sin_zona' ? !r.zona_id : r.zona_id === zona.id))
                  .filter(r => !q || r.nombre.toLowerCase().includes(q))
                  .sort((a, b) => a.hora.localeCompare(b.hora));

                return (
                  <CalendarCell
                    key={`${zona.id}-${ds}`}
                    isToday={isToday(date)}
                    isWeekend={isWeekend(date)}
                    dayReservas={dayReservas}
                    highlightedId={highlightedId}
                    onCellClick={() => onCellClick(date, zona.id === 'sin_zona' ? undefined : zona.id)}
                    onCardClick={onCardClick}
                    onAssign={onAssign}
                    onCancel={onCancel}
                    codigoMap={codigoMap}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
