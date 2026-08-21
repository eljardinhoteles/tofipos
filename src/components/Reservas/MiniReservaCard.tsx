import { Clock, Users, ArrowUpRight } from'@phosphor-icons/react';
import { type Reserva } from'../../db/database';
import { toISO } from'./reservaUtils';

interface MiniReservaCardProps {
 reserva: Reserva;
 onClick: () => void;
 onAssign: () => void;
 onCancel: () => void;
 isHighlighted?: boolean;
 codigo?: string;
}

export function MiniReservaCard({
 reserva,
 onClick,
 onAssign,
 isHighlighted = false,
 codigo =''}: MiniReservaCardProps) {
 const done = reserva.estado ==='completada';
 const canceled = reserva.estado ==='cancelada';
 // Asignar mesa solo tiene sentido el día del servicio: una reserva futura
 // aún no debe ocupar una mesa física.
 const esHoy = reserva.fecha === toISO(new Date());

 return (
 <div
 data-card
 onClick={(e) => { e.stopPropagation(); onClick(); }}
 className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
 isHighlighted ?'border-primary ring-2 ring-primary/20':'border-border'} bg-card shadow-2xs`}
 >
 <div className="flex flex-col gap-0.5 overflow-hidden">
 <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
 <span className="flex items-center gap-0.5 text-primary">
 <Clock size={10} weight="bold"/> {reserva.hora}
 </span>
 <span>·</span>
 <span className="flex items-center gap-0.5">
 <Users size={10} /> {reserva.personas} p.
 </span>
 </div>
 <span className="font-extrabold text-xs text-foreground truncate">
 {codigo ?`${codigo} -`:''}{reserva.nombre}
 </span>
 </div>

 {!canceled && !done && (
 <button
 type="button"
 disabled={!esHoy}
 onClick={(e) => { e.stopPropagation(); if (esHoy) onAssign(); }}
 className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
 esHoy
 ?'bg-emerald-100 text-emerald-800 cursor-pointer'
 :'bg-muted text-muted-foreground/50 cursor-not-allowed'}`}
 title={esHoy ?'Asignar Mesa':'Solo se puede asignar mesa el día de la reserva'}>
 <ArrowUpRight size={14} weight="bold"/>
 </button>
 )}
 </div>
 );
}
