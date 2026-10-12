import { useState, useMemo, useEffect } from'react';
import { folioLabel } from '../lib/folio';
import { MagnifyingGlass, FunnelSimple, X, Calendar } from'@phosphor-icons/react';
import { type Comanda, type Mesa, type ComandaItem, type HabitacionCuenta, type Reserva } from'../db/database';
import { useUI } from'../context/UIContext';
import { showToast } from'@/lib/toast';
import { Paginacion } from '../components/Common/Paginacion';
import { EstadoBadge } from '../components/Common/EstadoBadge';
import { FiltroLimpiarTodo, FiltroOpcion } from '../components/Common/FiltroChip';
import { OrigenBadge, ORIGEN_LABEL, ORIGEN_ICON } from '../components/Common/OrigenBadge';
import type { VentaOrigen } from '../db/rxdb';
import dayjs from'dayjs';
import { initVerticalRxDb, updateRxComanda } from'../db/rxdb';
import { useDbEpoch } from'../hooks/useDbEpoch';
import { useIvaActivo } from'../hooks/useIvaActivo';
import { PageFrame, PageHeader, PageContent, HeaderSearch, headerButtonClass } from'../components/Common/PageHeader';
import { Input } from'@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from'@/components/ui/popover';
import { Calendar as CalendarPicker } from'@/components/ui/calendar';
import { useRxMenuCatalog } from'../hooks/useRxMenuCatalog';
import { useRxMesas } from'../hooks/useRxMesas';
import { useRxClientes } from'../hooks/useRxClientes';
import { useRxComandas } from'../hooks/useRxComandas';
import { calcularTotalesComanda } from'../lib/taxUtils';
import { cn } from'@/lib/utils';
import { Button } from'@/components/ui/button';

type FiltroEstado = 'anuladas' | 'pendientes' | 'cerradas';
const FILTROS_ESTADO: Array<{ value: FiltroEstado; label: string }> = [
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'cerradas', label: 'Cerradas' },
  { value: 'anuladas', label: 'Anuladas' },
];

// Origenes que puede tener una orden (la reserva de hotel no genera comandas).
const ORIGENES_FILTRO: VentaOrigen[] = ['mesa', 'reserva_restaurante', 'habitacion'];

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes' | 'todo' | 'personalizado';
const PERIODOS: Array<{ value: Exclude<Periodo, 'personalizado'>; label: string; titulo: string }> = [
  { value: 'hoy', label: 'Hoy', titulo: 'Órdenes de hoy' },
  { value: 'ayer', label: 'Ayer', titulo: 'Órdenes de ayer' },
  { value: 'semana', label: 'Esta semana', titulo: 'Órdenes de esta semana' },
  { value: 'mes', label: 'Este mes', titulo: 'Órdenes de este mes' },
  { value: 'todo', label: 'Todo', titulo: 'Todas las órdenes' },
];

// Rango de fechas de cada período (la semana empieza el lunes).
function rangoDePeriodo(periodo: Periodo, personalizado: [Date | null, Date | null]): [Date | null, Date | null] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  switch (periodo) {
    case 'hoy': return [hoy, hoy];
    case 'ayer': { const a = new Date(hoy); a.setDate(a.getDate() - 1); return [a, a]; }
    case 'semana': { const i = new Date(hoy); i.setDate(i.getDate() - ((hoy.getDay() + 6) % 7)); return [i, hoy]; }
    case 'mes': return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), hoy];
    case 'todo': return [null, null];
    default: return personalizado;
  }
}

// ¿La orden cumple alguno de los filtros elegidos? Sin filtros = todas.
function cumpleEstado(estado: string, filtros: Set<FiltroEstado>) {
  if (filtros.size === 0) return true;
  if (estado === 'anulada') return filtros.has('anuladas');
  if (estado === 'cerrado' || estado === 'facturado') return filtros.has('cerradas');
  return filtros.has('pendientes');
}

const normalizar = (t: unknown) =>
  String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ESTADO_TEXTO: Record<string, string> = {
  pendiente: 'pendiente', en_cocina: 'en cocina', listo: 'listo', cuenta: 'cuenta pidiendo cuenta',
  cerrado: 'cerrada cerrado cobrada', facturado: 'facturada facturado', anulada: 'anulada anulado',
};

export default function OrdenesV2() {
 const [estadoFiltros, setEstadoFiltros] = useState<Set<FiltroEstado>>(new Set());
 const [origenFiltros, setOrigenFiltros] = useState<Set<VentaOrigen>>(new Set());
 const [filtrosOpen, setFiltrosOpen] = useState(false);

 const [searchQuery, setSearchQuery] = useState('');
 // La pantalla abre en "Hoy": en el turno lo que importa son las órdenes del día.
 const [periodo, setPeriodo] = useState<Periodo>('hoy');
 const [rangoPersonalizado, setRangoPersonalizado] = useState<[Date | null, Date | null]>([null, null]);
 const [verCalendario, setVerCalendario] = useState(false);
 // toDateString como dependencia: si la app queda abierta pasada la medianoche, "Hoy" se actualiza.
 const diaActual = new Date().toDateString();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const dateRange = useMemo(() => rangoDePeriodo(periodo, rangoPersonalizado), [periodo, rangoPersonalizado, diaActual]);
 const {
 setSelectedMesaId,
 viewingComandaId,
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
 const { clientes } = useRxClientes() as { clientes: any[] };
 const [comandaItems, setComandaItems] = useState<ComandaItem[]>([]);
 const [habitacionCuentas, setHabitacionCuentas] = useState<HabitacionCuenta[]>([]);
 const [reservas, setReservas] = useState<Reserva[]>([]);

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
 showToast.warning('No se puede abrir la orden',`La comanda #${folioLabel(comanda)} no tiene mesa asociada.`);
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
 // Índice reserva por comanda_id: una reserva ya asignada a mesa real
 // guarda esa asignación también en `reserva.mesa_id` (ver
 // handleAssignSubmit en ReservasV2) — se usa como respaldo si por algún
 // motivo `comanda.mesa_id` se quedó en el id sintético `reserva_<id>`,
 // para no perder la orden del histórico solo por ese desajuste.
 const reservaByComandaId = useMemo(
 () => new Map(reservas.filter(r => r.comanda_id).map(r => [r.comanda_id as string, r])),
 [reservas]
 );

 // Auto-reparación: si `handleAssignSubmit` (ReservasV2) actualizó
 // `reserva.mesa_id` pero por alguna condición de carrera la comanda se
 // quedó con el `mesa_id` sintético `reserva_<id>`, se corrige acá en
 // background al detectarla — así el histórico deja de perder la orden en
 // vez de solo tolerar el desajuste en cada lectura.
 useEffect(() => {
 for (const comanda of safeComandas) {
 if (!comanda.mesa_id?.startsWith('reserva_')) continue;
 const reservaVinculada = reservaByComandaId.get(comanda.id);
 if (!reservaVinculada?.mesa_id) continue;
 const mesaReal = mesaById.get(reservaVinculada.mesa_id);
 updateRxComanda(comanda.id, {
 mesa_id: reservaVinculada.mesa_id,
 mesa_nombre: mesaReal?.nombre || comanda.mesa_nombre,
 }).catch(err => console.warn('No se pudo reparar mesa_id de comanda de reserva:', err));
 }
 }, [safeComandas, reservaByComandaId, mesaById]);

  // Texto de búsqueda de cada orden (sin tildes ni mayúsculas): número, cliente
  // (también su teléfono y documento si está registrado), mesa/habitación,
  // huésped, reserva, mesero, estado, total, fecha y productos. Se arma una vez
  // por cambio de datos, no por cada letra escrita.
  const indiceBusqueda = useMemo(() => {
    const clientePorId = new Map<string, any>(clientes.map((c: any) => [c.id, c]));
    const cuentaPorId = new Map(safeHabitacionCuentas.map(hc => [hc.id, hc]));
    const productos = new Map<string, string[]>();
    for (const it of safeComandaItems) {
      if ((it as any).anulado) continue;
      const lista = productos.get(it.comanda_id);
      if (lista) lista.push(it.nombre); else productos.set(it.comanda_id, [it.nombre]);
    }
    const out = new Map<string, string>();
    for (const c of safeComandas) {
      const mesa = mesaById.get(c.mesa_id);
      const cuenta = c.habitacion_cuenta_id ? cuentaPorId.get(c.habitacion_cuenta_id) : undefined;
      const roomMesa = cuenta ? mesaById.get(cuenta.mesa_id) : undefined;
      const reserva = reservaByComandaId.get(c.id);
      const cli = (c as any).cliente_id ? clientePorId.get((c as any).cliente_id) : undefined;
      const fecha = dayjs(c.created_at);
      out.set(c.id, normalizar([
        folioLabel(c), c.folio, c.cliente, cli?.nombre, cli?.telefono, cli?.dni, cli?.numero_doc, cli?.nombre_factura,
        (c as any).subcomanda_nombre, c.mesa_nombre, mesa?.nombre, roomMesa?.nombre, cuenta?.huesped,
        reserva?.nombre, reserva?.telefono, c.mesero, ESTADO_TEXTO[c.estado] ?? c.estado,
        Number(c.total || 0).toFixed(2), fecha.format('DD/MM/YYYY DD/MM HH:mm D MMM MMMM'),
        ...(productos.get(c.id) ?? []),
      ].filter(v => v !== undefined && v !== null && v !== '').join(' ')));
    }
    return out;
  }, [safeComandas, safeComandaItems, clientes, mesaById, safeHabitacionCuentas, reservaByComandaId]);

 const cuentaPorId = useMemo(() => new Map(safeHabitacionCuentas.map(hc => [hc.id, hc])), [safeHabitacionCuentas]);

 const filteredComandas = useMemo(() => {
 const [start, end] = dateRange;
 // Cada palabra debe aparecer en algún dato de la orden ("juan mesa 3"); se ignora el "#".
 const terminos = normalizar(searchQuery).replace(/#/g, ' ').split(/\s+/).filter(Boolean);
 const consultaNumero = terminos.join('');
 const soloNumero = terminos.length === 1 && /^\d+(-\d+)?$/.test(consultaNumero);
 const hayFolio = soloNumero && safeComandas.some(c => normalizar(folioLabel(c)).startsWith(consultaNumero));

 return safeComandas.filter(comanda => {
 if (comanda.mesa_id?.startsWith('reserva_')) {
 // Todavía "sin asignar" salvo que la reserva vinculada ya tenga
 // mesa real — en ese caso se muestra igual (con la mesa de la
 // reserva) en vez de quedar invisible para siempre en Órdenes.
 const reservaVinculada = reservaByComandaId.get(comanda.id);
 if (!reservaVinculada?.mesa_id) return false;
 }

 // Al buscar se ignoran el período y el estado: la búsqueda recorre todo el historial,
 // para que nadie crea que una orden no existe solo porque no es de hoy.
 if (terminos.length === 0 && !cumpleEstado(comanda.estado, estadoFiltros)) return false;

 if (terminos.length === 0 && origenFiltros.size > 0) {
 const origen: VentaOrigen = comanda.habitacion_cuenta_id && comanda.sincronizado !== false && cuentaPorId.has(comanda.habitacion_cuenta_id)
 ? 'habitacion'
 : reservaByComandaId.has(comanda.id) ? 'reserva_restaurante' : 'mesa';
 if (!origenFiltros.has(origen)) return false;
 }

 if (start && terminos.length === 0) {
 const fecha = new Date(comanda.created_at);
 const startLimit = new Date(start);
 startLimit.setHours(0, 0, 0, 0);

 const endLimit = new Date(end || start);
 endLimit.setHours(23, 59, 59, 999);

 if (fecha < startLimit || fecha > endLimit) return false;
 }

 if (terminos.length > 0) {
 if (soloNumero) {
 // Un número escrito busca primero el N.º de orden (397, #397, 397-1);
 // si ninguna orden empieza así, cae a la búsqueda general (monto, teléfono…).
 if (hayFolio) {
 if (!normalizar(folioLabel(comanda)).startsWith(consultaNumero)) return false;
 } else if (!terminos.every(t => (indiceBusqueda.get(comanda.id) ?? '').includes(t))) return false;
 } else if (!terminos.every(t => (indiceBusqueda.get(comanda.id) ?? '').includes(t))) return false;
 }

 return true;
 }).sort((a, b) => {
 const pidiendoA = a.estado ==='cuenta'? 1 : 0;
 const pidiendoB = b.estado ==='cuenta'? 1 : 0;
 if (soloNumero) {
 const exactoA = normalizar(folioLabel(a)) === consultaNumero ? 1 : 0;
 const exactoB = normalizar(folioLabel(b)) === consultaNumero ? 1 : 0;
 if (exactoA !== exactoB) return exactoB - exactoA;
 }
 if (pidiendoA !== pidiendoB) return pidiendoB - pidiendoA;
 return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
 });
 }, [safeComandas, mesaById, safeHabitacionCuentas, cuentaPorId, estadoFiltros, origenFiltros, searchQuery, dateRange, indiceBusqueda, reservaByComandaId]);

  const ITEMS_PER_PAGE = 30;
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [estadoFiltros, origenFiltros, searchQuery, dateRange]);

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

  // Título según el período, y filtros distintos del estado por defecto (Hoy, todos los estados).
  const fmtCorta = (d: Date) => dayjs(d).format('DD/MM');
  const buscando = searchQuery.trim().length > 0;
  const tituloPagina = buscando ? 'Resultados de la búsqueda' : periodo === 'personalizado'
    ? (rangoPersonalizado[0]
        ? `Órdenes · ${fmtCorta(rangoPersonalizado[0])}${rangoPersonalizado[1] && rangoPersonalizado[1].getTime() !== rangoPersonalizado[0].getTime() ? ` – ${fmtCorta(rangoPersonalizado[1])}` : ''}`
        : 'Órdenes')
    : PERIODOS.find(p => p.value === periodo)!.titulo;
  const numFiltros = (periodo !== 'hoy' ? 1 : 0) + estadoFiltros.size + origenFiltros.size;
  const restablecerFiltros = () => { setPeriodo('hoy'); setRangoPersonalizado([null, null]); setEstadoFiltros(new Set()); setOrigenFiltros(new Set()); setVerCalendario(false); };
  const etiquetaPeriodo = periodo === 'personalizado' ? tituloPagina.replace('Órdenes · ', '') : PERIODOS.find(p => p.value === periodo)!.label;

  return (
  <PageFrame>
  <PageHeader
    title={tituloPagina}
    subtitle={`${filteredComandas.length} ${filteredComandas.length === 1 ? 'Registrada' : 'Registradas'}${buscando ? ' · en todo el historial' : (estadoFiltros.size + origenFiltros.size) > 0 ? ` · ${[...FILTROS_ESTADO.filter(f => estadoFiltros.has(f.value)).map(f => f.label), ...ORIGENES_FILTRO.filter(o => origenFiltros.has(o)).map(o => ORIGEN_LABEL[o])].join(', ')}` : ''}`}
    search={<HeaderSearch value={searchQuery} onChange={setSearchQuery} placeholder="Buscar por n.º, cliente, mesa, producto..." />}
    actions={
      <Popover open={filtrosOpen} onOpenChange={setFiltrosOpen}>
        <PopoverTrigger asChild>
          <button type="button" title="Filtros" aria-label="Filtros" className={cn(headerButtonClass, 'px-3')}>
            <FunnelSimple size={18} /> Filtros
            {numFiltros > 0 && (
              <span className="min-w-5 h-5 px-1 rounded-full bg-nav-foreground text-nav t-dato flex items-center justify-center">{numFiltros}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 flex flex-col gap-4" align="end">
          <section className="flex flex-col gap-2">
            <h4 className="t-etiqueta text-muted-foreground">Período</h4>
            <div className="flex flex-wrap gap-1.5">
              {PERIODOS.map(({ value, label }) => (
                <button key={value} type="button" aria-pressed={periodo === value}
                  onClick={() => { setPeriodo(value); setVerCalendario(false); }}
                  className={cn('h-9 pointer-coarse:h-11 px-3 rounded-2xl border t-dato cursor-pointer transition-colors',
                    periodo === value ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-muted')}>
                  {label}
                </button>
              ))}
              <button type="button" aria-pressed={periodo === 'personalizado'}
                onClick={() => setVerCalendario(v => !v)}
                className={cn('h-9 pointer-coarse:h-11 px-3 rounded-2xl border t-dato cursor-pointer transition-colors flex items-center gap-1.5',
                  periodo === 'personalizado' ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-muted')}>
                <Calendar size={14} /> Personalizado
              </button>
            </div>
            {(verCalendario || periodo === 'personalizado') && (
              <div className="rounded-2xl border border-border -mx-1">
                <CalendarPicker
                  mode="range"
                  selected={rangoPersonalizado[0] ? { from: rangoPersonalizado[0], to: rangoPersonalizado[1] ?? undefined } : undefined}
                  onSelect={(range) => {
                    setRangoPersonalizado([range?.from ?? null, range?.to ?? null]);
                    if (range?.from) setPeriodo('personalizado');
                  }}
                />
              </div>
            )}
          </section>

          <section className="flex flex-col gap-1">
            <h4 className="t-etiqueta text-muted-foreground">Estado</h4>
            {FILTROS_ESTADO.map(({ value, label }) => {
              const on = estadoFiltros.has(value);
              return (
                <FiltroOpcion key={value} activo={on}
                  onClick={() => setEstadoFiltros(prev => { const n = new Set(prev); if (on) n.delete(value); else n.add(value); return n; })}>
                  {label}
                </FiltroOpcion>
              );
            })}
          </section>

          <section className="flex flex-col gap-1">
            <h4 className="t-etiqueta text-muted-foreground">Origen</h4>
            {ORIGENES_FILTRO.map(origen => {
              const on = origenFiltros.has(origen);
              const Icono = ORIGEN_ICON[origen];
              return (
                <FiltroOpcion key={origen} activo={on}
                  onClick={() => setOrigenFiltros(prev => { const n = new Set(prev); if (on) n.delete(origen); else n.add(origen); return n; })}>
                  <Icono size={16} weight="bold" className="text-muted-foreground shrink-0" />
                  {ORIGEN_LABEL[origen]}
                </FiltroOpcion>
              );
            })}
          </section>

          {numFiltros > 0 && (
            <button type="button" onClick={restablecerFiltros}
              className="h-9 pointer-coarse:h-11 rounded-2xl border border-border t-dato text-muted-foreground hover:bg-muted cursor-pointer">
              Limpiar todo
            </button>
          )}
        </PopoverContent>
      </Popover>
    }
  />

  <PageContent>
  {/* En móvil el buscador no cabe en el header: va en una fila propia */}
  <div className="md:hidden px-4 py-2 shrink-0">
    <div className="relative">
      <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input type="text" placeholder="Buscar por n.º, cliente, mesa, producto..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-11 text-base" />
    </div>
  </div>

  {/* Filtros aplicados (distintos de Hoy + todos los estados): se quitan de uno en uno o todos a la vez */}
  {numFiltros > 0 && !buscando && (
    <div className="px-4 sm:px-6 py-2 shrink-0 flex flex-wrap items-center gap-2 border-b border-border">
      <span className="t-etiqueta text-muted-foreground">Filtros</span>
      {periodo !== 'hoy' && (
        <button type="button" onClick={() => { setPeriodo('hoy'); setRangoPersonalizado([null, null]); }}
          className="h-8 pointer-coarse:h-11 pl-3 pr-2 rounded-full bg-muted t-dato text-foreground flex items-center gap-1.5 cursor-pointer hover:bg-secondary">
          {etiquetaPeriodo} <X size={12} weight="bold" />
        </button>
      )}
      {FILTROS_ESTADO.filter(f => estadoFiltros.has(f.value)).map(f => (
        <button key={f.value} type="button"
          onClick={() => setEstadoFiltros(prev => { const n = new Set(prev); n.delete(f.value); return n; })}
          className="h-8 pointer-coarse:h-11 pl-3 pr-2 rounded-full bg-muted t-dato text-foreground flex items-center gap-1.5 cursor-pointer hover:bg-secondary">
          {f.label} <X size={12} weight="bold" />
        </button>
      ))}
      {ORIGENES_FILTRO.filter(o => origenFiltros.has(o)).map(o => (
        <button key={o} type="button"
          onClick={() => setOrigenFiltros(prev => { const n = new Set(prev); n.delete(o); return n; })}
          className="h-8 pointer-coarse:h-11 pl-3 pr-2 rounded-full bg-muted t-dato text-foreground flex items-center gap-1.5 cursor-pointer hover:bg-secondary">
          {ORIGEN_LABEL[o]} <X size={12} weight="bold" />
        </button>
      ))}
      <FiltroLimpiarTodo onClick={restablecerFiltros} />
    </div>
  )}

 {/* Main Table */}
 <main className="flex-1 overflow-y-auto min-h-0 bg-card">
  {filteredComandas.length === 0 ? (
  <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
  <div className="w-24 h-24 flex items-center justify-center">
  <img src="/ordenes.webp"alt=""aria-hidden="true"className="w-full h-full object-contain"/>
  </div>
  <h2 className="t-titulo text-foreground">{buscando ? 'Sin resultados' : numFiltros === 0 ? 'Aún no hay órdenes hoy' : 'No hay órdenes con estos filtros'}</h2>
  <p className="t-meta text-muted-foreground">{buscando ? 'Prueba con otro n.º, cliente, mesa o producto.' : numFiltros === 0 ? 'Cuando abras una mesa aparecerá aquí.' : 'Cambia los filtros o amplía el período.'}</p>
  {!buscando && periodo !== 'todo' && (
  <Button type="button" variant="outline" onClick={() => { setPeriodo('todo'); setEstadoFiltros(new Set()); setOrigenFiltros(new Set()); }} className="mt-1 font-bold">Ver todo el historial</Button>
  )}
  </div>
  ) : (
  <div className="flex flex-col">
  <table className="w-full text-left">
  <thead className="t-etiqueta sticky top-0 z-10 bg-muted shadow-[0_1px_0_var(--border)] text-muted-foreground">
  <tr>
  <th className="w-px whitespace-nowrap pl-4 sm:pl-6 pr-4 sm:pr-6 py-3.5">N.º</th>
  <th className="w-px whitespace-nowrap px-3 sm:px-6 py-3.5 hidden sm:table-cell">Origen</th>
  <th className="px-3 sm:px-6 py-3.5">Mesa</th>
  <th className="w-px whitespace-nowrap px-3 sm:px-6 py-3.5 hidden sm:table-cell">Hora</th>
  <th className="w-px whitespace-nowrap px-3 sm:px-6 py-3.5 hidden md:table-cell text-right">Items</th>
  <th className="w-px whitespace-nowrap px-3 sm:px-6 py-3.5 text-right">Total</th>
  <th className="w-px whitespace-nowrap px-3 sm:px-6 py-3.5">Estado</th>
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
  // Con sincronizado=false la comanda sigue abierta en su mesa: aún no se decide si se
  // carga a la habitación o la paga el cliente, así que no es "Consumo habitación".
  const cargadaAHabitacion = !!habitacionCuenta && comanda.sincronizado !== false;
  const habitacionMesa = habitacionCuenta ? mesaById.get(habitacionCuenta.mesa_id) : null;
  const mesa = cargadaAHabitacion
  ? { nombre: habitacionMesa?.nombre || comanda.mesa_nombre || 'Habitación' }
  : mesaById.get(comanda.mesa_id);
  const clienteLabel = comanda.cliente || habitacionCuenta?.huesped;
  const esDeReserva = reservaByComandaId.has(comanda.id);
  const rowData = comandaRowData.get(comanda.id);
  const total = rowData?.total || 0;
  const itemCount = rowData?.items.reduce((acc, i) => acc + (i.cantidad || 1), 0) || 0;

  return (
  <tr key={comanda.id}
  onClick={() => openReadOnlyComanda(comanda)}
  className={cn("hover:bg-muted/60 cursor-pointer transition-colors",
  // Anulada: toda la fila en grises (sin colores de origen ni de estado) para
  // que no compita con las órdenes que sí se operaron.
  comanda.estado === 'anulada' && "bg-muted/40 [&>td]:opacity-60 [&>td]:grayscale [&>td:last-child]:opacity-100 [&>td:last-child]:grayscale-0")}
  >
  <td className="w-px whitespace-nowrap pl-4 sm:pl-6 pr-4 sm:pr-6 py-3">
  <span className="t-fila text-foreground tabular-nums">#{folioLabel(comanda)}</span>
  </td>
  <td className="w-px whitespace-nowrap px-3 sm:px-6 py-3 hidden sm:table-cell">
  <OrigenBadge origen={cargadaAHabitacion ? 'habitacion' : esDeReserva ? 'reserva_restaurante' : 'mesa'} activo={viewingComandaId === comanda.id} apagado={comanda.estado === 'anulada'} />
  </td>
  <td className="px-3 sm:px-6 py-3">
  <div className="flex items-center gap-1.5">
  <span className="t-cuerpo-fuerte text-foreground truncate max-w-[260px]">
  {mesa?.nombre || 'Mesa Eliminada'}
  </span>
  </div>
  <div className="t-meta text-muted-foreground truncate max-w-[260px]">
  {clienteLabel || 'Sin cliente'}
  </div>
  </td>
  <td className="w-px whitespace-nowrap px-3 sm:px-6 py-3 hidden sm:table-cell">
  <div className="t-cuerpo text-foreground tabular-nums">{dayjs(comanda.created_at).format('HH:mm')}</div>
  <div className="t-meta text-muted-foreground">{dayjs(comanda.created_at).format('DD MMM')}</div>
  </td>
  <td className="w-px whitespace-nowrap px-3 sm:px-6 py-3 hidden md:table-cell text-right tabular-nums t-cuerpo">
  <span className="font-semibold">{itemCount}</span> <span className="text-muted-foreground">items</span>
  </td>
  <td className={cn("w-px whitespace-nowrap px-3 sm:px-6 py-3 text-right t-cuerpo-fuerte tabular-nums text-foreground", comanda.estado === 'anulada' && "line-through text-muted-foreground")}>
  ${total.toFixed(2)}
  </td>
  <td className="w-px whitespace-nowrap px-3 sm:px-6 py-3">
  {comanda.estado ==='cerrado'|| comanda.estado ==='facturado'? (
  <EstadoBadge tono={comanda.estado ==='facturado' ? 'special' : 'success'}>{comanda.estado ==='facturado'?'Facturada':'Cerrada'}</EstadoBadge>
  ) : comanda.estado ==='anulada'? (
  <EstadoBadge tono="destructive">Anulada</EstadoBadge>
  ) : comanda.estado ==='cuenta'? (
  <EstadoBadge tono="warning">Cuenta</EstadoBadge>
  ) : comanda.estado ==='en_cocina'? (
  <EstadoBadge tono="info">En cocina</EstadoBadge>
  ) : comanda.estado ==='listo'? (
  <EstadoBadge tono="info">Listo</EstadoBadge>
  ) : (
  <EstadoBadge tono="warning">Pendiente</EstadoBadge>
  )}
  </td>
  </tr>
  );
  })}
  </tbody>
  </table>
  </div>
  )}
<div className="md:hidden pb-[calc(env(safe-area-inset-bottom)+96px)]">
 <Paginacion page={page} totalPages={totalPages} total={filteredComandas.length} pageSize={ITEMS_PER_PAGE} onPageChange={setPage} />
 </div>
   </main>

  <Paginacion className="hidden md:block" page={page} totalPages={totalPages} total={filteredComandas.length} pageSize={ITEMS_PER_PAGE} onPageChange={setPage} />

  </PageContent>
 </PageFrame>
 );
}
