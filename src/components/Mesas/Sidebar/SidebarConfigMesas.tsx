import { useEffect, useState } from'react';
import { Plus, Trash, Users, Bed, SquaresFour, CaretRight } from'@phosphor-icons/react';
import { useUI } from'../../../context/UIContext';
import type { Piso } from'../../../db/database';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';
import { cn } from'@/lib/utils';
import { Button } from'@/components/ui/button';
import { ReservaHeader } from'./ReservaHeader';

interface SidebarConfigMesasProps {
 selectedConfigPiso: string;
 mesasDelPiso: any[];
 activeMesaIds?: Set<string>;
 onBack: () => void;
 onOpenAddTable: () => void;
 onEditMesa: (mesa: any) => void;
 isHabitacion?: boolean;
 /** Zona que se está viendo (nombre, orden y borrado se gestionan aquí). */
 piso?: Piso;
 onUpdatePiso?: (id: string, name: string) => void;
 onDeletePiso?: (id: string, name: string) => void;
}

export function SidebarConfigMesas({
 selectedConfigPiso,
 mesasDelPiso,
 activeMesaIds = new Set(),
 onBack,
 onOpenAddTable,
 onEditMesa,
 isHabitacion = false,
 piso,
 onUpdatePiso,
 onDeletePiso,
}: SidebarConfigMesasProps) {
 const { openConfirm } = useUI();
 const [nombreZona, setNombreZona] = useState(piso?.nombre ??'');
 useEffect(() => { setNombreZona(piso?.nombre ??''); }, [piso?.nombre]);
 const nombreCambiado = !!piso && nombreZona.trim() !=='' && nombreZona.trim() !== piso.nombre;
 const total = mesasDelPiso.length;
 const unidad = isHabitacion ? (total === 1 ?'habitación':'habitaciones') : (total === 1 ?'mesa':'mesas');

 return (
 <div className="h-full w-full bg-card flex flex-col overflow-hidden">
 <ReservaHeader
 tono="neutro"
 badge={isHabitacion ? <Bed size={22} weight="bold" /> : <SquaresFour size={22} weight="bold" />}
 titulo={isHabitacion ?'Habitaciones' : selectedConfigPiso}
 subtitulo={`${total} ${unidad}${isHabitacion ?' · Hotel' :' · Zona'}`}
 onBack={onBack}
 acciones={!isHabitacion && piso && (
 <Button type="button" variant="ghost" size="icon-lg" aria-label="Eliminar zona"
 disabled={total > 0}
 title={total > 0 ?'Quita primero sus mesas para eliminar la zona' :'Eliminar zona'}
 onClick={() => openConfirm('Eliminar zona',`¿Seguro que deseas eliminar"${piso.nombre}"? Esta acción no se puede deshacer.`,
 () => onDeletePiso?.(piso.id, piso.nombre))}
 className="rounded-xl bg-destructive-soft text-destructive hover:bg-destructive/20 disabled:opacity-40">
 <Trash size={18} weight="bold"/>
 </Button>
 )}
 />

 <div className="flex-1 overflow-y-auto">
 {!isHabitacion && piso && (
 <>
 <form
 className="flex flex-col gap-3 p-4"
 onSubmit={(e) => { e.preventDefault(); if (nombreCambiado) onUpdatePiso?.(piso.id, nombreZona); }}
 >
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="zona-nombre" className="text-xs font-bold">Nombre de la zona</Label>
 <div className="flex items-center gap-2">
 <Input id="zona-nombre" type="text" value={nombreZona} onChange={(e) => setNombreZona(e.target.value)}
 className="flex-1 h-11 text-base md:text-sm font-semibold"/>
 <Button type="submit" disabled={!nombreCambiado} className="h-11 px-4 font-bold">Guardar</Button>
 </div>
 </div>
 </form>
 <div className="px-4 py-2 border-y border-border bg-muted/40">
 <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{`Mesas · ${total}`}</span>
 </div>
 </>
 )}
 {total === 0 && (
 <span className="block text-xs text-muted-foreground font-semibold text-center py-10">
 {isHabitacion ?'Aún no hay habitaciones.' :'Esta zona aún no tiene mesas.'}
 </span>
 )}
 {mesasDelPiso.map(mesa => {
 const isActive = activeMesaIds.has(mesa.id);
 const badgeLabel = isHabitacion
 ? mesa.nombre.replace(/^Hab\.\s*/,'')
 : (mesa.nombre.toLowerCase().startsWith('mesa') ? mesa.nombre.split(' ').pop() : mesa.nombre);

 const displayName = isHabitacion
 ? mesa.nombre.replace(/\s*\([^)]*\)\s*$/,'')
 : (mesa.nombre.toLowerCase().startsWith('mesa') ? mesa.nombre :`Mesa ${mesa.nombre}`).replace(/\s*\([^)]*\)\s*$/,'');

 return (
 <button
 key={mesa.id}
 type="button"
 disabled={isActive}
 onClick={() => onEditMesa(mesa)}
 className={cn("w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/60", isActive ?"opacity-70 cursor-not-allowed":"cursor-pointer")}
 >
 <span className="w-10 h-10 rounded-xl bg-muted text-foreground font-extrabold text-sm flex items-center justify-center shrink-0 truncate">
 {isHabitacion ? <Bed size={18} /> : badgeLabel}
 </span>
 <span className="flex flex-col flex-1 min-w-0">
 <span className="font-extrabold text-sm text-foreground truncate">{displayName}</span>
 {isActive ? (
 <span className="text-xs font-semibold text-warning-foreground">En uso: no se puede editar</span>
 ) : !isHabitacion && (
 <span className="flex items-center gap-1 text-xs text-muted-foreground font-semibold">
 <Users size={12} /> {mesa.capacidad || 2} personas
 </span>
 )}
 </span>
 {!isActive && <CaretRight size={16} weight="bold" className="text-muted-foreground shrink-0"/>}
 </button>
 );
 })}
 </div>

 <div className="p-4 border-t border-border bg-muted/40 flex items-center gap-2 shrink-0">
 <Button type="button" onClick={onOpenAddTable} className="h-12 flex-1 font-bold gap-2">
 {isHabitacion ? <Bed size={18} weight="bold"/> : <Plus size={18} weight="bold"/>}
 {isHabitacion ?'Añadir habitación' :'Añadir mesa'}
 </Button>
 </div>
 </div>
 );
}
