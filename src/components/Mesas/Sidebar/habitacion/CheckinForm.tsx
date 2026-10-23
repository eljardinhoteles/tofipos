import { useEffect, useState } from'react';
import dayjs from'dayjs';
import'dayjs/locale/es';
import { Bed } from'@phosphor-icons/react';
import { type Mesa } from'../../../../db/database';
import { showToast } from'@/lib/toast';
import { checkinReservaCloudbeds } from'../../../../lib/cloudbeds';
import { initVerticalRxDb, createRxHabitacionCuenta, updateRxMesa, type RxCliente } from'../../../../db/rxdb';
import { Switch } from'@/components/ui/switch';
import { listarHabitaciones, habitacionDeUnidad, type HabitacionHotel } from'../../../../lib/hotelHabitacionesApi';
import { cambiarCabanaReservaHotel, listarReservasHotel, registrarCheckHotel, type ReservaHotel } from'../../../../lib/hotelReservasApi';
import { Textarea } from'@/components/ui/textarea';
import { Label } from'@/components/ui/label';
import { Button } from'@/components/ui/button';
import { DatePickerField } from'@/components/ui/date-picker-field';
import { useUI } from'../../../../context/UIContext';
import { ReservaHeader } from'../ReservaHeader';
import { ClienteSelector } from'@/components/Common/ClienteSelector';

dayjs.locale('es');

export function CheckinForm({ selectedMesa, onClose }: { selectedMesa: Mesa; onClose: () => void }) {
 const [isLoading, setIsLoading] = useState(false);
 // Llegada elegida en las tarjetas de Mesas › Hotel: precarga huésped y fechas, y deja la cuenta ligada a esa venta.
 const { llegadaCheckin, setLlegadaCheckin } = useUI();
 const [huesped, setHuesped] = useState(llegadaCheckin?.huesped ?? '');
 const [checkIn, setCheckIn] = useState(() => llegadaCheckin?.llegada ?? dayjs().format('YYYY-MM-DD'));
 const [checkOut, setCheckOut] = useState(llegadaCheckin?.salida ?? '');
 const [notas, setNotas] = useState('');
 const [clienteSeleccionado, setClienteSeleccionado] = useState<RxCliente | null>(null);
 // Cloudbeds: check-in al abrir la cuenta (se puede apagar) y, si esta habitación no es la reservada, moverla.
 const cloudbedsId = llegadaCheckin?.cloudbedsId;
 const [hacerCheckin, setHacerCheckin] = useState(true);
 const [moverReserva, setMoverReserva] = useState(true);
 const [reserva, setReserva] = useState<ReservaHotel | null>(null);
 const [destino, setDestino] = useState<HabitacionHotel | null>(null);
 const [reservada, setReservada] = useState<HabitacionHotel | null>(null);
 useEffect(() => {
 if (!llegadaCheckin?.reservaId || !cloudbedsId) return;
 let vigente = true;
 Promise.all([listarReservasHotel(llegadaCheckin.llegada, llegadaCheckin.llegada), listarHabitaciones()]).then(([reservas, habs]) => {
 if (!vigente) return;
 const r = reservas.find((x) => x.id === llegadaCheckin.reservaId) ?? null;
 setReserva(r);
 setDestino(habs.find((h) => h.mesa_id === selectedMesa.id) ?? null);
 setReservada(r ? habitacionDeUnidad(habs, r.room_type_id, r.room_id) ?? null : null);
 }).catch(() => { /* sin datos no se ofrece mover; el check-in sigue siendo posible */ });
 return () => { vigente = false; };
 }, [llegadaCheckin?.reservaId, llegadaCheckin?.llegada, cloudbedsId, selectedMesa.id]);
 const hayCambioDeHabitacion = !!reserva && !!destino && !!destino.cloudbeds_room_type_id && (!reservada || reservada.id !== destino.id);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!huesped.trim()) {
 showToast.warning('Ingresa el nombre del huésped');
 return;
 }

 setIsLoading(true);
 try {
 const clienteMatch = clienteSeleccionado?.nombre.trim().toLowerCase() === huesped.trim().toLowerCase()
 ? clienteSeleccionado
 : null;
 // Evita duplicar la cuenta si la habitación ya tiene una activa
 // (otro dispositivo, o la mesa figuraba libre por error).
 const rxDb = await initVerticalRxDb();
 const existente = await rxDb.habitacion_cuentas.findOne({
 selector: { mesa_id: selectedMesa.id, estado:'activa', _deleted: { $ne: true } }
 }).exec();
 if (existente) {
 await updateRxMesa(selectedMesa.id, { estado:'ocupada'});
 showToast.warning('La habitación ya tiene una cuenta abierta');
 onClose();
 return;
 }
 const cuentaId = crypto.randomUUID();
 const now = new Date().toISOString();

 await createRxHabitacionCuenta({
 id: cuentaId,
 mesa_id: selectedMesa.id,
 huesped: huesped.trim(),
 cliente_id: clienteMatch?.id ?? (llegadaCheckin && huesped.trim() === llegadaCheckin.huesped ? llegadaCheckin.clienteId : undefined),
 venta_id: llegadaCheckin?.ventaId,
 reserva_hotel_id: llegadaCheckin?.reservaId,
 check_in: checkIn,
 check_out: checkOut || undefined,
 estado:'activa',
 notas: notas.trim() || undefined,
 organization_id: localStorage.getItem('pos_active_org_id') ||'',
 created_at: now,
 updated_at: now,
 });

 await updateRxMesa(selectedMesa.id, { estado:'ocupada'});
 setLlegadaCheckin(null);
 showToast.success('Cuenta abierta',`${selectedMesa.nombre} — ${huesped}`);
 // Check-in en Cloudbeds: no bloquea la cuenta; si falla, se hace a mano desde Cloudbeds.
 if (cloudbedsId && hacerCheckin) {
 void (async () => {
 try {
 if (hayCambioDeHabitacion && moverReserva && reserva && destino?.cloudbeds_room_type_id) {
 // Se mantiene la tarifa pactada: cambiarla es decisión de recepción desde Hotel.
 await cambiarCabanaReservaHotel(reserva, { roomTypeID: destino.cloudbeds_room_type_id, nombre: destino.nombre, roomID: destino.cloudbeds_room_id }, { tarifa: { modo: 'mantener' } });
 }
 } catch (e) {
 showToast.fallo('mover la reserva a esta habitación', e);
 return; // sin moverla no se hace el check-in: quedaría en la habitación equivocada
 }
 try { await checkinReservaCloudbeds(cloudbedsId); if (llegadaCheckin?.reservaId) registrarCheckHotel([llegadaCheckin.reservaId], 'checkin'); }
 catch { showToast.warning('No se pudo hacer el check-in en Cloudbeds', 'La cuenta quedó abierta: hazlo desde Cloudbeds.'); }
 })();
 }
 onClose();
 } catch (error) {
 console.error('Error al abrir cuenta:', error);
 showToast.fallo('abrir la cuenta', error);
 } finally {
 setIsLoading(false);
 }
 };

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 <ReservaHeader tono="info" badge={<Bed size={20} weight="bold"/>} titulo="Iniciar cuenta"
 subtitulo={`Habitación ${selectedMesa.nombre.replace(/\D/g,'') || selectedMesa.nombre}`} onClose={onClose} />

 <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
 <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
 <div className="flex flex-col gap-2">
 <Label className="t-etiqueta! text-muted-foreground">Nombre del huésped *</Label>
 <ClienteSelector
 tono="info"
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
 <div className="flex flex-col gap-2">
 <Label className="t-etiqueta! text-muted-foreground">Check-in</Label>
 <DatePickerField value={checkIn} onChange={setCheckIn} className="h-12 bg-card border-border" />
 </div>

 <div className="flex flex-col gap-2">
 <Label className="t-etiqueta! text-muted-foreground">Check-out</Label>
 <DatePickerField value={checkOut} onChange={setCheckOut} className="h-12 bg-card border-border" />
 </div>
 </div>

 <div className="flex flex-col gap-2">
 <Label className="t-etiqueta! text-muted-foreground">Notas / Observaciones</Label>
 <Textarea
 rows={3}
 placeholder="Observaciones de la estancia..." value={notas}
 onChange={(e) => setNotas(e.target.value)}
 className="min-h-24 text-base"
 />
 </div>

 {cloudbedsId && (
 <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
 <label className="flex items-center justify-between gap-3 cursor-pointer">
 <span className="flex flex-col"><span className="t-cuerpo-fuerte">Check-in en Cloudbeds</span><span className="t-meta text-muted-foreground">Marca la reserva como «En casa» al abrir la cuenta</span></span>
 <Switch checked={hacerCheckin} onCheckedChange={setHacerCheckin} />
 </label>
 {hacerCheckin && hayCambioDeHabitacion && destino && (
 <label className="flex items-center justify-between gap-3 cursor-pointer border-t border-border pt-3">
 <span className="flex flex-col"><span className="t-cuerpo-fuerte">Mover la reserva a {destino.nombre}</span><span className="t-meta text-muted-foreground">{reservada ? `Estaba en ${reservada.nombre}` : 'Es otra habitación que la reservada'}; se conserva la tarifa pactada</span></span>
 <Switch checked={moverReserva} onCheckedChange={setMoverReserva} />
 </label>
 )}
 </div>
 )}

 </div>

 <footer className="p-4 border-t border-border bg-muted/40 flex items-center gap-2 shrink-0">
 <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="h-12 px-5 font-bold">
 Cancelar
 </Button>
 <Button type="submit" disabled={isLoading || !huesped.trim()} className="h-12 flex-1 gap-2 font-bold bg-info text-white border-info hover:bg-info">
 <Bed size={18} weight="bold"/> {isLoading ? 'Abriendo…' : 'Abrir cuenta'}
 </Button>
 </footer>
 </form>
 </div>
 );
}
