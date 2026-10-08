import { memo } from'react';
import type { Mesa, Comanda } from'../../db/database';
import { User, Receipt, ForkKnife, Bed, Stack } from'@phosphor-icons/react';
import { cn } from'@/lib/utils';

interface TableNodeProps {
 mesa: Mesa;
 isSelected: boolean;
 onSelect: (mesa: Mesa) => void;
 tiempoActivo?: string;
 cliente?: string;
 isHabitacion?: boolean;
 activeComanda?: Pick<Comanda,'estado'|'habitacion_cuenta_id'> & { sincronizado?: boolean } | null;
 roomBadge?: string;
 // Mesa Múltiple: cantidad de subcomandas abiertas (0/undefined = mesa normal).
 subcomandasCount?: number;
}

export const TableNode = memo(function TableNode({
 mesa,
 isSelected,
 onSelect,
 tiempoActivo,
 cliente,
 isHabitacion,
 activeComanda,
 roomBadge,
 subcomandasCount = 0
}: TableNodeProps) {
 const isFree = mesa.estado ==='libre'&& !activeComanda;

 const isMultiple = subcomandasCount > 0;
 const hasOpenComanda = Boolean(activeComanda);
 const effectiveState = hasOpenComanda
 ? (activeComanda?.estado ==='cuenta'?'cuenta':'ocupada')
 : mesa.estado;

 const roomNumber = isHabitacion ? (mesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || mesa.nombre) : mesa.nombre;
 const roomType = isHabitacion ? (mesa.nombre.match(/\(([^)]+)\)/)?.[1] ||'Sin nombre') :'';

 if (isHabitacion) {
 return (
 <div
 onClick={(e) => { e.stopPropagation(); onSelect(mesa); }}
 className={cn("w-full min-w-0 min-h-0 aspect-square overflow-hidden rounded-2xl p-3 border-2 transition-all cursor-pointer flex flex-col justify-between select-none active:scale-95 relative",
 isSelected
 // Seleccionada/sidebar abierto: azul (info) sólido, siempre (salvo cuenta).
 ? activeComanda?.estado ==='cuenta'?"bg-warning-foreground border-warning text-white":"bg-info border-info text-white": isFree
 // Libre: blanca neutra, borde blanco (sin acento) — igual que una
 // mesa libre, la diferenciación vive en ocupada/seleccionada.
 ?"bg-card border-white text-muted-foreground": activeComanda?.estado ==='cuenta'?"bg-warning-soft border-warning text-warning-foreground":
 // Ocupada sin seleccionar: azul sutil (fondo/borde tenues), no
 // sólido — el sólido queda reservado para cuando está seleccionada.
 "bg-info/10 border-info/40 text-info-foreground dark:bg-info/30 dark:border-info")}
 >
 <div className="flex items-center justify-between">
 <span className="text-[10px] font-black uppercase tracking-wider">
 {isFree ?'Libre': activeComanda?.estado ==='cuenta'?'Cuenta':'Ocupada'}
 </span>
 <Bed
 size={18}
 weight={isFree && !isSelected ?'regular':'fill'}
 className={cn(isFree && !isSelected ?"opacity-40":"opacity-90")}
 />
 </div>

 <div className="flex flex-col items-center justify-center gap-0.5 text-center my-auto w-full min-w-0">
 <span className="font-black text-xl leading-none truncate max-w-full">
 {roomNumber}
 </span>
 <span className="text-[10px] font-bold opacity-80 truncate max-w-full">
 {roomType}
 </span>
 {cliente && (
 <div className="flex items-center justify-center gap-1 mt-1 font-extrabold text-[10px] max-w-full min-w-0 text-inherit">
 <User size={10} className="shrink-0"/>
 <span className="truncate">{cliente}</span>
 </div>
 )}
 </div>
 </div>
 );
 }

 // Generar sillas visuales según capacidad
 const renderChairs = () => {
 const chairs = [];
 
 // Relleno de un tono ligeramente distinto al fondo de la card (un paso más
 // oscuro/saturado en la misma familia de color), para que se distingan del
 // fondo en vez de fundirse en un bulto tipo"orejas".
 const chairClass = cn("absolute rounded-full transition-colors",
 isSelected
 ? effectiveState ==='cuenta'?"bg-warning-foreground": effectiveState ==='ocupada'?"bg-primary":"bg-primary/80": effectiveState ==='libre'?"bg-muted-foreground/30": effectiveState ==='cuenta'?"bg-warning/20":"bg-primary/40");

 // Siempre 4 sillas (2 arriba + 2 a los lados), sin importar la capacidad ni
 // los comensales: el dibujo es decorativo y así todas las mesas se ven igual.
 chairs.push(<div key="c1"className={cn(chairClass,"top-0 left-1/2 -translate-x-1/2 -translate-y-full w-11 h-1.5")} />);
 chairs.push(<div key="c2"className={cn(chairClass,"bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-11 h-1.5")} />);
 chairs.push(<div key="c3"className={cn(chairClass,"left-0 top-1/2 -translate-x-full -translate-y-1/2 w-1.5 h-11")} />);
 chairs.push(<div key="c4"className={cn(chairClass,"right-0 top-1/2 translate-x-full -translate-y-1/2 w-1.5 h-11")} />);
 return chairs;
 };

 return (
 <div
 onClick={(e) => { e.stopPropagation(); onSelect(mesa); }}
 className={cn("w-full min-w-0 min-h-0 aspect-square rounded-2xl p-3 border-2 transition-all cursor-pointer flex flex-col justify-between select-none active:scale-95 relative",
 isSelected
 ? effectiveState ==='cuenta'?"bg-warning-foreground border-warning text-white": effectiveState ==='ocupada'?"bg-primary border-primary text-primary-foreground":"bg-primary border-primary text-primary-foreground": effectiveState ==='libre'?"bg-card border-border text-muted-foreground": effectiveState ==='cuenta'?"bg-warning-soft border-warning text-warning-foreground":"bg-primary/10 border-primary/50 text-primary")}
 >
 {/* Sillas alrededor de la mesa */}
 {renderChairs()}

 <div className="flex items-center justify-between relative z-10">
 <span className={cn("text-[10px] font-black uppercase tracking-wider",
 isSelected 
 ?"text-white/90": effectiveState ==='libre'?"text-muted-foreground": effectiveState ==='cuenta'?"text-warning-foreground":"text-primary")}>
 {effectiveState ==='libre'?'Libre': effectiveState ==='cuenta'?'Cuenta':'Ocupada'}
 </span>

 {!isFree && (
 <div className="flex items-center gap-1">
 {effectiveState ==='cuenta'? (
 <Receipt size={14} className={isSelected ?"text-white":"text-warning-foreground"} />
 ) : isMultiple ? (
 <Stack size={14} weight="fill" className={isSelected ?"text-white":"text-primary"} />
 ) : (
 <ForkKnife size={14} className={isSelected ?"text-white":"text-primary"} />
 )}
 {tiempoActivo && <span className="text-xs font-extrabold">{tiempoActivo}</span>}
 </div>
 )}
 </div>

 <div className="flex flex-col items-center justify-center gap-1 text-center my-auto relative z-10 w-full min-w-0">
 <span className={cn("font-black text-lg leading-tight truncate max-w-full",
 effectiveState ==='libre'&& !isSelected ?"text-foreground":"text-inherit")}>
 {mesa.nombre}
 </span>

 {roomBadge && (
 <span className={cn("px-2 py-0.5 rounded-md font-extrabold text-[10px] tracking-wide",
 isSelected ?"bg-white/20 text-white":"bg-info text-white")}>
 HAB: {roomBadge.match(/\d+/)?.[0] || roomBadge}
 </span>
 )}

 {isMultiple && (
 <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-md font-extrabold text-[10px] tracking-wide",
 isSelected ?"bg-white/20 text-white":"bg-primary/15 text-primary")}>
 <Stack size={10} weight="fill" />
 {subcomandasCount} CUENTAS
 </span>
 )}

 {cliente && !isMultiple && (
 <span className="text-[10px] font-extrabold truncate max-w-full mt-1">
 {cliente}
 </span>
 )}
 </div>
 </div>
 );
});
