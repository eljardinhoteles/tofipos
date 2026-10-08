import { useState, useEffect } from'react';
import { type Reserva } from'../db/database';
import { useUI } from'../context/UIContext';
import { showToast } from'@/lib/toast';

import { AsignarMesaModal } from'../components/Reservas/AsignarMesaModal';
import { CalendarHeader } from'../components/Reservas/CalendarToolbar';
import { PageFrame, PageContent } from'../components/Common/PageHeader';
import { CalendarGrid } from'../components/Reservas/CalendarGrid';
import { ReservasLista } from'../components/Reservas/ReservasLista';
import { useIsMobile } from'../hooks/useIsMobile';
import { ProductSelector } from'../components/Mesas/ProductSelector';
import { updateRxReserva, initVerticalRxDb } from'../db/rxdb';
import { useRxReservas } from'../hooks/useRxReservas';
import { useRxComandas } from'../hooks/useRxComandas';
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
 const isMobile = useIsMobile();
 // Por defecto: lista en celular y calendario en PC. El botón del header cambia
 // la vista solo mientras se está en la pantalla; al volver vuelve a la de siempre.
 const [vistaElegida, setVistaElegida] = useState<'calendario' | 'lista' | null>(null);
 const vista = vistaElegida ?? (isMobile ? 'lista' : 'calendario');
 const cambiarVista = () => setVistaElegida(vista === 'lista' ? 'calendario' : 'lista');
 const [search, setSearch] = useState('');
 const [searchOpen, setSearchOpen] = useState(false);
 const [highlightedId, setHighlightedId] = useState<string | null>(null);
 const [calendarAnimating, setCalendarAnimating] = useState(false);

 const [reservaToAssign, setReservaToAssign] = useState<Reserva | null>(null);

 const { reservas } = useRxReservas();
 const [zonas, setZonas] = useState<any[]>([]);
 const [mesas, setMesas] = useState<any[]>([]);
 // Excluye mesas sintéticas (id 'reserva_*'/'delivery_*'/'local_*', piso
 // 'Reservas'): son placeholders que el sync crea en Supabase para
 // satisfacer la FK de comandas sin mesa física — nunca deben poder
 // asignarse como mesa real de una reserva.
 // Mismas mesas que ofrece "Cambiar mesa": libres de verdad (sin comanda
 // operativa apuntándoles, aunque mesa.estado quede desfasado) y sin
 // habitaciones, que tienen su propio flujo de cuentas.
 const { comandas } = useRxComandas() as { comandas: any[] };

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
 // Segunda barrera además del botón deshabilitado en ReservaCard: este
 // modal también se puede disparar vía openAssignModal (UIContext), que no
 // pasa por el botón — así que la regla "solo el día del servicio" se
 // valida acá también.
 if (r.fecha !== toISO(new Date())) {
 showToast.error('No se puede asignar mesa todavía','Esta reserva es para otro día. Podrás asignar mesa el día del servicio.');
 return;
 }
 setReservaToAssign(r);
 };

 useEffect(() => {
 registerAssignModal((reservaId: string) => {
 const r = reservas.find(x => x.id === reservaId);
 if (r) handleOpenAssign(r);
 });
 }, [reservas, registerAssignModal]);

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
 <PageFrame className="relative">
 {!reservaProductosComandaId && (
 <CalendarHeader
 visibleDates={visibleDates}
 search={search}
 setSearch={setSearch}
 searchOpen={searchOpen}
 setSearchOpen={setSearchOpen}
 reservas={reservas}
 onResultClick={handleResultClick}
 onNewReserva={() => { setSelectedReservaId(null); setNuevaReservaPreset(null); setReservaView('nueva'); }}
 vista={vista}
 onCambiarVista={cambiarVista}
 />
 )}

 <PageContent className={reservaProductosComandaId ? 'bg-nav rounded-none md:rounded-none' : undefined}>
 <div
 className="flex-1 overflow-hidden flex flex-col transition-opacity duration-150"style={{ opacity: calendarAnimating ? 0.9 : 1 }}
 >
 {reservaProductosComandaId ? (
 <ReservaProductSelectorWrapper
 comandaId={reservaProductosComandaId}
 onBack={() => setReservaProductosComandaId(null)}
 />
 ) : vista === 'lista' ? (
 <ReservasLista
 reservas={reservas}
 mesas={mesas}
 search={search}
 onCardClick={openDetail}
 onAssign={handleOpenAssign}
 />
 ) : (
 <CalendarGrid
 startDate={startDate}
 setStartDate={setStartDate}
 shiftDays={shiftDays}
 goToday={goToday}
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

 </PageContent>

 <AsignarMesaModal reserva={reservaToAssign} mesas={mesas} comandas={comandas} onClose={() => setReservaToAssign(null)} />
 </PageFrame>
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
