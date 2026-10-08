import { useState, useEffect } from'react';
import { Minus, Plus, CalendarPlus } from'@phosphor-icons/react';
import { ReservaHeader } from'./ReservaHeader';
import { showToast } from'@/lib/toast';
import { useUI } from'../../../context/UIContext';
import { initVerticalRxDb, createRxReserva, updateRxReserva, createRxComanda, siguienteFolio } from'../../../db/rxdb';
import { Button } from'@/components/ui/button';
import { Input } from'@/components/ui/input';
import { ClienteSelector } from'@/components/Common/ClienteSelector';
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
 const [telefono, setTelefono] = useState('');
 const [email, setEmail] = useState('');
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
 // Habitaciones y el piso sintético de reservas no son zonas del restaurante.
 setZonas(docs.map((doc: any) => doc.toJSON())
 .filter((z: any) => !['habitaciones', 'reservas'].includes(String(z.nombre ?? '').trim().toLowerCase())));
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
  setTelefono(data.telefono ||'');
  setEmail(data.email ||'');
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

 const orgId = localStorage.getItem('pos_active_org_id') || '';

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
 telefono: telefono || undefined, email: email || undefined,
 });
 } else {
 const now = new Date().toISOString();
 const nextFolio = await siguienteFolio();
 await createRxComanda({
 id: comandaId, folio: nextFolio,
 mesa_id:'reserva_'+ reservaId,
 mesa_nombre:'Reserva',
 mesero:'Sistema', cliente: nombre.trim(),
 estado:'pendiente', total: 0,
 // Nace sin confirmar: el pedido anticipado de la reserva todavía no se
 // envió a cocina. Al asignar mesa, el mesero revisa la comanda y recién
 // ahí confirma — mismo flujo que cualquier mesa abierta manualmente.
 confirmada: false,
 organization_id: orgId,
 created_at: now,
 updated_at: now,
 });
 await createRxReserva({
 id: reservaId, nombre: nombre.trim(), fecha, hora, personas,
 zona_id: zonaId || undefined, estado:'confirmada',
 comanda_id: comandaId, abono: 0,
 nota: nota.trim() || undefined,
 telefono: telefono || undefined, email: email || undefined,
 organization_id: orgId,
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

 const etiqueta = 'text-xs font-bold text-foreground';
 const campo = 'h-12 text-base font-semibold';

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 <ReservaHeader
 badge={<CalendarPlus size={22} weight="bold" />}
 titulo={isEditMode ? 'Editar reserva' : 'Nueva reserva'}
 subtitulo={nombre.trim() || 'Cliente sin asignar'}
 onClose={onBack}
 />

 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
 <section className="flex flex-col gap-3">
 <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Cliente</h4>
 <div className="flex flex-col gap-1.5">
 <Label className={etiqueta}>Nombre del cliente *</Label>
 <ClienteSelector
 value={nombre}
 placeholder="Buscar cliente o escribir nombre"
 onChange={(v) => { setNombre(v); setNombreError(''); }}
 onSelect={(cliente) => {
 setTelefono(cliente.telefono ||'');
 setEmail(cliente.email ||'');
 }}
 />
 {nombreError && <span className="text-xs text-destructive font-bold">{nombreError}</span>}
 </div>
 </section>

 <section className="flex flex-col gap-3">
 <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Cuándo y cuántos</h4>
 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1.5">
 <Label className={etiqueta}>Fecha</Label>
 <DatePickerField value={fecha} onChange={setFecha} />
 </div>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="reserva-hora" className={etiqueta}>Hora</Label>
 <Input id="reserva-hora" type="time" value={hora} onChange={e => setHora(e.target.value)} className={campo} />
 </div>
 </div>
 <div className="flex flex-col gap-1.5">
 <Label className={etiqueta}>Comensales</Label>
 <div className="flex items-center h-14 rounded-full border border-border overflow-hidden">
 <button type="button" aria-label="Menos" disabled={personas <= 1} onClick={() => setPersonas(Math.max(1, personas - 1))}
 className="h-full w-20 flex items-center justify-center text-foreground cursor-pointer active:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors">
 <Minus size={20} weight="bold" />
 </button>
 <span className="flex-1 text-center font-black text-2xl text-foreground tabular-nums">{personas}</span>
 <button type="button" aria-label="Más" disabled={personas >= 50} onClick={() => setPersonas(Math.min(50, personas + 1))}
 className="h-full w-20 flex items-center justify-center text-foreground cursor-pointer active:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors">
 <Plus size={20} weight="bold" />
 </button>
 </div>
 </div>
 </section>

 <section className="flex flex-col gap-3">
 <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Detalles</h4>
 <div className="flex flex-col gap-1.5">
 <Label className={etiqueta}>Zona preferida</Label>
 <Select value={zonaId ||'__any__'} onValueChange={(v) => setZonaId(v ==='__any__'?'': v)}>
 <SelectTrigger className="h-12 w-full px-3 text-base font-semibold rounded-2xl bg-card border-border shadow-xs">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="__any__" className="text-sm">Cualquier zona</SelectItem>
 {zonas.map(z => (
 <SelectItem key={z.id} value={z.id} className="text-sm">{z.nombre}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="reserva-nota" className={etiqueta}>Notas de la reserva</Label>
 <Textarea
 id="reserva-nota" rows={3}
 placeholder="Ej: Mesa cerca de la ventana..." value={nota}
 onChange={e => setNota(e.target.value)}
 className="min-h-24 text-base font-medium"
 />
 </div>
 </section>
 </main>

 <footer className="p-4 border-t border-border bg-card flex items-center gap-2 shrink-0">
 <Button type="button" variant="outline" onClick={onBack} disabled={isProcessing} className="h-12 px-5 font-bold">
 Cancelar
 </Button>
 <Button type="button" disabled={isProcessing} onClick={handleFinish} className="h-12 flex-1 font-bold">
 {isProcessing ? 'Guardando…' : isEditMode ? 'Guardar cambios' : 'Crear reserva'}
 </Button>
 </footer>
 </div>
 );
}
