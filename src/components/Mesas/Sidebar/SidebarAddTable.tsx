import { useState, useEffect } from'react';
import { ArrowLeft, FloppyDisk } from'@phosphor-icons/react';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';
import { Button } from'@/components/ui/button';

interface SidebarAddTableProps {
 editingMesaId: string | null;
 initialValues: { numero: number; nombre: string; capacidad: number };
 onBack: () => void;
 onSubmit: (values: any) => void;
 selectedConfigPiso: string;
 isHabitacion?: boolean;
}

export function SidebarAddTable({
 editingMesaId,
 initialValues,
 onBack,
 onSubmit,
 selectedConfigPiso,
 isHabitacion = false,
}: SidebarAddTableProps) {
 const [form, setForm] = useState(initialValues);

 useEffect(() => {
 setForm(initialValues);
 }, [initialValues]);

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (!form.numero) return;
 onSubmit(form);
 };

 return (
 <div className="h-full w-full bg-card flex flex-col p-6 justify-between">
 <div className="flex flex-col gap-6">
 <div className="flex items-center gap-3">
 <button
 type="button"onClick={onBack}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <ArrowLeft size={18} weight="bold"/>
 </button>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground">
 {editingMesaId
 ? (isHabitacion ?'Editar Habitación':'Editar Mesa')
 : (isHabitacion ?'Nueva Habitación':'Nueva Mesa')}
 </h3>
 <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
 {selectedConfigPiso}
 </span>
 </div>
 </div>

 <form onSubmit={handleSubmit} className="flex flex-col gap-4">
 <div className="flex flex-col gap-1">
 <Label>
 {isHabitacion ?'Número de Habitación *':'Número de Mesa *'}
 </Label>
 <Input
 type="number"required
 min={1}
 placeholder={isHabitacion ?'Ej: 101':'Ej: 15'}
 value={form.numero ||''}
 onChange={(e) => setForm(prev => ({ ...prev, numero: parseInt(e.target.value) || 0 }))}
 className="font-bold"/>
 </div>

 {isHabitacion && (
 <div className="flex flex-col gap-1">
 <Label>Nombre / Tipo (Opcional)</Label>
 <Input
 type="text"placeholder="Ej: Suite, Doble, Junior..."value={form.nombre}
 onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))}
 />
 </div>
 )}

 {!isHabitacion && (
 <div className="flex flex-col gap-1">
 <Label>Capacidad (Opcional)</Label>
 <Input
 type="number"min={0}
 placeholder="Ej: 4"value={form.capacidad ||''}
 onChange={(e) => setForm(prev => ({ ...prev, capacidad: parseInt(e.target.value) || 0 }))}
 />
 </div>
 )}

 <div className="flex flex-col gap-2 pt-4">
 <Button type="submit"className="gap-2">
 <FloppyDisk size={18} weight="bold"/>
 {editingMesaId
 ?'Guardar Cambios': (isHabitacion ?'Crear Habitación':'Crear Mesa')}
 </Button>
 <Button type="button"variant="secondary"onClick={onBack}>
 Cancelar
 </Button>
 </div>
 </form>
 </div>
 </div>
 );
}
