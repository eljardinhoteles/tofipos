import { CalendarCheck, CaretLeft, CaretRight, Users } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useControlesDeBorde } from '../../hooks/useControlesDeBorde';
import { type Reserva, type Piso, type Mesa } from '../../db/database';
import { isToday, isWeekend, toISO } from './reservaUtils';
import { CalendarCell } from './CalendarCell';
import { MarcaFeriado } from '../Common/MarcaFeriado';
import { CalendarEsquinaFecha, CalendarEsquinaNav } from './CalendarToolbar';

// Alto de la fila de meses de la cabecera (borde inferior incluido); la fila de días queda pegada debajo.
const ALTO_FILA_MES = 'h-11';
// Sombra continua a la derecha de la columna fija de zonas: cada celda la proyecta con un degradado y, al estar una sobre otra, se unen.
const SOMBRA_COLUMNA = "after:content-[''] after:absolute after:-top-px after:-bottom-px after:left-full after:w-2.5 after:pointer-events-none after:bg-linear-to-r after:from-black/[0.09] after:to-transparent";

interface CalendarGridProps {
  startDate: Date;
  setStartDate: (d: Date) => void;
  shiftDays: (n: number) => void;
  goToday: () => void;
  visibleDates: Date[];
  reservas: Reserva[] | undefined;
  zonasRows: Piso[] | undefined;
  mesas: Mesa[] | undefined;
  /** Total del pedido de cada reserva (id → total). */
  totalPorReserva?: Map<string, number>;
  search: string;
  highlightedId: string | null;
  onCellClick: (date: Date, zonaId: string | undefined) => void;
  onCardClick: (id: string) => void;
  onAssign: (r: Reserva) => void;
  onCancel: (id: string) => void;
}

export function CalendarGrid({
  startDate,
  setStartDate,
  shiftDays,
  goToday,
  visibleDates,
  reservas,
  zonasRows,
  mesas,
  totalPorReserva,
  search,
  highlightedId,
  onCellClick,
  onCardClick,
  onAssign,
  onCancel
}: CalendarGridProps) {
  const ZONE_COL = 190;
  const DATE_COL_MIN = 260;
  const gridColumns = `${ZONE_COL}px repeat(${visibleDates.length}, minmax(${DATE_COL_MIN}px, 1fr))`;
  const gridMinWidth = ZONE_COL + (visibleDates.length * DATE_COL_MIN);

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

  const mesaPorId = new Map((mesas || []).map(m => [m.id, m.nombre]));

  // Un tramo por mes visible, para la fila de arriba de la cabecera.
  const tramosMes = visibleDates.reduce<Array<{ clave: string; inicio: number; cuantos: number; fecha: Date }>>((acc, d, i) => {
    const clave = `${d.getFullYear()}-${d.getMonth()}`;
    const ultimo = acc[acc.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.cuantos += 1; else acc.push({ clave, inicio: i, cuantos: 1, fecha: d });
    return acc;
  }, []);

  // Botones flotantes en los bordes (solo con ratón): avanzan o retroceden un día y repiten al mantener pulsado.
  const { bordeCerca, pulsar, soltar, alMover, salir } = useControlesDeBorde((dir) => shiftDays(dir), ZONE_COL);

  return (
    <div className="flex-1 w-full overflow-hidden bg-muted relative" onPointerMove={alMover} onPointerLeave={salir}>
      <div className="w-full h-full overflow-auto">
        {/* En celular la barra inferior flota sobre el contenido: el espacio al final deja subir la última fila por encima de ella. */}
        <div className="pb-[calc(env(safe-area-inset-bottom)+7.5rem)] md:pb-0" style={{ display: 'grid', gridTemplateColumns: gridColumns, minWidth: `${gridMinWidth}px` }}>
          {/* Esquina: arriba el rango visible (a la altura de los meses), abajo ‹ Hoy › (a la altura de los días); cada control es una celda. */}
          <div className={cn('sticky top-0 left-0 z-30 bg-card border-b border-border/70', ALTO_FILA_MES, SOMBRA_COLUMNA)} style={{ gridRow: 1, gridColumn: 1 }}>
            <CalendarEsquinaFecha startDate={startDate} setStartDate={setStartDate} visibleDates={visibleDates} />
          </div>
          <div className={cn('sticky top-11 left-0 z-30 bg-card border-b border-border', SOMBRA_COLUMNA)} style={{ gridRow: 2, gridColumn: 1 }}>
            <CalendarEsquinaNav shiftDays={shiftDays} goToday={goToday} />
          </div>

          {/* Fila de meses */}
          {tramosMes.map((m, k) => (
            <div
              key={m.clave}
              style={{ gridRow: 1, gridColumn: `${m.inicio + 2} / span ${m.cuantos}` }}
              className={cn('sticky top-0 z-20 px-3 flex items-center border-b border-border/70 t-etiqueta text-foreground', ALTO_FILA_MES, k > 0 && 'border-l-2 border-border', k % 2 === 0 ? 'bg-muted/60' : 'bg-muted')}
            >
              <span className="truncate first-letter:uppercase">
                {m.fecha.toLocaleDateString('es-ES', { month: m.cuantos >= 4 ? 'long' : 'short', year: 'numeric' }).replace('.', '')}
              </span>
            </div>
          ))}

          {/* Fila de días: nombre, número y cuántas reservas/personas hay (todas las celdas llevan las tres líneas: no cambian de alto). */}
          {visibleDates.map((date, i) => {
            const ds = toISO(date);
            const dayReservasAll = (reservas || []).filter(r => r.fecha === ds);
            const dayCount = dayReservasAll.length;
            const peopleCount = dayReservasAll.reduce((sum, r) => sum + (r.personas || 0), 0);
            const today = isToday(date);
            return (
              <div
                key={date.toISOString()}
                style={{ gridRow: 2, gridColumn: i + 2 }}
                className={cn('sticky top-11 z-20 py-1.5 px-2 flex flex-col items-center gap-0 border-b border-border',
                  today ? 'bg-primary/20' : 'bg-card',
                  i > 0 && !tramosMes.some(m => m.inicio === i) && 'border-l border-border/70',
                  tramosMes.some(m => m.inicio === i) && i > 0 && 'border-l-2 border-border')}
              >
                <MarcaFeriado fecha={ds} posicion="top-1 right-1" />
                <span className={cn('t-etiqueta uppercase truncate max-w-full px-0.5', today ? 'text-foreground' : 'text-muted-foreground')}>
                  {date.toLocaleDateString('es-ES', { weekday: today ? 'long' : 'short' }).replace('.', '')}
                </span>
                <span className={cn('t-fila min-w-8 text-center rounded-lg px-1.5', today ? 'bg-nav text-nav-foreground' : 'text-foreground')}>{date.getDate()}</span>
                {dayCount > 0 ? (
                  <span className="flex w-full items-center justify-between gap-2 px-1 t-meta text-muted-foreground">
                    <span className="flex items-center gap-1"><CalendarCheck size={13} /> {dayCount}</span>
                    <span className="flex items-center gap-1"><Users size={13} /> {peopleCount}</span>
                  </span>
                ) : (
                  <span className="t-meta text-muted-foreground/70">Libre</span>
                )}
              </div>
            );
          })}

          {/* Grid Body */}
          {(!zonasRows ? Array.from({ length: 6 }, (_, i) => ({ id: `skel-${i}`, nombre: '', orden: i })) : zonasRows).map((zona) => (
            <div key={`row-group-${zona.id}`} className="contents">
              <div key={`zona-${zona.id}`} className={cn('sticky left-0 z-10 p-3 bg-background border-b border-border flex flex-col justify-center', SOMBRA_COLUMNA)}>
                <span className="t-cuerpo-fuerte text-foreground truncate">{zona.nombre}</span>
                {zona.id !== 'sin_zona' && mesas && (
                  <span className="t-meta text-muted-foreground">
                    {mesas.filter(m => m.piso === zona.nombre).length} mesas
                  </span>
                )}
              </div>

              {visibleDates.map((date, i) => {
                const ds = toISO(date);
                const q = search.trim().toLowerCase();
                const dayReservas = (reservas || [])
                  .filter(r => r.fecha === ds && (zona.id === 'sin_zona' ? !r.zona_id : r.zona_id === zona.id))
                  .filter(r => !q || r.nombre.toLowerCase().includes(q))
                  .sort((a, b) => a.hora.localeCompare(b.hora));
                // Primer día de un mes que no es el primero visible: ahí va la línea gruesa (la misma que en la cabecera, en el mismo borde).
                const monthStart = i > 0 && tramosMes.some(m => m.inicio === i);

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
                    isMonthStart={monthStart}
                    isFirst={i === 0}
                    codigoMap={codigoMap}
                    mesaPorId={mesaPorId}
                    totalPorReserva={totalPorReserva}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {(['izq', 'der'] as const).map((lado) => (
        <div
          key={lado} aria-hidden={bordeCerca !== lado}
          className={cn('absolute top-1/2 -translate-y-1/2 z-40 transition-opacity duration-150', bordeCerca === lado ? 'opacity-100' : 'opacity-0 pointer-events-none')}
          style={lado === 'der' ? { right: 8 } : { left: ZONE_COL + 8 }}
        >
          <button
            type="button" tabIndex={bordeCerca === lado ? 0 : -1}
            aria-label={lado === 'der' ? 'Avanzar un día' : 'Retroceder un día'} title={lado === 'der' ? 'Avanzar un día' : 'Retroceder un día'}
            onPointerDown={(e) => { if (e.button === 0) pulsar(lado === 'der' ? 1 : -1); }}
            onPointerUp={soltar} onPointerCancel={soltar} onPointerLeave={soltar}
            className="size-11 flex items-center justify-center rounded-full bg-nav text-nav-foreground shadow-lg cursor-pointer hover:opacity-90 transition-opacity"
          >
            {lado === 'der' ? <CaretRight size={20} weight="bold" /> : <CaretLeft size={20} weight="bold" />}
          </button>
        </div>
      ))}
    </div>
  );
}
