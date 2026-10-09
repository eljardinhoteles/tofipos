import { Plus, Bed, CaretRight, CaretUp, CaretDown, MapTrifold } from'@phosphor-icons/react';
import type { Mesa, Piso } from'../../../db/database';
import { Input } from'@/components/ui/input';
import { Button } from'@/components/ui/button';
import { ReservaHeader } from'./ReservaHeader';

interface SidebarConfigPisosProps {
 dbPisos: Piso[];
 allMesas: Mesa[];
 onClose: () => void;
 onAddPiso: (name: string) => void;
 onReorderPiso: (id: string, direction:'up'|'down') => void;
 onSelectPiso: (name: string) => void;
 newPisoName: string;
 setNewPisoName: (val: string) => void;
}

const encabezadoSeccion = (titulo: string) => (
 <div className="px-4 py-2.5 border-y border-border bg-muted">
 <span className="text-[11px] font-extrabold uppercase tracking-wider text-foreground/70">{titulo}</span>
 </div>
);

export function SidebarConfigPisos({
 dbPisos,
 allMesas,
 onClose,
 onAddPiso,
 onReorderPiso,
 onSelectPiso,
 newPisoName,
 setNewPisoName,
}: SidebarConfigPisosProps) {
 const habitacionesPiso = dbPisos.find(p => p.nombre.toLowerCase() ==='habitaciones');
 const habitacionesCount = habitacionesPiso ? allMesas.filter(m => m.piso === habitacionesPiso.nombre).length : 0;
 const zonas = dbPisos.filter(p => p.nombre.toLowerCase() !=='habitaciones');

 return (
 <div className="h-full w-full bg-card flex flex-col overflow-hidden">
 <ReservaHeader
 tono="neutro"
 badge={<MapTrifold size={22} weight="bold" />}
 titulo="Zonas y Pisos"
 subtitulo={`${zonas.length} ${zonas.length === 1 ?'zona':'zonas'} · Gestiona las áreas del local`}
 onClose={onClose}
 />

 <div className="flex-1 overflow-y-auto">
 {/* Zonas */}
 {encabezadoSeccion('Zonas del restaurante')}
 {/* Nueva zona */}
 <form
 className="flex items-center gap-2 p-4 border-b border-border"
 onSubmit={(e) => { e.preventDefault(); onAddPiso(newPisoName); }}
 >
 <Input
 type="text"placeholder="Nueva zona: Terraza, VIP..."value={newPisoName}
 onChange={(e) => setNewPisoName(e.target.value)}
 className="flex-1 h-11 text-base md:text-sm font-semibold"/>
 <Button type="submit" size="icon-lg" aria-label="Añadir zona" disabled={!newPisoName.trim()} className="h-11 w-11 shrink-0">
 <Plus size={18} weight="bold"/>
 </Button>
 </form>

 {zonas.length === 0 && (
 <span className="block text-xs text-muted-foreground font-semibold text-center py-8">Aún no hay zonas. Crea la primera arriba.</span>
 )}
 {zonas.map((piso, i) => {
 const mesasCount = allMesas.filter(m => m.piso === piso.nombre).length;
 return (
 <div key={piso.id} className="flex items-center gap-1 pl-3 pr-4 border-b border-border">
 <span className="flex flex-col shrink-0">
 <button type="button" aria-label={`Subir ${piso.nombre}`} disabled={i === 0} onClick={() => onReorderPiso(piso.id,'up')}
 className="p-1 text-foreground/70 disabled:opacity-25 cursor-pointer disabled:cursor-default">
 <CaretUp size={14} weight="bold"/>
 </button>
 <button type="button" aria-label={`Bajar ${piso.nombre}`} disabled={i === zonas.length - 1} onClick={() => onReorderPiso(piso.id,'down')}
 className="p-1 text-foreground/70 disabled:opacity-25 cursor-pointer disabled:cursor-default">
 <CaretDown size={14} weight="bold"/>
 </button>
 </span>
 <button
 type="button"
 onClick={() => onSelectPiso(piso.nombre)}
 className="flex-1 min-w-0 flex items-center gap-3 pl-1 py-3 text-left cursor-pointer"
 >
 <span className="flex flex-col flex-1 min-w-0">
 <span className="font-extrabold text-sm text-foreground truncate">{piso.nombre}</span>
 <span className="text-xs text-muted-foreground font-semibold">{mesasCount} {mesasCount === 1 ?'mesa':'mesas'}</span>
 </span>
 <CaretRight size={16} weight="bold" className="text-foreground/50 shrink-0"/>
 </button>
 </div>
 );
 })}
 </div>

 {/* Hotel: aparte de las zonas del restaurante */}
 <div className="p-4 border-t border-border bg-muted/40 shrink-0">
 <Button
 type="button"
 variant="outline"
 onClick={() => {
 if (habitacionesPiso) onSelectPiso(habitacionesPiso.nombre);
 else onAddPiso('Habitaciones');
 }}
 className="w-full h-12 font-bold gap-2 justify-between"
 >
 <span className="flex items-center gap-2">
 <Bed size={18} weight="bold"/> Hotel · Habitaciones
 </span>
 <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
 {habitacionesPiso ? habitacionesCount : 'Activar'}
 <CaretRight size={14} weight="bold"/>
 </span>
 </Button>
 </div>
 </div>
 );
}
