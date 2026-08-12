import { ArrowLeft, Plus, PencilSimple, Trash, CaretUp, CaretDown, Bed } from'@phosphor-icons/react';
import { useUI } from'../../../context/UIContext';
import type { Mesa, Piso } from'../../../db/database';
import { Input } from'@/components/ui/input';

interface SidebarConfigPisosProps {
 dbPisos: Piso[];
 allMesas: Mesa[];
 onBack: () => void;
 onAddPiso: (name: string) => void;
 onUpdatePiso: (id: string, name: string) => void;
 onDeletePiso: (id: string, name: string) => void;
 onReorderPiso: (id: string, direction:'up'|'down') => void;
 onSelectPiso: (name: string) => void;
 newPisoName: string;
 setNewPisoName: (val: string) => void;
 editingPisoId: string | null;
 setEditingPisoId: (id: string | null) => void;
 editingPisoName: string;
 setEditingPisoName: (name: string) => void;
}

export function SidebarConfigPisos({
 dbPisos,
 allMesas,
 onBack,
 onAddPiso,
 onUpdatePiso,
 onDeletePiso,
 onReorderPiso,
 onSelectPiso,
 newPisoName,
 setNewPisoName,
 editingPisoId,
 setEditingPisoId,
 editingPisoName,
 setEditingPisoName,
}: SidebarConfigPisosProps) {
 const { openConfirm } = useUI();
 const habitacionesPiso = dbPisos.find(p => p.nombre.toLowerCase() ==='habitaciones');

 return (
 <div className="h-full w-full bg-card flex flex-col p-6 overflow-hidden">
 {/* Header */}
 <div className="flex items-start justify-between border-b border-border pb-4 mb-4">
 <div className="flex items-center gap-3">
 <button
 type="button"onClick={onBack}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <ArrowLeft size={18} weight="bold"/>
 </button>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground">Zonas y Pisos</h3>
 <span className="text-[10px] font-bold text-muted-foreground">Gestiona las áreas del local</span>
 </div>
 </div>

 <button
 type="button"title="Gestionar Habitaciones"onClick={() => {
 if (habitacionesPiso) {
 onSelectPiso(habitacionesPiso.nombre);
 } else {
 onAddPiso('Habitaciones');
 }
 }}
 className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center cursor-pointer transition-colors">
 <Bed size={18} weight="bold"/>
 </button>
 </div>

 {/* Nueva Zona */}
 <div className="flex flex-col gap-1.5 mb-5">
 <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Nueva Zona</span>
 <div className="flex items-center gap-2">
 <Input
 type="text"placeholder="Ej: Terraza, VIP..."value={newPisoName}
 onChange={(e) => setNewPisoName(e.target.value)}
 className="flex-1"/>
 <button
 type="button"onClick={() => onAddPiso(newPisoName)}
 className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-xs transition-colors shrink-0">
 <Plus size={18} weight="bold"/>
 </button>
 </div>
 </div>

 {/* Lista de Pisos */}
 <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
 {dbPisos
 .filter(p => p.nombre.toLowerCase() !=='habitaciones')
 .map(piso => {
 const mesasCount = allMesas.filter(m => m.piso === piso.nombre).length;

 return (
 <div
 key={piso.id}
 className="p-3 rounded-xl bg-muted border border-border flex items-center justify-between gap-2">
 {editingPisoId === piso.id ? (
 <div className="flex items-center gap-2 w-full">
 <Input
 type="text"value={editingPisoName}
 onChange={(e) => setEditingPisoName(e.target.value)}
 className="flex-1 h-8"/>
 <button
 type="button"onClick={() => onUpdatePiso(piso.id, editingPisoName)}
 className="px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-xs">
 Ok
 </button>
 <button
 type="button"onClick={() => setEditingPisoId(null)}
 className="px-2 py-1 rounded-lg bg-border text-foreground font-bold text-xs">
 X
 </button>
 </div>
 ) : (
 <>
 <div className="flex items-center gap-2 flex-1 min-w-0">
 <div className="flex flex-col gap-0.5">
 <button
 type="button"onClick={(e) => { e.stopPropagation(); onReorderPiso(piso.id,'up'); }}
 className="text-muted-foreground cursor-pointer">
 <CaretUp size={12} weight="bold"/>
 </button>
 <button
 type="button"onClick={(e) => { e.stopPropagation(); onReorderPiso(piso.id,'down'); }}
 className="text-muted-foreground cursor-pointer">
 <CaretDown size={12} weight="bold"/>
 </button>
 </div>

 <div
 onClick={() => onSelectPiso(piso.nombre)}
 className="flex flex-col cursor-pointer flex-1 min-w-0">
 <span className="font-extrabold text-xs text-foreground truncate">{piso.nombre}</span>
 <span className="text-[10px] text-muted-foreground font-semibold">{mesasCount} mesas</span>
 </div>
 </div>

 <div className="flex items-center gap-1">
 <button
 type="button"onClick={() => {
 setEditingPisoId(piso.id);
 setEditingPisoName(piso.nombre);
 }}
 className="w-7 h-7 rounded-lg text-primary flex items-center justify-center cursor-pointer">
 <PencilSimple size={16} />
 </button>

 <button
 type="button"disabled={mesasCount > 0}
 onClick={(e) => {
 e.stopPropagation();
 openConfirm('Eliminar zona',`¿Seguro que deseas eliminar"${piso.nombre}"? Esta acción no se puede deshacer.`,
 () => onDeletePiso(piso.id, piso.nombre)
 );
 }}
 className="w-7 h-7 rounded-lg text-destructive disabled:opacity-30 flex items-center justify-center cursor-pointer">
 <Trash size={16} />
 </button>
 </div>
 </>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
}
