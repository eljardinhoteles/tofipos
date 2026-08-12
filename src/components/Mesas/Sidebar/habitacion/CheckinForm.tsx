import { useState } from'react';
import dayjs from'dayjs';
import'dayjs/locale/es';
import { X, Calendar, User, Receipt, Bed } from'@phosphor-icons/react';
import { type Mesa } from'../../../../db/database';
import { showToast } from'@/lib/toast';
import { createRxHabitacionCuenta, updateRxMesa, type RxCliente } from'../../../../db/rxdb';
import { Textarea } from'@/components/ui/textarea';
import { Label } from'@/components/ui/label';
import { Button } from'@/components/ui/button';
import { DatePickerField } from'@/components/ui/date-picker-field';
import { ClienteSelector } from'@/components/Common/ClienteSelector';

dayjs.locale('es');

export function CheckinForm({ selectedMesa, onClose }: { selectedMesa: Mesa; onClose: () => void }) {
 const [isLoading, setIsLoading] = useState(false);
 const [huesped, setHuesped] = useState('');
 const [checkIn, setCheckIn] = useState(dayjs().format('YYYY-MM-DD'));
 const [checkOut, setCheckOut] = useState('');
 const [notas, setNotas] = useState('');
 const [clienteSeleccionado, setClienteSeleccionado] = useState<RxCliente | null>(null);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!huesped.trim()) {
 showToast.error('Ingresa el nombre del huésped');
 return;
 }

 setIsLoading(true);
 try {
 const clienteMatch = clienteSeleccionado?.nombre.trim().toLowerCase() === huesped.trim().toLowerCase()
 ? clienteSeleccionado
 : null;
 const cuentaId = crypto.randomUUID();
 const now = new Date().toISOString();

 await createRxHabitacionCuenta({
 id: cuentaId,
 mesa_id: selectedMesa.id,
 huesped: huesped.trim(),
 cliente_id: clienteMatch?.id,
 check_in: checkIn,
 check_out: checkOut || undefined,
 estado:'activa',
 notas: notas.trim() || undefined,
 organization_id: localStorage.getItem('pos_active_org_id') ||'',
 created_at: now,
 updated_at: now,
 });

 await updateRxMesa(selectedMesa.id, { estado:'ocupada'});
 showToast.success('Cuenta abierta',`${selectedMesa.nombre} — ${huesped}`);
 onClose();
 } catch (error) {
 console.error('Error al abrir cuenta:', error);
 showToast.error('Error al abrir cuenta', error instanceof Error ? error.message :'Error desconocido');
 } finally {
 setIsLoading(false);
 }
 };

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 <header className="p-4 flex items-center justify-between shrink-0 shadow-xs bg-card text-foreground md:bg-primary md:text-primary-foreground">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0 bg-primary text-primary-foreground md:bg-primary-foreground/15">
 <Bed size={20} weight="bold"/>
 </div>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base leading-tight md:text-primary-foreground">Iniciar Cuenta</h3>
 <span className="text-[10px] font-bold text-muted-foreground md:text-primary-foreground/70">
 Habitación #{selectedMesa.nombre.replace(/\D/g,'') || selectedMesa.nombre}
 </span>
 </div>
 </div>

 <Button variant="ghost"size="icon-lg"onClick={onClose} className="rounded-xl text-muted-foreground md:text-primary-foreground">
 <X size={18} weight="bold"/>
 </Button>
 </header>

 <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
 <div className="flex flex-col gap-1">
 <Label className="flex items-center gap-1.5">
 <User size={14} className="text-primary"/> Nombre del huésped *
 </Label>
 <ClienteSelector
 value={huesped}
 onChange={(nombre) => {
 setHuesped(nombre);
 setClienteSeleccionado(null);
 }}
 onSelect={setClienteSeleccionado}
 placeholder="Buscar cliente o escribir nombre..."
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <Label className="flex items-center gap-1.5">
 <Calendar size={14} className="text-primary"/> Check-in
 </Label>
 <DatePickerField
 value={checkIn}
 onChange={setCheckIn}
 />
 </div>

 <div className="flex flex-col gap-1">
 <Label className="flex items-center gap-1.5">
 <Calendar size={14} className="text-primary"/> Check-out
 </Label>
 <DatePickerField
 value={checkOut}
 onChange={setCheckOut}
 />
 </div>
 </div>

 <div className="flex flex-col gap-1">
 <Label className="flex items-center gap-1.5">
 <Receipt size={14} className="text-primary"/> Notas / Observaciones
 </Label>
 <Textarea
 rows={3}
 placeholder="Observaciones de la estancia..."value={notas}
 onChange={(e) => setNotas(e.target.value)}
 />
 </div>

 <Button
 type="submit"disabled={isLoading || !huesped.trim()}
 className="mt-4 w-full py-3.5 flex items-center justify-center gap-2">
 <Bed size={18} weight="bold"/> Abrir Cuenta
 </Button>
 </form>
 </div>
 );
}
