import { useState, useEffect } from'react';
import {
 Minus, Plus, UserPlus, X
} from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { useUI } from'../../../context/UIContext';
import { initVerticalRxDb, createRxReserva, updateRxReserva, createRxComanda } from'../../../db/rxdb';
import { Button } from'@/components/ui/button';
import { Input } from'@/components/ui/input';
import { Textarea } from'@/components/ui/textarea';
import { Label } from'@/components/ui/label';
import { DatePickerField } from'@/components/ui/date-picker-field';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from'@/components/ui/select';

interface SidebarReservaNewProps {
 onBack: () => void;
 onSuccess: (reservaId: string) => void;
}

const toISO = (d: Date | string | number | null | undefined) => {
 if (!d) return'';
 const date = d instanceof Date ? d : new Date(d);
 if (Number.isNaN(date.getTime())) return'';
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2,'0');
 const day = String(date.getDate()).padStart(2,'0');
 return`${year}-${month}-${day}`;
};

export function SidebarReservaNew({ onBack, onSuccess }: SidebarReservaNewProps) {
 const { selectedReservaId, nuevaReservaPreset, setNuevaReservaPreset } = useUI();
 const [isEditMode, setIsEditMode] = useState(false);
 const [dataLoaded, setDataLoaded] = useState(false);

 const [reservaId] = useState<string>(() => selectedReservaId || crypto.randomUUID());
 const [comandaId] = useState<string>(() => crypto.randomUUID());
 const [isProcessing, setIsProcessing] = useState(false);
 const [nota, setNota] = useState('');

 const [nombre, setNombre] = useState('');
 const [personas, setPersonas] = useState(2);
 const [fecha, setFecha] = useState<string>(() => toISO(new Date()));
 const [hora, setHora] = useState('19:00');
 const [zonaId, setZonaId] = useState<string>('');
 const [nombreError, setNombreError] = useState('');

 const [zonas, setZonas] = useState<any[]>([]);

 useEffect(() => {
 let alive = true;
 let sub: { unsubscribe: () => void } | null = null;
 (async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 const query = rxDb.pisos.find({
 selector: { organization_id: orgId, _deleted: { $ne: true } },
 sort: [{ orden:'asc'}, { nombre:'asc'}]
 });
 sub = query.$.subscribe((docs: any[]) => {
 if (!alive) return;
 setZonas(docs.map((doc: any) => doc.toJSON()));
 });
 })().catch(() => {});
 return () => {
 alive = false;
 sub?.unsubscribe();
 };
 }, []);

 useEffect(() => {
  let alive = true;
  async function load() {
  if (selectedReservaId) {
  const rxDb = await initVerticalRxDb();
  const r = await rxDb.reservas.findOne(selectedReservaId).exec();
  if (!alive) return;
  if (r) {
  setIsEditMode(true);
  const data = r.toJSON();
  setNombre(data.nombre);
  setPersonas(data.personas);
  setFecha(data.fecha);
  setHora(data.hora);
  setZonaId(data.zona_id ||'');
  setNota(data.nota ||'');
  }
  } else if (nuevaReservaPreset) {
  if (nuevaReservaPreset.fecha) setFecha(toISO(nuevaReservaPreset.fecha));
  if (nuevaReservaPreset.zonaId) setZonaId(nuevaReservaPreset.zonaId);
  setNuevaReservaPreset(null);
  }
  if (alive) setDataLoaded(true);
  }
  load();
  return () => { alive = false; };
  }, [selectedReservaId, nuevaReservaPreset, setNuevaReservaPreset]);

 if (!dataLoaded) return null;

 const handleFinish = async () => {
 if (nombre.trim().length < 2) {
 setNombreError('Ingresa un nombre');
 return;
 }
 if (!fecha) return;
 setNombreError('');

 setIsProcessing(true);
 try {
 showToast.info('Guardando reserva','Publicando cambios en la nube...');
 const today = toISO(new Date());

 if (fecha < today) {
 showToast.error('Fecha inválida','No puedes crear reservas en fechas pasadas.');
 setIsProcessing(false);
 return;
 }

 if (isEditMode) {
 await updateRxReserva(reservaId, {
 nombre: nombre.trim(), fecha, hora, personas,
 zona_id: zonaId || undefined, nota: nota.trim() || undefined,
 });
 } else {
 const now = new Date().toISOString();
 const rxDb = await initVerticalRxDb();
 const nextFolio = (await rxDb.comandas.find().exec()).length + 1;
 await createRxComanda({
 id: comandaId, folio: nextFolio,
 mesa_id:'reserva_'+ reservaId,
 mesa_nombre:'Reserva',
 mesero:'Sistema', cliente: nombre.trim(),
 estado:'pendiente', total: 0,
 confirmada: true,
 organization_id: localStorage.getItem('pos_active_org_id') ||'',
 created_at: now,
 updated_at: now,
 });
 await createRxReserva({
 id: reservaId, nombre: nombre.trim(), fecha, hora, personas,
 zona_id: zonaId || undefined, estado:'confirmada',
 comanda_id: comandaId, abono: 0,
 nota: nota.trim() || undefined,
 organization_id: localStorage.getItem('pos_active_org_id') ||'',
 created_at: now,
 updated_at: now,
 });
 }

 showToast.success(isEditMode ?'Reserva actualizada':'Reserva creada');
 onSuccess(reservaId);
 } catch (e) {
 console.error(e);
 showToast.error(isEditMode ?'Error al actualizar':'Error al crear la reserva');
 } finally {
 setIsProcessing(false);
 }
 };

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 <header className="p-4 border-b border-border flex items-center justify-between shrink-0 shadow-xs">
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground leading-tight">
 {isEditMode ?'Editar Reserva':'Nueva Reserva'}
 </h3>
 <div className="flex items-center gap-1.5 text-xs text-primary font-bold mt-0.5">
 <UserPlus size={14} />
 <span>{nombre ||'Cliente sin asignar'}</span>
 </div>
 </div>
 <button
 type="button"onClick={onBack}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <X size={18} weight="bold"/>
 </button>
 </header>

 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
 <div className="flex flex-col gap-1.5">
 <Label>Nombre del cliente *</Label>
 <Input
 type="text"placeholder="Ej: Juan Pérez"value={nombre}
 onChange={e => { setNombre(e.target.value); setNombreError(''); }}
 />
 {nombreError && <span className="text-[10px] text-destructive font-bold">{nombreError}</span>}
 </div>

 <div className="flex flex-col gap-1.5">
 <Label>Comensales</Label>
 <div className="flex items-center justify-center gap-4 bg-muted p-2 rounded-xl border border-border">
 <button
 type="button"onClick={() => setPersonas(Math.max(1, personas - 1))}
 className="w-9 h-9 rounded-lg bg-card border border-border text-foreground flex items-center justify-center font-bold">
 <Minus size={16} />
 </button>
 <span className="font-black text-xl text-foreground w-8 text-center">{personas}</span>
 <button
 type="button"onClick={() => setPersonas(Math.min(50, personas + 1))}
 className="w-9 h-9 rounded-lg bg-card border border-border text-foreground flex items-center justify-center font-bold">
 <Plus size={16} />
 </button>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <Label>Fecha</Label>
 <DatePickerField
 value={fecha}
 onChange={setFecha}
 />
 </div>
 <div className="flex flex-col gap-1">
 <Label>Hora</Label>
 <Input
 type="time"value={hora}
 onChange={e => setHora(e.target.value)}
 />
 </div>
 </div>

 <div className="flex flex-col gap-1.5">
 <Label>Zona preferida</Label>
 <Select value={zonaId ||'__any__'} onValueChange={(v) => setZonaId(v ==='__any__'?'': v)}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="__any__">Cualquier zona</SelectItem>
 {zonas.map(z => (
 <SelectItem key={z.id} value={z.id}>{z.nombre}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div className="flex flex-col gap-1.5">
 <Label>Notas de la reserva</Label>
 <Textarea
 rows={3}
 placeholder="Ej: Mesa cerca de la ventana..."value={nota}
 onChange={e => setNota(e.target.value)}
 />
 </div>
 </main>

 <footer className="p-4 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
 <Button type="button"variant="secondary"onClick={onBack}>
 Cancelar
 </Button>
 <Button
 type="button"disabled={isProcessing}
 onClick={handleFinish}
 >
 {isEditMode ?'Guardar Cambios':'Crear Reserva'}
 </Button>
 </footer>
 </div>
 );
}
