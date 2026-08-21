import { useState } from'react';
import { Plus } from'@phosphor-icons/react';
import { type Reserva } from'../../db/database';
import { MiniReservaCard } from'./MiniReservaCard';
import { cn } from'@/lib/utils';

interface CalendarCellProps {
 isToday: boolean;
 isWeekend: boolean;
 dayReservas: Reserva[];
 highlightedId: string | null;
 onCellClick: () => void;
 onCardClick: (id: string) => void;
 onAssign: (r: Reserva) => void;
 onCancel: (id: string) => void;
 isMonthEnd?: boolean;
 codigoMap?: Record<string, string>;
}

export function CalendarCell({
 isToday,
 isWeekend,
 dayReservas,
 highlightedId,
 onCellClick,
 onCardClick,
 onAssign,
 onCancel,
 isMonthEnd = false,
 codigoMap = {}
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
 className={cn("p-2 min-h-[100px] border-b border-r border-border transition-colors flex flex-col gap-1 cursor-pointer select-none",
 isToday ?"bg-primary/5": isWeekend ?"bg-muted/40":"bg-background",
 isMonthEnd &&"border-r-2 border-r-foreground/20",
 hovered &&"bg-muted/80")}
 >
 {dayReservas.map(r => (
 <MiniReservaCard
 key={r.id}
 reserva={r}
 isHighlighted={r.id === highlightedId}
 onClick={() => onCardClick(r.id)}
 onAssign={() => onAssign(r)}
 onCancel={() => onCancel(r.id)}
 codigo={codigoMap[r.id]}
 />
 ))}

 <div
 data-card
 onClick={(e) => { e.stopPropagation(); onCellClick(); }}
 className="mt-auto pt-1 flex items-center justify-center gap-1 text-muted-foreground transition-colors">
 <Plus size={14} weight="bold"/>
 {hovered && <span className="text-[10px] font-bold">Nueva</span>}
 </div>
 </div>
 );
}
