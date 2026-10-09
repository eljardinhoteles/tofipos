import { useState, useEffect } from'react';
import { FloppyDisk, Bed, SquaresFour, Trash } from'@phosphor-icons/react';
import { useUI } from'../../../context/UIContext';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';
import { Button } from'@/components/ui/button';
import { ReservaHeader } from'./ReservaHeader';

interface SidebarAddTableProps {
 editingMesaId: string | null;
 initialValues: { numero: number; nombre: string; capacidad: number };
 onBack: () => void;
 onSubmit: (values: any) => void;
 /** Solo al editar: elimina la mesa o habitación. */
 onDelete?: () => void;
 selectedConfigPiso: string;
 isHabitacion?: boolean;
}

export function SidebarAddTable({
 editingMesaId,
 initialValues,
 onBack,
 onSubmit,
 onDelete,
 selectedConfigPiso,
 isHabitacion = false,
}: SidebarAddTableProps) {
 const { openConfirm } = useUI();
 const [form, setForm] = useState(initialValues);

 useEffect(() => {
 setForm(initialValues);
 }, [initialValues]);

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (!form.numero) return;
 onSubmit(form);
 };

 const etiqueta = 'text-xs font-bold';
 const campo = 'h-11 text-base md:text-sm font-semibold';

 return (
 <form onSubmit={handleSubmit} className="h-full w-full bg-card flex flex-col overflow-hidden">
 <ReservaHeader
 tono="neutro"
 badge={isHabitacion ? <Bed size={22} weight="bold" /> : <SquaresFour size={22} weight="bold" />}
 titulo={editingMesaId
 ? (isHabitacion ?'Editar habitación' :'Editar mesa')
 : (isHabitacion ?'Nueva habitación' :'Nueva mesa')}
 subtitulo={selectedConfigPiso}
 onBack={onBack}
 acciones={onDelete && (
 <Button type="button" variant="ghost" size="icon-lg"
 aria-label={isHabitacion ?'Eliminar habitación' :'Eliminar mesa'}
 title={isHabitacion ?'Eliminar habitación' :'Eliminar mesa'}
 onClick={() => openConfirm(isHabitacion ?'Eliminar habitación' :'Eliminar mesa',`¿Seguro que deseas eliminar ${initialValues.nombre ||(isHabitacion ?'esta habitación' :'esta mesa')}?`, onDelete)}
 className="rounded-xl bg-destructive-soft text-destructive hover:bg-destructive/20">
 <Trash size={18} weight="bold"/>
 </Button>
 )}
 />

 <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="mesa-numero" className={etiqueta}>{isHabitacion ?'Número de habitación *' :'Número de mesa *'}</Label>
 <Input
 id="mesa-numero" type="number" inputMode="numeric" required min={1}
 placeholder={isHabitacion ?'Ej: 101' :'Ej: 15'}
 value={form.numero ||''}
 onChange={(e) => setForm(prev => ({ ...prev, numero: parseInt(e.target.value) || 0 }))}
 className={campo}/>
 </div>

 {isHabitacion && (
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="mesa-tipo" className={etiqueta}>Nombre / Tipo (opcional)</Label>
 <Input
 id="mesa-tipo" type="text" placeholder="Ej: Suite, Doble, Junior..." value={form.nombre}
 onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))}
 className={campo}/>
 </div>
 )}

 {!isHabitacion && (
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="mesa-capacidad" className={etiqueta}>Capacidad (opcional)</Label>
 <Input
 id="mesa-capacidad" type="number" inputMode="numeric" min={0} placeholder="Ej: 4" value={form.capacidad ||''}
 onChange={(e) => setForm(prev => ({ ...prev, capacidad: parseInt(e.target.value) || 0 }))}
 className={campo}/>
 </div>
 )}

 </div>

 <footer className="p-4 border-t border-border bg-muted/40 flex items-center gap-2 shrink-0">
 <Button type="submit" className="h-12 flex-1 font-bold gap-2">
 <FloppyDisk size={18} weight="bold"/>
 {editingMesaId ?'Guardar cambios' : (isHabitacion ?'Crear habitación' :'Crear mesa')}
 </Button>
 </footer>
 </form>
 );
}
