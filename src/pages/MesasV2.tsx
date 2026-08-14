import { useState, useEffect, useCallback, useMemo, useRef } from'react';
import { type Comanda, type Piso, type HabitacionCuenta } from'../db/database';
import { isOperativeComanda } from'../db/comandaState';
import { TableNode } from'../components/Mesas/TableNode';
import { MesasControls } from'../components/Mesas/MesasControls';
import { ProductSelector } from'../components/Mesas/ProductSelector';
import { initVerticalRxDb } from'../db/rxdb';
import { useDbEpoch } from'../hooks/useDbEpoch';
import { useIsMobile } from'../hooks/useIsMobile';
import { useRxMesas } from'../hooks/useRxMesas';
import { useRxPisos } from'../hooks/useRxPisos';
import { useRxComandas } from'../hooks/useRxComandas';
import { Plus, Basket, Bed, ClipboardText } from'@phosphor-icons/react';
import { useUI } from'../context/UIContext';
import { useSearchParams } from'react-router-dom';
import { SidebarKitchenReport } from'../components/Mesas/Sidebar/SidebarKitchenReport';
import { cn } from'@/lib/utils';

export default function MesasV2() {
 const [searchParams, setSearchParams] = useSearchParams();
 const [selectedPiso, setSelectedPiso] = useState<string>('');
 const dbEpoch = useDbEpoch();
 const isMobile = useIsMobile();
 const {
 selectedMesaId, setSelectedMesaId,
 configView, setConfigView,
 mesaView, setMesaView,
 setViewingComandaId,
 setSelectedMesaEsHabitacion,
 } = useUI();

 const scrollContainerRef = useRef<HTMLDivElement>(null);
 const chipsRefs = useRef<Record<string, HTMLElement | null>>({});
 // Refs de las secciones de piso en el scroll continuo de escritorio, para
 // que los chips actúen como anclas (scrollIntoView) en vez de filtrar.
 const pisoSectionRefs = useRef<Record<string, HTMLElement | null>>({});
 const mesasScrollRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
 const activeChip = chipsRefs.current[selectedPiso];
 if (activeChip && scrollContainerRef.current) {
 activeChip.scrollIntoView({
 behavior:'smooth',
 block:'nearest',
 inline:'center'});
 }
 }, [selectedPiso]);

 const handleOpenConfig = useCallback(() => {
 setConfigView('pisos');
 }, [setConfigView]);

 // Efecto para abrir configuración desde Ajustes
 useEffect(() => {
 if (searchParams.get('edit') ==='true') {
 handleOpenConfig();
 searchParams.delete('edit');
 setSearchParams(searchParams);
 }
 }, [handleOpenConfig, searchParams, setSearchParams]);

 const { pisos: dbPisos } = useRxPisos() as { pisos: Piso[] };
 const { mesas: allMesas } = useRxMesas() as {
 mesas: Array<{ id: string; nombre: string; estado:'libre'|'ocupada'|'cuenta'; piso: string; capacidad?: number }>
 };
 const { comandas: allComandas } = useRxComandas() as { comandas: Comanda[] };
 const [allCuentas, setAllCuentas] = useState<HabitacionCuenta[]>([]);
 const [reportSidebarOpen, setReportSidebarOpen] = useState(false);

 // Lista de nombres de pisos disponibles
 const availablePisos = useMemo(
  () => Array.from(new Set(dbPisos.map(p => p.nombre))),
 [dbPisos]
 );

 // Lista ordenada de pisos para navegación por gestos (Hotel/Habitaciones siempre al inicio)
 const allSelectablePisos = useMemo(() => {
 const list = dbPisos.map(p => p.nombre);
 const hasHotel = list.some(p => p.toLowerCase() ==='habitaciones');
 const filtered = list.filter(p => p.toLowerCase() !=='habitaciones');
 if (hasHotel) {
 const hotelPisoName = list.find(p => p.toLowerCase() ==='habitaciones')!;
 return [hotelPisoName, ...filtered];
 }
 return filtered;
 }, [dbPisos]);

 // Gesto swipe horizontal nativo
 const touchStartX = useRef(0);
 const touchEndX = useRef(0);

 const handleTouchStart = (e: React.TouchEvent) => {
 touchStartX.current = e.targetTouches[0].clientX;
 touchEndX.current = e.targetTouches[0].clientX;
 };

 const handleTouchMove = (e: React.TouchEvent) => {
 touchEndX.current = e.targetTouches[0].clientX;
 };

 const handleTouchEnd = () => {
 const diffX = touchStartX.current - touchEndX.current;
 if (Math.abs(diffX) > 80) {
 const currentIndex = allSelectablePisos.findIndex(
 p => p.toLowerCase() === selectedPiso.toLowerCase()
 );
 if (currentIndex !== -1) {
 if (diffX > 0) {
 const nextIndex = Math.min(allSelectablePisos.length - 1, currentIndex + 1);
 if (nextIndex !== currentIndex) {
 setSelectedPiso(allSelectablePisos[nextIndex]);
 }
 } else {
 const prevIndex = Math.max(0, currentIndex - 1);
 if (prevIndex !== currentIndex) {
 setSelectedPiso(allSelectablePisos[prevIndex]);
 }
 }
 }
 }
 };

 // Mesas, pisos y comandas ya vienen de los hooks compartidos de arriba.
 // Solo las cuentas de habitación activas siguen con suscripción propia: es
 // una consulta filtrada y específica de esta pantalla, no un candidato a
 // compartir entre páginas.
 useEffect(() => {
 let active = true;
 let cuentasSub: { unsubscribe: () => void } | null = null;

 (async () => {
 const rxDb = await initVerticalRxDb();
 if (!active) return;
 const orgId = localStorage.getItem('pos_active_org_id') ||'';

 const cuentasQuery = rxDb.habitacion_cuentas.find({
 selector: {
 organization_id: orgId,
 estado:'activa',
 _deleted: { $ne: true }
 }
 });
 cuentasSub = cuentasQuery.$.subscribe((docs: any[]) => {
 if (!active) return;
 setAllCuentas(docs.map((doc: any) => doc.toJSON()));
 });
 if (!active) cuentasSub?.unsubscribe();
 })().catch(err => console.warn('Error cargando RxDB para MesasV2:', err));

 return () => {
 active = false;
 cuentasSub?.unsubscribe();
 };
 }, [dbEpoch]);

 const isHabitacionesSeleccionado = selectedPiso.toLowerCase() ==='habitaciones';

 // En escritorio, fuera de la sección Habitaciones (que sigue con su propio
 // flujo de filtro), se muestran TODAS las mesas de TODOS los pisos en una
 // sola página con scroll continuo; los chips pasan a ser anclas. En móvil
 // (o dentro de Habitaciones) se mantiene el filtro estricto por piso.
 const showAllPisos = !isMobile && !isHabitacionesSeleccionado;

 const mesasToShow = useMemo(
 () => allMesas
 .filter(m => showAllPisos
 ? m.piso?.toLowerCase() !=='habitaciones': m.piso === selectedPiso)
 .sort((a, b) =>
 (showAllPisos ? (a.piso ||'').localeCompare(b.piso ||'') : 0) ||
 a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity:'base'})),
 [allMesas, selectedPiso, showAllPisos]
 );

 // Mesas agrupadas por piso, en el orden de`availablePisos`, para renderizar
 // las secciones del scroll continuo en escritorio.
 const mesasPorPiso = useMemo(() => {
 if (!showAllPisos) return [];
 const byPiso = new Map<string, typeof mesasToShow>();
 for (const mesa of mesasToShow) {
 const list = byPiso.get(mesa.piso) || [];
 list.push(mesa);
 byPiso.set(mesa.piso, list);
 }
 return availablePisos
 .filter(p => p.toLowerCase() !=='habitaciones')
 .map(piso => ({ piso, mesas: byPiso.get(piso) || [] }))
 .filter(group => group.mesas.length > 0);
 }, [showAllPisos, mesasToShow, availablePisos]);

 // Cache de referencias estables por mesa: RxDB emite arrays/objetos nuevos en
 // cada escritura (local o de sync), aunque el contenido visual no cambie. Sin
 // esta cache,`mesaConEstado`/`mesaComanda`cambian de referencia en cada
 // emisión y el memo() de TableNode nunca evita el re-render, causando
 // parpadeo/lentitud sobre todo mientras sincroniza en background.
 const derivedCacheRef = useRef(new Map<string, {
 entry: {
 mesaConEstado: typeof mesasToShow[number] & { estado:'libre'|'ocupada'|'cuenta'};
 mesaComanda: Comanda | undefined;
 clienteNombre: string | undefined;
 isHabitacion: boolean;
 habitacionAsociada: string;
 };
 signature: string;
 }>());

 const [mesaDerivedData, nextCache] = useMemo(() => {
 const comandaByMesaId = new Map<string, Comanda>();
 for (const c of allComandas) {
 if (isOperativeComanda(c) && !comandaByMesaId.has(c.mesa_id)) comandaByMesaId.set(c.mesa_id, c);
 }
 const cuentaByMesaId = new Map<string, HabitacionCuenta>();
 const cuentaById = new Map<string, HabitacionCuenta>();
 for (const c of allCuentas) {
 if (!cuentaByMesaId.has(c.mesa_id)) cuentaByMesaId.set(c.mesa_id, c);
 cuentaById.set(c.id, c);
 }
 const mesaById = new Map(allMesas.map(m => [m.id, m]));

 const map = new Map<string, {
 mesaConEstado: typeof mesasToShow[number] & { estado:'libre'|'ocupada'|'cuenta'};
 mesaComanda: Comanda | undefined;
 clienteNombre: string | undefined;
 isHabitacion: boolean;
 habitacionAsociada: string;
 }>();

 const cache = derivedCacheRef.current;
 const nextCache = new Map<string, { entry: typeof map extends Map<string, infer V> ? V : never; signature: string }>();

 for (const mesa of mesasToShow) {
 // Se evalúa por mesa (no por`selectedPiso`global) para que el modo
 //"todos los pisos"de escritorio derive el estado correcto de cada
 // mesa según su propio piso.
 const isHabitacionPiso = mesa.piso?.toLowerCase() ==='habitaciones';
 const mesaComanda = comandaByMesaId.get(mesa.id);
 const mesaCuenta = cuentaByMesaId.get(mesa.id);
 const clienteNombre = mesaCuenta ? mesaCuenta.huesped : mesaComanda?.cliente;
 const estadoVisual:'libre'|'ocupada'|'cuenta'= isHabitacionPiso
 ? (mesaCuenta ?'ocupada':'libre')
 : (mesaComanda ? (mesaComanda.estado ==='cuenta'?'cuenta':'ocupada') :'libre');

 let habitacionAsociada ='';
 if (!isHabitacionPiso && mesaComanda?.habitacion_cuenta_id) {
 const cuenta = cuentaById.get(mesaComanda.habitacion_cuenta_id);
 const roomMesa = cuenta ? mesaById.get(cuenta.mesa_id) : undefined;
 if (roomMesa) habitacionAsociada = roomMesa.nombre;
 }

 // Firma con solo los campos que afectan el render visual de TableNode.
 // Si no cambió nada relevante, reusamos la MISMA referencia del render
 // anterior para que memo() de TableNode evite el re-render.
 const signature = JSON.stringify([
 mesa.nombre, mesa.estado, mesa.capacidad, estadoVisual,
 clienteNombre, isHabitacionPiso, habitacionAsociada,
 mesaComanda?.id, mesaComanda?.estado, mesaComanda?.habitacion_cuenta_id,
 ]);

 const cached = cache.get(mesa.id);
 const entry = cached && cached.signature === signature
 ? cached.entry
 : {
 mesaConEstado: { ...mesa, estado: estadoVisual },
 mesaComanda,
 clienteNombre,
 isHabitacion: isHabitacionPiso,
 habitacionAsociada,
 };

 nextCache.set(mesa.id, { entry, signature });
 map.set(mesa.id, entry);
 }
 return [map, nextCache] as const;
 }, [mesasToShow, allComandas, allCuentas, allMesas, selectedPiso]);

 useEffect(() => {
 derivedCacheRef.current = nextCache;
 }, [nextCache]);

 const handleSelectMesa = useCallback((mesa: { id: string }) => {
 setSelectedMesaEsHabitacion(isHabitacionesSeleccionado);
 setSelectedMesaId(mesa.id);
 setViewingComandaId(null);
 setConfigView('none');
 }, [isHabitacionesSeleccionado, setSelectedMesaEsHabitacion, setSelectedMesaId, setViewingComandaId, setConfigView]);

 useEffect(() => {
 if (dbPisos.length === 0) return;
 if (selectedPiso && dbPisos.some(p => p.nombre === selectedPiso)) return;
 const firstNonHotel = dbPisos
 .map(p => p.nombre)
 .find(p => p.toLowerCase() !=='habitaciones');
 setSelectedPiso(firstNonHotel ?? dbPisos[0].nombre);
 }, [dbPisos, selectedPiso]);

 return (
 <div className="flex h-full w-full relative">

 {/* ÁREA PRINCIPAL */}
 <div className="flex-1 overflow-hidden relative min-w-0 flex flex-col">

 {mesaView ==='mapa'&& (
 <div className="shrink-0 flex flex-col">
 {/* Header V2 Tailwind/Shadcn style */}
 <header className="h-14 px-6 bg-card border-b border-border flex items-center justify-between shadow-xs">
 <h1 className="font-extrabold text-base text-foreground truncate max-w-[240px]">
 {localStorage.getItem('pos_org_name_cached') ||'POS'}
 </h1>
 <div className="flex items-center gap-3 shrink-0">
 <button
 type="button"title="Ver Productos"onClick={(e) => {
 e.stopPropagation();
 setMesaView('productos');
 }}
 className="w-9 h-9 rounded-lg bg-amber-500 active:scale-95 text-white flex items-center justify-center transition-all shadow-xs shrink-0 cursor-pointer">
 <Basket size={18} weight="bold"/>
 </button>

 <button
 type="button"title="Reporte Consolidado Cocina"onClick={(e) => {
 e.stopPropagation();
 setReportSidebarOpen(true);
 }}
 className="hidden sm:flex w-9 h-9 rounded-lg bg-primary/10 active:scale-95 text-primary items-center justify-center transition-all shrink-0 cursor-pointer">
 <ClipboardText size={18} weight="bold"/>
 </button>
 </div>
 </header>

 {/* Selector de pisos / chips */}
 <div
 ref={scrollContainerRef}
 className="h-13 px-6 flex items-center shrink-0 z-10 overflow-x-auto hide-scrollbar">
 <div className="flex items-center gap-3 min-w-max w-full">
 <button
 type="button"ref={(el) => { chipsRefs.current['Habitaciones'] = el; }}
 onClick={() => {
 const habitacionesPiso = availablePisos.find(p => p.toLowerCase() ==='habitaciones');
 if (habitacionesPiso) {
 setSelectedPiso(habitacionesPiso);
 } else {
 initVerticalRxDb().then(rxDb =>
 rxDb.pisos.insert({
 id: crypto.randomUUID(),
 nombre:'Habitaciones',
 orden: dbPisos.length,
 organization_id: localStorage.getItem('pos_active_org_id') ||'',
 _deleted: false,
 _modified: new Date().toISOString(),
 })
 ).then(() => setSelectedPiso('Habitaciones'))
 .catch(err => console.warn('Error creando Habitaciones:', err));
 }
 }}
 className={cn("h-8 px-3 rounded-md flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer shrink-0",
 selectedPiso.toLowerCase() ==='habitaciones'?"bg-primary text-primary-foreground shadow-xs":"bg-transparent text-muted-foreground")}
 >
 <Bed size={18} />
 Hotel
 </button>

 <div className="w-[1px] h-6 bg-border shrink-0"/>

 <div className="flex items-center gap-2 min-w-max flex-1">
 {availablePisos.filter(p => p.toLowerCase() !=='habitaciones').map(piso => {
 const active = piso === selectedPiso;
 return (
 <button
 key={piso}
 type="button"ref={(el) => { chipsRefs.current[piso] = el; }}
 onClick={() => {
 setSelectedPiso(piso);
 // En escritorio (todas las mesas en una sola página) el
 // chip actúa como ancla: mueve el scroll a la sección de
 // ese piso en vez de filtrar qué mesas se muestran.
 if (showAllPisos) {
 pisoSectionRefs.current[piso]?.scrollIntoView({ behavior:'smooth', block:'start'});
 }
 }}
 className={cn("px-3.5 py-1.5 rounded-full text-xs transition-all cursor-pointer whitespace-nowrap border",
 active
 ?"bg-primary text-primary-foreground font-bold border-primary shadow-xs":"bg-card text-muted-foreground font-medium border-border")}
 >
 {piso}
 </button>
 );
 })}
 <button
 type="button"onClick={() => setConfigView('pisos')}
 className={cn("px-3.5 py-1.5 rounded-full text-xs transition-all cursor-pointer whitespace-nowrap border border-dashed font-semibold",
 configView !=='none'?"bg-primary/10 text-primary border-primary/40":"bg-transparent text-muted-foreground border-border")}
 >
 + Añadir
 </button>
 </div>
 </div>
 </div>
 </div>
 )}

 <div
 onTouchStart={mesaView !=='productos'? handleTouchStart : undefined}
 onTouchMove={mesaView !=='productos'? handleTouchMove : undefined}
 onTouchEnd={mesaView !=='productos'? handleTouchEnd : undefined}
 className="flex-1 relative overflow-hidden touch-pan-y">
 {mesaView ==='productos'? (
 <ProductSelectorWrapper
 mesaId={selectedMesaId}
 onBack={() => setMesaView('mapa')}
 />
 ) : (
 <div className="h-full overflow-y-auto p-5 pb-24">
 <MesasControls
 availablePisos={availablePisos}
 selectedPiso={selectedPiso}
 onPisoChange={setSelectedPiso}
 onOpenManage={() => setConfigView('pisos')}
 onOpenAddTable={() => setConfigView('nueva_mesa')}
 isEditMode={configView !=='none'}
 onToggleEditMode={() => setConfigView(configView ==='none'?'nueva_mesa':'none')}
 hideChips={true}
 />

 {availablePisos.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-20 gap-6">
 <div className="flex flex-col items-center gap-2 text-center">
 <div className="w-24 h-24 flex items-center justify-center">
 <img src={selectedPiso.toLowerCase() ==='habitaciones'?'/hotel.webp':'/Mesas.webp'} alt=""aria-hidden="true"className="w-full h-full object-contain"/>
 </div>
 <h2 className="text-foreground font-extrabold text-xl">No hay zonas creadas</h2>
 <p className="text-muted-foreground text-sm max-w-xs">
 Crea tu primera zona o piso para empezar a agregar mesas.
 </p>
 </div>
 <button
 type="button"onClick={(e) => { e.stopPropagation(); handleOpenConfig(); }}
 className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-all shadow-xs cursor-pointer">
 <Plus size={18} weight="bold"/>
 Crear primera zona
 </button>
 </div>
 ) : mesasToShow.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-20 gap-6">
 <div className="flex flex-col items-center gap-2 text-center">
 <div className="w-24 h-24 flex items-center justify-center">
 <img src={isHabitacionesSeleccionado ?'/hotel.webp':'/Mesas.webp'} alt=""aria-hidden="true"className="w-full h-full object-contain"/>
 </div>
 <h2 className="text-foreground font-extrabold text-xl">
 {isHabitacionesSeleccionado
 ?'No hay habitaciones': showAllPisos
 ?'No hay mesas creadas':`No hay mesas en ${selectedPiso}`}
 </h2>
 <p className="text-muted-foreground text-sm max-w-xs">
 {isHabitacionesSeleccionado
 ?'Añade las habitaciones del hotel para empezar a gestionar cuentas.':'Comienza configurando el plano de esta zona añadiendo tu primera mesa.'}
 </p>
 </div>
 <button
 type="button"onClick={(e) => { e.stopPropagation(); handleOpenConfig(); }}
 className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-all shadow-xs cursor-pointer">
 <Plus size={18} weight="bold"/>
 {isHabitacionesSeleccionado ?'Añadir Habitación':'Añadir Primera Mesa'}
 </button>
 </div>
 ) : showAllPisos ? (
 // Escritorio: todas las mesas de todos los pisos en una sola
 // página, agrupadas por sección con scroll vertical continuo.
 // Los chips de arriba anclan el scroll a cada sección.
 <div ref={mesasScrollRef} className="flex flex-col gap-8">
 {mesasPorPiso.map(({ piso, mesas }) => (
 <div
 key={piso}
 ref={(el) => { pisoSectionRefs.current[piso] = el; }}
 className="flex flex-col gap-4 scroll-mt-4">
 <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
 {piso}
 </h2>
 <div className="pos-tables-grid">
 {mesas.map((mesa) => {
 const derived = mesaDerivedData.get(mesa.id);
 if (!derived) return null;
 const { mesaConEstado, mesaComanda, clienteNombre, isHabitacion, habitacionAsociada } = derived;

 return (
 <div key={mesa.id} className="overflow-visible">
 <TableNode
 mesa={mesaConEstado as any}
 isSelected={selectedMesaId === mesa.id}
 cliente={clienteNombre}
 isHabitacion={isHabitacion}
 activeComanda={mesaComanda}
 roomBadge={habitacionAsociada}
 onSelect={handleSelectMesa}
 />
 </div>
 );
 })}
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="pos-tables-grid">
 {mesasToShow.map((mesa) => {
 const derived = mesaDerivedData.get(mesa.id);
 if (!derived) return null;
 const { mesaConEstado, mesaComanda, clienteNombre, isHabitacion, habitacionAsociada } = derived;

 return (
 <div key={mesa.id} className="overflow-visible">
 <TableNode
 mesa={mesaConEstado as any}
 isSelected={selectedMesaId === mesa.id}
 cliente={clienteNombre}
 isHabitacion={isHabitacion}
 activeComanda={mesaComanda}
 roomBadge={habitacionAsociada}
 onSelect={handleSelectMesa}
 />
 </div>
 );
 })}
 </div>
 )}
 </div>
 )}
 </div>
 </div>

 <SidebarKitchenReport
 opened={reportSidebarOpen}
 onClose={() => setReportSidebarOpen(false)}
 allMesas={allMesas}
 allComandas={allComandas}
 allCuentas={allCuentas}
 />
 </div>
 );
}

function ProductSelectorWrapper({ mesaId, onBack }: { mesaId: string | null; onBack: () => void }) {
 const [activeComanda, setActiveComanda] = useState<Comanda | null>(null);

 useEffect(() => {
 let active = true;
 let sub: { unsubscribe: () => void } | null = null;

 (async () => {
 if (!mesaId) {
 if (active) setActiveComanda(null);
 return;
 }

 const rxDb = await initVerticalRxDb();
 if (!active) return;

 const query = rxDb.comandas.find({
 selector: {
 mesa_id: mesaId,
 organization_id: localStorage.getItem('pos_active_org_id') ||''}
 });

 sub = query.$.subscribe((docs: any[]) => {
 if (!active) return;
 const operative = docs
 .map((doc: any) => doc.toJSON())
 .filter((c: Comanda) => isOperativeComanda(c))[0] ?? null;
 setActiveComanda(operative);
 });
 if (!active) sub?.unsubscribe();
 })().catch(err => console.warn('Error cargando comanda activa para selector:', err));

 return () => {
 active = false;
 sub?.unsubscribe();
 };
 }, [mesaId]);

 return <ProductSelector activeComanda={activeComanda} onBack={onBack} />;
}
