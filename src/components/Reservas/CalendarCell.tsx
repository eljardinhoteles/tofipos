import { useState } from'react';
import { Plus } from'@phosphor-icons/react';
import { type Reserva } from'../../db/database';
import { ReservaCard } from'./ReservaCard';
import { cn } from'@/lib/utils';

interface CalendarCellProps {
 isToday: boolean;
 isWeekend: boolean;
 dayReservas: Reserva[];
 highlightedId: string | null;
 onCellClick: () => void;
 onCardClick: (id: string) => void;
 onAssign: (r: Reserva) => void;
 onCancel?: (id: string) => void;
 /** Primer día de un mes (no el primero visible): lleva la línea gruesa a su izquierda, alineada con la de la cabecera. */
 isMonthStart?: boolean;
 /** Primer día visible: sin línea a la izquierda (le sigue la columna fija de zonas). */
 isFirst?: boolean;
 codigoMap?: Record<string, string>;
 mesaPorId?: Map<string, string>;
}

export function CalendarCell({
 isToday,
 isWeekend,
 dayReservas,
 highlightedId,
 onCellClick,
 onCardClick,
 onAssign,
 isMonthStart = false,
 isFirst = false,
 codigoMap = {},
 mesaPorId
}: CalendarCellProps) {
 const [hovered, setHovered] = useState(false);

 return (
 <div
 onMouseEnter={() => setHovered(true)}
 onMouseLeave={() => setHovered(false)}
 onClick={(e) => {
 if ((e.target as HTMLElement).closest('[data-card]')) return;
 onCellClick();
 }}
 className={cn("p-2 min-h-[100px] border-b border-border transition-colors flex flex-col gap-1 cursor-pointer select-none",
 isToday ?"bg-primary/5": isWeekend ?"bg-muted/40":"bg-background",
 !isFirst && (isMonthStart ?"border-l-2 border-l-border":"border-l border-l-border"),
 hovered &&"bg-muted/60")}
 >
 {dayReservas.map(r => (
 <ReservaCard
 key={r.id}
 reserva={r}
 isHighlighted={r.id === highlightedId}
 onClick={() => onCardClick(r.id)}
 onAssign={() => onAssign(r)}
 codigo={codigoMap[r.id]}
 mesaNombre={r.mesa_id ? mesaPorId?.get(r.mesa_id) : undefined}
 />
 ))}

 <div
 data-card
 onClick={(e) => { e.stopPropagation(); onCellClick(); }}
 className="mt-auto pt-1 flex items-center justify-center gap-1 text-muted-foreground transition-colors">
 <Plus size={14} weight="bold"/>
 {hovered && <span className="t-dato">Nueva</span>}
 </div>
 </div>
 );
}
