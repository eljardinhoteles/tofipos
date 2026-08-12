import { ArrowLeft, Plus, Trash, Users, PencilLine, Bed } from'@phosphor-icons/react';
import { cn } from'@/lib/utils';

interface SidebarConfigMesasProps {
 selectedConfigPiso: string;
 mesasDelPiso: any[];
 activeMesaIds?: Set<string>;
 onBack: () => void;
 onOpenAddTable: () => void;
 onEditMesa: (mesa: any) => void;
 onDeleteMesa: (id: string) => void;
 isHabitacion?: boolean;
}

export function SidebarConfigMesas({
 selectedConfigPiso,
 mesasDelPiso,
 activeMesaIds = new Set(),
 onBack,
 onOpenAddTable,
 onEditMesa,
 onDeleteMesa,
 isHabitacion = false,
}: SidebarConfigMesasProps) {
 return (
 <div className="h-full w-full bg-card flex flex-col p-6 overflow-hidden">
 {/* Header */}
 <div className="flex items-center gap-3 border-b border-border pb-4 mb-4">
 <button
 type="button"onClick={onBack}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <ArrowLeft size={18} weight="bold"/>
 </button>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground">
 {isHabitacion ?'Habitaciones':`Mesas: ${selectedConfigPiso}`}
 </h3>
 <span className="text-[10px] font-bold text-muted-foreground">
 {isHabitacion ?'Añadir o eliminar habitaciones':'Añadir o eliminar mesas de esta zona'}
 </span>
 </div>
 </div>

 <button
 type="button"onClick={onOpenAddTable}
 className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs mb-4 transition-colors shrink-0">
 {isHabitacion ? <Bed size={18} weight="bold"/> : <Plus size={18} weight="bold"/>}
 <span>{isHabitacion ?'Añadir Habitación':'Añadir Mesa'}</span>
 </button>

 {/* Lista de Mesas */}
 <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
 {mesasDelPiso.map(mesa => {
 const isActive = activeMesaIds.has(mesa.id);
 const badgeLabel = isHabitacion
 ? mesa.nombre.replace(/^Hab\.\s*/,'')
 : (mesa.nombre.toLowerCase().startsWith('mesa') ? mesa.nombre.split('').pop() : mesa.nombre);

 const displayName = isHabitacion
 ? mesa.nombre.replace(/\s*\([^)]*\)\s*$/,'')
 : (mesa.nombre.toLowerCase().startsWith('mesa') ? mesa.nombre :`Mesa ${mesa.nombre}`).replace(/\s*\([^)]*\)\s*$/,'');

 return (
 <div
 key={mesa.id}
 className="p-3 rounded-xl bg-muted border border-border flex items-center justify-between gap-2">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 rounded-lg bg-border text-foreground font-extrabold text-xs flex items-center justify-center shrink-0">
 {isHabitacion ? <Bed size={18} /> : badgeLabel}
 </div>
 <div className="flex flex-col">
 <span className="font-extrabold text-xs text-foreground">{displayName}</span>
 {!isHabitacion && (
 <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-bold">
 <Users size={12} />
 <span>{mesa.capacidad || 2} personas</span>
 </div>
 )}
 </div>
 </div>

 <div className="flex items-center gap-1">
 <button
 type="button"disabled={isActive}
 onClick={() => !isActive && onEditMesa(mesa)}
 className={cn("w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors",
 isActive ?"text-muted-foreground/40 cursor-not-allowed":"text-primary")}
 >
 <PencilLine size={16} />
 </button>

 <button
 type="button"disabled={isActive}
 onClick={() => !isActive && onDeleteMesa(mesa.id)}
 className={cn("w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors",
 isActive ?"text-muted-foreground/40 cursor-not-allowed":"text-destructive")}
 >
 <Trash size={16} />
 </button>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );
}
