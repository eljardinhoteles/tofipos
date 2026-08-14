import { useState, useMemo, useEffect, useRef } from'react';
import { MagnifyingGlass, Clock, ForkKnife, Calendar, CheckCircle, XCircle, Receipt, Door } from'@phosphor-icons/react';
import { type Comanda, type Mesa, type ComandaItem, type HabitacionCuenta, type Reserva } from'../db/database';
import { useUI } from'../context/UIContext';
import { showToast } from'@/lib/toast';
import dayjs from'dayjs';
import { initVerticalRxDb } from'../db/rxdb';
import { useDbEpoch } from'../hooks/useDbEpoch';
import { useIvaActivo } from'../hooks/useIvaActivo';
import { Input } from'@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from'@/components/ui/popover';
import { Calendar as CalendarPicker } from'@/components/ui/calendar';
import { useRxMenuCatalog } from'../hooks/useRxMenuCatalog';
import { useRxMesas } from'../hooks/useRxMesas';
import { useRxComandas } from'../hooks/useRxComandas';
import { calcularTotalesComanda } from'../lib/taxUtils';
import { cn } from'@/lib/utils';

const FILTER_TABS = [
  { value: 'historico', label: 'Histórico' },
  { value: 'anuladas', label: 'Anuladas' },
];

export default function OrdenesV2() {
 const [status, setStatus] = useState('historico');
 const scrollContainerRef = useRef<HTMLDivElement>(null);
 const chipsRefs = useRef<Record<string, HTMLButtonElement | null>>({});

 useEffect(() => {
 const activeChip = chipsRefs.current[status];
 if (activeChip && scrollContainerRef.current) {
 activeChip.scrollIntoView({
 behavior:'smooth',
 block:'nearest',
 inline:'center'});
 }
 }, [status]);

 const [searchQuery, setSearchQuery] = useState('');
 const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
 const [calendarOpen, setCalendarOpen] = useState(false);
 const {
 setSelectedMesaId,
 setViewingComandaId,
 setCheckoutView,
 setConfigView,
 setReservaView,
 setSelectedReservaId,
 } = useUI();

 const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
 const { menuItems } = useRxMenuCatalog();

 const dbEpoch = useDbEpoch();
 // Mesas y comandas vienen de los hooks compartidos: una única suscripción
 // real por colección reutilizada entre Mesas/Órdenes/Clientes/TableSidebar,
 // en vez de que cada página abra su propia query redundante.
 const { mesas } = useRxMesas() as { mesas: Mesa[] };
 const { comandas } = useRxComandas() as { comandas: Comanda[] };
 const [comandaItems, setComandaItems] = useState<ComandaItem[]>([]);
 const [habitacionCuentas, setHabitacionCuentas] = useState<HabitacionCuenta[]>([]);
 const [, setReservas] = useState<Reserva[]>([]);

 useEffect(() => {
 let active = true;
 let itemsSub: { unsubscribe: () => void } | null = null;
 let cuentasSub: { unsubscribe: () => void } | null = null;
 let reservasSub: { unsubscribe: () => void } | null = null;

 (async () => {
 const rxDb = await initVerticalRxDb();
 if (!active) return;
 const orgId = localStorage.getItem('pos_active_org_id') ||'';

 itemsSub = rxDb.comanda_items.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
 if (!active) return;
 setComandaItems(docs.map((doc: any) => doc.toJSON()));
 });
 cuentasSub = rxDb.habitacion_cuentas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
 if (!active) return;
 setHabitacionCuentas(docs.map((doc: any) => doc.toJSON()));
 });
 reservasSub = rxDb.reservas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
 if (!active) return;
 setReservas(docs.map((doc: any) => doc.toJSON()));
 });
 if (!active) {
 itemsSub?.unsubscribe();
 cuentasSub?.unsubscribe();
 reservasSub?.unsubscribe();
 }
 })().catch(err => console.warn('Error cargando RxDB para OrdenesV2:', err));

 return () => {
 active = false;
 itemsSub?.unsubscribe();
 cuentasSub?.unsubscribe();
 reservasSub?.unsubscribe();
 };
 }, [dbEpoch]);

 const safeComandas = comandas;
 const safeMesas = mesas;
 const safeComandaItems = comandaItems;
 const safeHabitacionCuentas = habitacionCuentas;

 const openReadOnlyComanda = (comanda: Comanda) => {
 if (!comanda.mesa_id) {
 showToast.warning('No se puede abrir la orden',`La comanda #${comanda.folio} no tiene mesa asociada.`);
 return;
 }
 setCheckoutView(false);
 setConfigView('none');
 setReservaView('none');
 setSelectedReservaId(null);
 setSelectedMesaId(comanda.mesa_id);
 setViewingComandaId(comanda.id);
 };

 // Índice de mesas por id: evita un`.find()`(scan lineal de todas las mesas
 // de la organización) por cada comanda filtrada y por cada fila renderizada.
 const mesaById = useMemo(() => new Map(safeMesas.map(m => [m.id, m])), [safeMesas]);

 const filteredComandas = useMemo(() => {
 const [start, end] = dateRange;

 return safeComandas.filter(comanda => {
 if (comanda.mesa_id?.startsWith('reserva_')) return false;

 if (status ==='historico') {
 // Todas las órdenes no anuladas — incluye las cargadas a habitación
 // (activa o cerrada). Se distinguen con un badge en la fila.
 if (comanda.estado ==='anulada') return false;
 } else if (status ==='anuladas') {
 if (comanda.estado !=='anulada') return false;
 }

 if (start) {
 const fecha = new Date(comanda.created_at);
 const startLimit = new Date(start);
 startLimit.setHours(0, 0, 0, 0);

 const endLimit = new Date(end || start);
 endLimit.setHours(23, 59, 59, 999);

 if (fecha < startLimit || fecha > endLimit) return false;
 }

 if (searchQuery.trim()) {
 const q = searchQuery.toLowerCase();
 const mesa = mesaById.get(comanda.mesa_id);
 const mesaNombre = mesa?.nombre || comanda.mesa_nombre || comanda.mesa_id;

 let roomName ='';
 let roomHuesped ='';
 if (comanda.habitacion_cuenta_id) {
 const cuenta = safeHabitacionCuentas.find(hc => hc.id === comanda.habitacion_cuenta_id);
 const roomMesa = cuenta ? mesaById.get(cuenta.mesa_id) : null;
 roomName = roomMesa?.nombre || comanda.mesa_nombre ||'Habitación';
 roomHuesped = cuenta?.huesped ||'';
 }

 const items = safeComandaItems.filter(i => i.comanda_id === comanda.id);
 const hasMatchingProduct = items.some(item => item.nombre.toLowerCase().includes(q));

 if (
 !String(comanda.folio).includes(q) &&
 !(comanda.cliente?.toLowerCase().includes(q)) &&
 !(mesaNombre.toLowerCase().includes(q)) &&
 !(roomName.toLowerCase().includes(q)) &&
 !(roomHuesped.toLowerCase().includes(q)) &&
 !hasMatchingProduct
 ) return false;
 }

 return true;
 }).sort((a, b) => {
 const pidiendoA = a.estado ==='cuenta'? 1 : 0;
 const pidiendoB = b.estado ==='cuenta'? 1 : 0;
 if (pidiendoA !== pidiendoB) return pidiendoB - pidiendoA;
 return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
 });
 }, [safeComandas, mesaById, safeHabitacionCuentas, status, searchQuery, dateRange]);

  const ITEMS_PER_PAGE = 30;
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [status, searchQuery, dateRange]);

  const totalPages = Math.max(1, Math.ceil(filteredComandas.length / ITEMS_PER_PAGE));

  const paginatedComandas = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredComandas.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredComandas, page]);

  const comandaRowData = useMemo(() => {
    const map = new Map<string, { items: typeof safeComandaItems; total: number }>();
    for (const comanda of paginatedComandas) {
      const items = safeComandaItems.filter(i => i.comanda_id === comanda.id);
      const total = calcularTotalesComanda(items, menuItems, ivaPorcentaje, preciosConIva).total;
      map.set(comanda.id, { items, total });
    }
    return map;
  }, [paginatedComandas, safeComandaItems, menuItems, ivaPorcentaje, preciosConIva]);

  // Ventana de números de página alrededor de la página activa (máx 5 + extremos),
  // con '…' cuando hay hueco, para no listar cientos de botones en históricos largos.
  const pageNumbers = useMemo(() => {
    const delta = 1;
    const range: (number | 'ellipsis')[] = [];
    const left = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);

    range.push(1);
    if (left > 2) range.push('ellipsis');
    for (let i = left; i <= right; i++) range.push(i);
    if (right < totalPages - 1) range.push('ellipsis');
    if (totalPages > 1) range.push(totalPages);

    return range;
  }, [page, totalPages]);

  return (
  <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
  {/* Header */}
  <header className="h-14 px-6 bg-card border-b border-border flex items-center justify-between shadow-xs shrink-0 gap-4">
  <div className="flex items-center gap-3 shrink-0">
  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
  <PopoverTrigger asChild>
  <button
  type="button"title="Filtrar por fecha"
  className="w-9 h-9 rounded-lg bg-primary active:scale-95 text-primary-foreground flex items-center justify-center transition-all shadow-xs cursor-pointer">
  <Calendar size={18} />
  </button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0" align="start">
  <CalendarPicker
  mode="range"
  selected={dateRange[0] ? { from: dateRange[0], to: dateRange[1] ?? undefined } : undefined}
  onSelect={(range) => {
  setDateRange([range?.from ?? null, range?.to ?? null]);
  if (range?.from && range?.to) setCalendarOpen(false);
  }}
  />
  {dateRange[0] && (
  <div className="p-3 border-t border-border flex justify-end">
  <button
  type="button"onClick={() => { setDateRange([null, null]); setCalendarOpen(false); }}
  className="text-xs font-bold text-muted-foreground cursor-pointer">
  Limpiar filtro
  </button>
  </div>
  )}
  </PopoverContent>
  </Popover>

  {dateRange[0] && (
  <span className="px-3 py-1 rounded-md bg-primary/10 text-primary text-xs font-bold border border-primary/30">
  {dayjs(dateRange[0]).format('DD/MM')}
  {dateRange[1] &&`- ${dayjs(dateRange[1]).format('DD/MM')}`}
  </span>
  )}

   <div className="w-[1px] h-6 bg-border shrink-0 hidden md:block"/>

   <div className="relative w-64 shrink-0 hidden md:block">
     <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10"/>
     <Input
       type="text" placeholder="Buscar en órdenes..." value={searchQuery}
       onChange={(e) => setSearchQuery(e.target.value)}
       className="pl-9 h-9 text-xs"/>
   </div>

   <div className="w-[1px] h-6 bg-border shrink-0 hidden md:block"/>

   <div
   ref={scrollContainerRef}
   className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
   {FILTER_TABS.map((tab) => {
  const active = status === tab.value;
  return (
  <button
  key={tab.value}
  ref={(el) => { chipsRefs.current[tab.value] = el; }}
  type="button"onClick={() => setStatus(tab.value)}
  className={cn("px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer",
  active
  ?"bg-primary text-primary-foreground border-primary shadow-xs":"bg-card text-muted-foreground border-border")}
  >
  {tab.label}
  </button>
  );
  })}
  </div>
  </div>
  </header>

 {/* Main Table */}
 <main className="flex-1 overflow-y-auto min-h-0">
  {filteredComandas.length === 0 ? (
  <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
  <div className="w-24 h-24 flex items-center justify-center">
  <img src="/ordenes.webp"alt=""aria-hidden="true"className="w-full h-full object-contain"/>
  </div>
  <h2 className="text-foreground font-bold text-lg">No hay órdenes {status}</h2>
  <p className="text-muted-foreground text-xs">Cambia el filtro o registra una nueva comanda.</p>
  </div>
  ) : (
  <div className="flex flex-col">
  <table className="w-full text-left text-xs">
  <thead className="bg-muted border-b border-border text-muted-foreground font-bold uppercase tracking-wider">
  <tr>
  <th className="px-6 py-3.5">Mesa / Folio</th>
  <th className="px-6 py-3.5 hidden md:table-cell">Items</th>
  <th className="px-6 py-3.5">Total</th>
  <th className="px-6 py-3.5 hidden sm:table-cell">Fecha</th>
  <th className="px-6 py-3.5">Estado</th>
  </tr>
  </thead>
  <tbody className="divide-y divide-border">
  {paginatedComandas.map((comanda) => {
  // Si la comanda está cargada a una habitación, la mesa a mostrar
  // es la de la habitación (destino), no la mesa donde se creó
  // originalmente la comanda.
  const habitacionCuenta = comanda.habitacion_cuenta_id
  ? safeHabitacionCuentas.find(hc => hc.id === comanda.habitacion_cuenta_id)
  : null;
  const habitacionMesa = habitacionCuenta ? mesaById.get(habitacionCuenta.mesa_id) : null;
  const mesa = habitacionCuenta
  ? { nombre: habitacionMesa?.nombre || comanda.mesa_nombre || 'Habitación' }
  : mesaById.get(comanda.mesa_id);
  const clienteLabel = comanda.cliente || habitacionCuenta?.huesped;
  const rowData = comandaRowData.get(comanda.id);
  const total = rowData?.total || 0;
  const itemCount = rowData?.items.reduce((acc, i) => acc + (i.cantidad || 1), 0) || 0;

  return (
  <tr key={comanda.id}
  onClick={() => openReadOnlyComanda(comanda)}
  className="hover:bg-muted/50 cursor-pointer transition-colors"
  >
  <td className="px-6 py-3.5">
  <div className="flex items-center gap-1.5">
  <span className="font-bold text-foreground truncate max-w-[150px]">
  {mesa?.nombre || 'Mesa Eliminada'}
  </span>
  {habitacionCuenta && (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400 text-[10px] font-bold shrink-0">
  <Door size={11} weight="bold" /> Habitación
  </span>
  )}
  </div>
  <div className="text-muted-foreground text-[11px] truncate max-w-[150px]">
  {clienteLabel || `Folio: ${comanda.folio}`}
  </div>
  </td>
  <td className="px-6 py-3.5 hidden md:table-cell">
  <span className="font-semibold">{itemCount}</span> <span className="text-muted-foreground">items</span>
  </td>
  <td className="px-6 py-3.5 font-bold text-foreground">
  ${total.toFixed(2)}
  </td>
  <td className="px-6 py-3.5 hidden sm:table-cell">
  <div className="font-semibold text-foreground">
  {dayjs(comanda.created_at).format('HH:mm')}
  </div>
  <div className="text-muted-foreground text-[11px]">
  {dayjs(comanda.created_at).format('DD MMM')}
  </div>
  </td>
  <td className="px-6 py-3.5">
  {comanda.estado ==='cerrado'|| comanda.estado ==='facturado'? (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-[11px] font-bold">
  <CheckCircle size={13} weight="bold" /> {comanda.estado ==='facturado'?'Facturada':'Cerrada'}
  </span>
  ) : comanda.estado ==='anulada'? (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-bold">
  <XCircle size={13} weight="bold" /> Anulada
  </span>
  ) : comanda.estado ==='cuenta'? (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold">
  <Receipt size={13} weight="bold" /> Cuenta
  </span>
  ) : comanda.estado ==='en_cocina'? (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[11px] font-bold">
  <ForkKnife size={13} weight="bold" /> En cocina
  </span>
  ) : comanda.estado ==='listo'? (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-bold">
  <CheckCircle size={13} weight="bold" /> Listo
  </span>
  ) : (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-[11px] font-bold">
  <Clock size={13} weight="bold" /> Pendiente
  </span>
  )}
  </td>
  </tr>
  );
  })}
  </tbody>
  </table>
  </div>
  )}
  </main>

  {/* Paginación (sticky, fuera del scroll de la tabla) */}
  {filteredComandas.length > 0 && (
  <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card shrink-0">
  <span className="text-xs font-semibold text-muted-foreground">
  Mostrando {Math.min((page - 1) * ITEMS_PER_PAGE + 1, filteredComandas.length)}-
  {Math.min(page * ITEMS_PER_PAGE, filteredComandas.length)} de {filteredComandas.length}
  </span>

  <div className="flex items-center gap-1">
  <button
  type="button"disabled={page === 1}
  onClick={() => setPage(p => Math.max(1, p - 1))}
  className="px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground disabled:opacity-40 transition-colors cursor-pointer">
  Anterior
  </button>

  {pageNumbers.map((n, idx) =>
  n ==='ellipsis'? (
  <span key={`ellipsis-${idx}`} className="px-2 text-xs text-muted-foreground select-none">…</span>
  ) : (
  <button
  key={n}
  type="button"
  onClick={() => setPage(n)}
  aria-current={page === n ?'page': undefined}
  className={cn(
 "min-w-[28px] h-7 px-2 rounded-full text-xs font-bold transition-colors cursor-pointer",
  page === n
 ?"bg-primary text-primary-foreground shadow-xs":"bg-card border border-border text-muted-foreground hover:bg-muted"
  )}>
  {n}
  </button>
  )
  )}

  <button
  type="button"disabled={page === totalPages}
  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
  className="px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground disabled:opacity-40 transition-colors cursor-pointer">
  Siguiente
  </button>
  </div>
  </div>
  )}
 </div>
 );
}
