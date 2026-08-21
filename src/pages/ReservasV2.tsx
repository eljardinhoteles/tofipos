import { useState, useEffect } from'react';
import { type Reserva } from'../db/database';
import { Clock, Users, CheckCircle, X } from'@phosphor-icons/react';
import { useUI } from'../context/UIContext';
import { showToast } from'@/lib/toast';

import { CalendarToolbar } from'../components/Reservas/CalendarToolbar';
import { CalendarGrid } from'../components/Reservas/CalendarGrid';
import { ProductSelector } from'../components/Mesas/ProductSelector';
import { updateRxComanda, updateRxMesa, updateRxReserva, initVerticalRxDb } from'../db/rxdb';
import { useRxReservas } from'../hooks/useRxReservas';
import { toISO } from'../components/Reservas/reservaUtils';

export default function ReservasV2() {
 const {
 openConfirm,
 setReservaView,
 setSelectedReservaId,
 setNuevaReservaPreset,
 reservaProductosComandaId,
 setReservaProductosComandaId,
 registerAssignModal,
 } = useUI();

 const [startDate, setStartDate] = useState(() => {
 const d = new Date(); d.setHours(0, 0, 0, 0); return d;
 });
 const [search, setSearch] = useState('');
 const [searchOpen, setSearchOpen] = useState(false);
 const [highlightedId, setHighlightedId] = useState<string | null>(null);
 const [calendarAnimating, setCalendarAnimating] = useState(false);

 const [assignModalOpen, setAssignModalOpen] = useState(false);
 const [reservaToAssign, setReservaToAssign] = useState<Reserva | null>(null);
 const [mesaSeleccionada, setMesaSeleccionada] = useState<string | null>(null);
 const [isAssigning, setIsAssigning] = useState(false);

 const { reservas } = useRxReservas();
 const [zonas, setZonas] = useState<any[]>([]);
 const [mesas, setMesas] = useState<any[]>([]);
 // Excluye mesas sintéticas (id 'reserva_*'/'delivery_*'/'local_*', piso
 // 'Reservas'): son placeholders que el sync crea en Supabase para
 // satisfacer la FK de comandas sin mesa física — nunca deben poder
 // asignarse como mesa real de una reserva.
 const mesasLibres = mesas.filter(m =>
 m.estado ==='libre'&&
 m.piso !=='Reservas'&&
 !/^(reserva_|delivery_|local_)/.test(m.id)
 );

 useEffect(() => {
 let alive = true;
 let zonasSub: { unsubscribe: () => void } | null = null;
 let mesasSub: { unsubscribe: () => void } | null = null;

 (async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 const zonasQuery = rxDb.pisos.find({
 selector: { organization_id: orgId, _deleted: { $ne: true } },
 sort: [{ orden:'asc'}, { nombre:'asc'}]
 });
 zonasSub = zonasQuery.$.subscribe((docs: any[]) => {
 if (!alive) return;
 setZonas(docs.map((doc: any) => doc.toJSON()));
 });
 const mesasQuery = rxDb.mesas.find({
 selector: { organization_id: orgId, _deleted: { $ne: true } },
 sort: [{ piso:'asc'}, { nombre:'asc'}]
 });
 mesasSub = mesasQuery.$.subscribe((docs: any[]) => {
 if (!alive) return;
 setMesas(docs.map((doc: any) => doc.toJSON()));
 });
 })().catch(() => {});

 return () => {
 alive = false;
 zonasSub?.unsubscribe();
 mesasSub?.unsubscribe();
 };
 }, []);

 const runCalendarTransition = (_direction: -1 | 0 | 1, updater: () => void) => {
 setCalendarAnimating(true);
 requestAnimationFrame(() => {
 updater();
 setTimeout(() => {
 setCalendarAnimating(false);
 }, 170);
 });
 };

 const shiftDays = (n: number) => {
 runCalendarTransition(n > 0 ? 1 : -1, () => {
 setStartDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + n); return d; });
 });
 };

 const goToday = () => {
 runCalendarTransition(0, () => {
 const d = new Date(); d.setHours(0, 0, 0, 0); setStartDate(d);
 });
 };

 const visibleDates: Date[] = Array.from({ length: 9 }, (_, i) => {
 const d = new Date(startDate); d.setDate(d.getDate() + i); return d;
 });

 const openDetail = (id: string) => {
 setSelectedReservaId(id);
 setReservaView('detalle');
 };

 const handleOpenAssign = (r: Reserva) => {
 // Segunda barrera además del botón deshabilitado en MiniReservaCard: este
 // modal también se puede disparar vía openAssignModal (UIContext), que no
 // pasa por el botón — así que la regla "solo el día del servicio" se
 // valida acá también.
 if (r.fecha !== toISO(new Date())) {
 showToast.error('No se puede asignar mesa todavía','Esta reserva es para otro día. Podrás asignar mesa el día del servicio.');
 return;
 }
 setReservaToAssign(r);
 setMesaSeleccionada(null);
 setAssignModalOpen(true);
 };

 useEffect(() => {
 registerAssignModal((reservaId: string) => {
 const r = reservas.find(x => x.id === reservaId);
 if (r) handleOpenAssign(r);
 });
 }, [reservas]);

 const handleAssignSubmit = async () => {
 if (!reservaToAssign || !mesaSeleccionada || !reservaToAssign.comanda_id) return;
 setIsAssigning(true);
 try {
 const mesa = mesas.find(m => m.id === mesaSeleccionada);
 await updateRxComanda(reservaToAssign.comanda_id, {
 mesa_id: mesaSeleccionada,
 mesa_nombre: mesa?.nombre || mesaSeleccionada,
 personas: reservaToAssign.personas,
 });
 await updateRxMesa(mesaSeleccionada, { estado:'ocupada'});
 await updateRxReserva(reservaToAssign.id, {
 estado:'completada',
 mesa_id: mesaSeleccionada,
 });
 showToast.success('Servicio iniciado','Reserva asignada a la mesa.');
 setAssignModalOpen(false);
 } catch (e) {
 console.error(e);
 showToast.error('Error','No se pudo asignar la mesa.');
 } finally {
 setIsAssigning(false);
 }
 };

 const handleResultClick = (r: Reserva) => {
 const fechaReserva = new Date(r.fecha +'T12:00:00');
 fechaReserva.setHours(0, 0, 0, 0);
 runCalendarTransition(0, () => setStartDate(fechaReserva));
 setHighlightedId(r.id);
 setTimeout(() => setHighlightedId(null), 3000);
 setSearch('');
 setSearchOpen(false);
 };

 const zonasRows = zonas.filter(z => z.nombre.toLowerCase() !=='habitaciones');
 if (!zonasRows.find(z => z.id ==='sin_zona')) {
 zonasRows.push({ id:'sin_zona', nombre:'Sin Zona', orden: 999 } as any);
 }

 return (
 <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden relative">
 <CalendarToolbar
 startDate={startDate}
 setStartDate={setStartDate}
 shiftDays={shiftDays}
 goToday={goToday}
 visibleDates={visibleDates}
 search={search}
 setSearch={setSearch}
 searchOpen={searchOpen}
 setSearchOpen={setSearchOpen}
 reservas={reservas}
 onResultClick={handleResultClick}
 onNewReserva={() => { setSelectedReservaId(null); setNuevaReservaPreset(null); setReservaView('nueva'); }}
 />

 <div
 className="flex-1 overflow-hidden flex flex-col transition-opacity duration-150"style={{ opacity: calendarAnimating ? 0.9 : 1 }}
 >
 {reservaProductosComandaId ? (
 <ReservaProductSelectorWrapper
 comandaId={reservaProductosComandaId}
 onBack={() => setReservaProductosComandaId(null)}
 />
 ) : (
 <CalendarGrid
 visibleDates={visibleDates}
 reservas={reservas}
 zonasRows={zonasRows}
 mesas={mesas}
 search={search}
 highlightedId={highlightedId}
 onCellClick={(date, zonaId) => {
 setSelectedReservaId(null);
 setNuevaReservaPreset({ fecha: date, zonaId });
 setReservaView('nueva');
 }}
 onCardClick={openDetail}
 onAssign={handleOpenAssign}
 onCancel={(id) => {
 openConfirm('CANCELAR RESERVA','¿Estás seguro de que deseas cancelar esta reserva? Podrás verla más tarde en el historial de canceladas.',
 async () => {
 await updateRxReserva(id, { estado:'cancelada'});
 showToast.success('Reserva cancelada');
 }
 );
 }}
 />
 )}
 </div>

 {/* Modal Asignar Mesa V2 */}
 {assignModalOpen && (
 <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4">
 <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6 gap-4">
 <div className="flex items-center justify-between border-b border-border pb-3">
 <h3 className="font-extrabold text-base text-foreground">Asignar Mesa</h3>
 <button
 type="button"onClick={() => setAssignModalOpen(false)}
 className="w-7 h-7 rounded-lg text-muted-foreground flex items-center justify-center cursor-pointer">
 <X size={16} />
 </button>
 </div>

 {reservaToAssign && (
 <div className="flex flex-col gap-4">
 <div className="p-3 bg-muted border border-border rounded-xl flex flex-col gap-1">
 <span className="font-extrabold text-sm text-foreground">{reservaToAssign.nombre}</span>
 <div className="flex items-center gap-3 text-xs text-muted-foreground font-semibold">
 <span className="flex items-center gap-1"><Clock size={14} /> {reservaToAssign.hora}</span>
 <span>·</span>
 <span className="flex items-center gap-1"><Users size={14} /> {reservaToAssign.personas} pers</span>
 </div>
 </div>

 <div className="flex flex-col gap-2">
 <label className="text-xs font-bold text-foreground">Mesa disponible</label>
 <select
 value={mesaSeleccionada ||''}
 onChange={(e) => setMesaSeleccionada(e.target.value || null)}
 className="h-10 px-3 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:border-primary font-semibold">
 <option value="">Seleccionar mesa...</option>
 {mesasLibres.map(m => (
 <option key={m.id} value={m.id}>
 {m.nombre} ({m.piso ||'Sin zona'})
 </option>
 ))}
 </select>
 </div>

 <button
 type="button"disabled={!mesaSeleccionada || isAssigning}
 onClick={handleAssignSubmit}
 className="h-10 w-full rounded-xl bg-emerald-600 disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs">
 <CheckCircle size={18} weight="bold"/>
 Iniciar Servicio
 </button>
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 );
}

function ReservaProductSelectorWrapper({ comandaId, onBack }: { comandaId: string; onBack: () => void }) {
 const [comanda, setComanda] = useState<any | null>(null);
 useEffect(() => {
 let alive = true;
 (async () => {
 const rxDb = await initVerticalRxDb();
 const doc = await rxDb.comandas.findOne(comandaId).exec();
 if (alive) setComanda(doc ? doc.toJSON() : null);
 })().catch(() => {});
 return () => { alive = false; };
 }, [comandaId]);

 const reservaComanda = comanda ?? {
 id: comandaId, mesa_id:'', mesero:'', folio: 0,
 estado:'pendiente'as const, confirmada: false, total: 0,
 sincronizado: false, created_at:'', updated_at:'',
 };
 return <ProductSelector activeComanda={reservaComanda as any} onBack={onBack} />;
}
