import { useCallback, useContext, useMemo, useState, type KeyboardEvent } from 'react';
import dayjs from 'dayjs';
import { ArrowDown, ArrowUp, MagnifyingGlass, SlidersHorizontal, WarningCircle, X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { pagoDeVenta } from './estiloReserva';
import { TarjetaInfoDialog } from './TarjetaInfoDialog';
import { ActividadKpis } from './reservas/ActividadKpis';
import { PanelDia } from './reservas/PanelDia';
import { PESO_ESTADIA, VISTAS, construirFilas, enVista, estadiaDe, ocupacionDelDia, type Estadia, type Estado, type Fila, type Pago, type Vista } from './reservas/modelo';
import { EstadoBadge } from '../Common/EstadoBadge';
import { FiltroChip, FiltroLimpiarTodo, type OpcionFiltro } from '../Common/FiltroChip';
import { Paginacion } from '../Common/Paginacion';
import { VentasHotelContext } from '../../hooks/useVentasHotel';
import { useMesesHotel } from '../../hooks/useMesesHotel';
import { bloques, mesDe, tarjetasDeMeses } from '../../lib/hotelCalendarioCache';
import type { TarjetaCalendario } from '../../lib/cloudbeds';
import { totalConExtras, type ReservaHotel } from '../../lib/hotelReservasApi';
import type { HabitacionHotel } from '../../lib/hotelHabitacionesApi';
import type { Divergencia } from '../../lib/hotelReconciliar';

interface Props {
  reservas: ReservaHotel[];
  habitaciones: HabitacionHotel[];
  onAbrir: (r: ReservaHotel) => void;
  /** Reservas que ya no coinciden con Cloudbeds, por id. */
  divergencias: Map<string, Divergencia>;
  /** Búsqueda de la lista. */
  busqueda: string;
  onBusqueda: (q: string) => void;
  /** Filtros con los que abre (p. ej. desde «Estado» › Ver). Para aplicarlo otra vez, la página cambia la `key`. */
  inicial?: FiltroInicialReservas | null;
  /** Cambia cuando algo se creó o canceló desde el POS: lo cargado de Cloudbeds deja de ser fiable. */
  version: number;
  puedeGestionar: boolean;
  /** Reservas de Cloudbeds que aún no están enlazadas al POS se abren en una ficha desde donde enlazarlas. */
  onAdoptar: (t: TarjetaCalendario) => Promise<void>;
  onEliminarBloqueo: (t: TarjetaCalendario) => Promise<void>;
}

export interface FiltroInicialReservas { estados?: Array<'confirmada' | 'pendiente' | 'rechazada' | 'cancelada'>; porRevisar?: boolean }

const POR_PAGINA = 25;

type Orden = { campo: 'relevancia' | 'estadia' | 'total'; asc: boolean };

const OPCIONES_ESTADIA: OpcionFiltro<Estadia>[] = [
  { value: 'en_casa', label: 'En casa' },
  { value: 'llegan_hoy', label: 'Llegan hoy' },
  { value: 'salen_hoy', label: 'Salen hoy' },
  { value: 'proximas', label: 'Próximas' },
  { value: 'pasadas', label: 'Pasadas' },
];
const OPCIONES_ESTADO: OpcionFiltro<Estado>[] = [
  { value: 'confirmada', label: 'En Cloudbeds' },
  { value: 'pendiente', label: 'Por sincronizar' },
  { value: 'rechazada', label: 'Rechazadas' },
  { value: 'cancelada', label: 'Canceladas' },
];
const OPCIONES_PAGO: OpcionFiltro<Pago>[] = [
  { value: 'pagado', label: 'Pagadas' },
  { value: 'parcial', label: 'Pago parcial' },
  { value: 'sin_pago', label: 'Sin pago' },
  { value: 'sin_venta', label: 'Sin venta enlazada' },
];
// En «Todas» se ve al abrir lo vigente. Las canceladas y rechazadas quedan a un filtro de distancia.
const ESTADO_INICIAL: Estado[] = ['confirmada', 'pendiente'];

const TEXTO_ESTADIA: Record<Estadia, string> = { en_casa: 'En casa', llegan_hoy: 'Llega hoy', salen_hoy: 'Sale hoy', proximas: '', pasadas: '' };
const TITULO_VACIO: Record<Vista, string> = {
  llegadas: 'No hay llegadas este día', salidas: 'No hay salidas este día', in_house: 'No hay huéspedes en casa este día', pernoctaciones: 'Nadie pernocta este día',
  nuevas: 'No se crearon reservas este día', canceladas: 'No hay cancelaciones este día', todas: 'Aún no hay reservas',
};

const conjunto = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const dinero = (n: number) => `$${n.toFixed(2)}`;

/**
 * Reservas del Hotel en una sola vista: el día (con su ocupación), las tarjetas de actividad que filtran la tabla (llegadas,
 * salidas, en casa, pernoctan, nuevas, canceladas o todas), buscador, «Filtros» y la tabla. Tocar una fila abre su detalle.
 * La actividad de un día une lo de Cloudbeds con lo del POS; «Todas» son las reservas del POS de cualquier fecha.
 */
export function ReservasHotelLista({ reservas, habitaciones, onAbrir, divergencias, busqueda, onBusqueda, inicial, version, puedeGestionar, onAdoptar, onEliminarBloqueo }: Props) {
  const ventas = useContext(VentasHotelContext);
  const hoy = dayjs().format('YYYY-MM-DD');

  const [fecha, setFecha] = useState(hoy);
  // Sin elegir nada se muestran las llegadas del día; si no hay, todas las reservas.
  const [vistaElegida, setVistaElegida] = useState<Vista | null>(inicial ? 'todas' : null);
  const [info, setInfo] = useState<TarjetaCalendario | null>(null);
  const [estadias, setEstadias] = useState<Set<Estadia>>(new Set());
  const [estados, setEstados] = useState<Set<Estado>>(() => new Set(inicial?.estados ?? ESTADO_INICIAL));
  const [pagos, setPagos] = useState<Set<Pago>>(new Set());
  const [canales, setCanales] = useState<Set<string>>(new Set());
  const [cabanas, setCabanas] = useState<Set<string>>(new Set());
  const [porRevisar, setPorRevisar] = useState(!!inicial?.porRevisar);
  const [orden, setOrden] = useState<Orden>({ campo: 'relevancia', asc: true });
  const [pagina, setPagina] = useState(1);

  // Meses de Cloudbeds alrededor del día que se mira (la caché del calendario los comparte con el resto del módulo).
  const meses = useMemo(() => [...new Set([dayjs(fecha).subtract(7, 'day'), dayjs(fecha), dayjs(fecha).add(14, 'day')].map((d) => mesDe(d.format('YYYY-MM-DD'))))], [fecha]);
  const { error: errorCarga } = useMesesHotel(meses, version);
  const firma = meses.map((m) => bloques.get(m)?.actualizado ?? 0).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `firma` cambia cuando llegan tarjetas nuevas a la caché del módulo
  const tarjetas = useMemo(() => tarjetasDeMeses(meses), [meses, firma]);

  const nombreCabana = useCallback((roomTypeID: string) => habitaciones.find((h) => h.cloudbeds_room_type_id === roomTypeID)?.nombre ?? '—', [habitaciones]);
  const filas = useMemo(() => construirFilas(tarjetas, reservas, nombreCabana), [tarjetas, reservas, nombreCabana]);

  // «Todas» cuenta lo vigente (lo que la tabla muestra por defecto); las canceladas y rechazadas se ven con el filtro de estado.
  const conteos = useMemo(() => Object.fromEntries(VISTAS.map((v) => [v, filas.filter((f) => enVista(f, v, fecha) && (v !== 'todas' || ESTADO_INICIAL.includes(f.estado))).length])) as Record<Vista, number>, [filas, fecha]);
  const vista: Vista = vistaElegida ?? (conteos.llegadas > 0 ? 'llegadas' : 'todas');
  const ocupacion = useMemo(() => ocupacionDelDia(filas, tarjetas, habitaciones, fecha), [filas, tarjetas, habitaciones, fecha]);
  const filtraEstado = vista === 'todas'; // en las vistas del día, el estado ya lo define la vista

  const pagoDe = (f: Fila): Pago => {
    const p = pagoDeVenta(f.r?.venta_id ? ventas.get(f.r.venta_id) : undefined);
    return p ? (p.clave as Pago) : 'sin_venta';
  };
  const revisar = (f: Fila) => !!f.r && (!!f.r.aviso_cloudbeds || divergencias.has(f.r.id));

  const opcionesCanal = useMemo<OpcionFiltro<string>[]>(
    () => [...new Set(filas.map((f) => f.canal))].sort((a, b) => (a === 'POS' ? -1 : b === 'POS' ? 1 : a.localeCompare(b))).map((c) => ({ value: c, label: c })),
    [filas],
  );
  const opcionesCabana = useMemo<OpcionFiltro<string>[]>(() => {
    const nombres = new Map<string, string>();
    for (const h of habitaciones) if (h.cloudbeds_room_type_id) nombres.set(h.cloudbeds_room_type_id, h.nombre);
    for (const f of filas) if (!nombres.has(f.roomTypeID)) nombres.set(f.roomTypeID, f.cabana);
    return [...nombres].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));
  }, [habitaciones, filas]);

  const nRevisar = filas.filter(revisar).length;

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = filas.filter((f) => {
      if (!enVista(f, vista, fecha)) return false;
      if (porRevisar && !revisar(f)) return false;
      if (filtraEstado && estados.size && !estados.has(f.estado)) return false;
      if (filtraEstado && estadias.size && !estadias.has(estadiaDe(f, hoy))) return false;
      if (pagos.size && !pagos.has(pagoDe(f))) return false;
      if (canales.size && !canales.has(f.canal)) return false;
      if (cabanas.size && !cabanas.has(f.roomTypeID)) return false;
      if (q && !`${f.nombre} ${f.cabana} ${f.codigo ?? ''} ${f.r?.huesped_email ?? ''} ${f.r?.huesped_telefono ?? ''} ${f.r?.grupo_etiqueta ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = orden.asc ? 1 : -1;
    const porCabana = (a: Fila, b: Fila) => a.cabana.localeCompare(b.cabana, 'es', { numeric: true }) || a.nombre.localeCompare(b.nombre, 'es');
    return lista.sort((a, b) => {
      if (orden.campo === 'total') return ((a.r ? totalConExtras(a.r) : -1) - (b.r ? totalConExtras(b.r) : -1)) * dir;
      if (orden.campo === 'estadia') return (a.llegada.localeCompare(b.llegada) || porCabana(a, b)) * dir;
      // Un día concreto: por cabaña. «Todas»: por relevancia para recepción (hoy primero, luego lo próximo, y lo pasado al final).
      if (vista !== 'todas') return porCabana(a, b);
      const ea = estadiaDe(a, hoy);
      const eb = estadiaDe(b, hoy);
      if (ea !== eb) return PESO_ESTADIA[ea] - PESO_ESTADIA[eb];
      return ea === 'pasadas' ? b.llegada.localeCompare(a.llegada) : a.llegada.localeCompare(b.llegada);
    });
    // `pagoDe` y `revisar` dependen de `ventas` y `divergencias`, que ya están en la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, vista, fecha, busqueda, porRevisar, filtraEstado, estados, estadias, pagos, canales, cabanas, orden, hoy, ventas, divergencias]);

  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, paginas);
  const visibles = filtradas.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);

  // Cualquier cambio de filtro, de vista o de día vuelve a la primera página.
  const cambiar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPagina(1); };
  const elegirVista = (v: Vista) => { setVistaElegida(v); setPagina(1); };
  const elegirFecha = (f: string) => { setFecha(f); setPagina(1); };

  const estadoPorDefecto = estados.size === ESTADO_INICIAL.length && ESTADO_INICIAL.every((e) => estados.has(e));
  const hayFiltros = pagos.size > 0 || canales.size > 0 || cabanas.size > 0 || porRevisar || (filtraEstado && (estadias.size > 0 || !estadoPorDefecto));
  const limpiar = () => {
    setEstadias(new Set()); setEstados(new Set(ESTADO_INICIAL)); setPagos(new Set()); setCanales(new Set()); setCabanas(new Set());
    setPorRevisar(false); onBusqueda(''); setPagina(1);
  };
  const ordenarPor = (campo: Orden['campo']) => {
    setOrden((o) => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: campo !== 'total' }));
    setPagina(1);
  };
  // Una reserva del POS abre su detalle; una de Cloudbeds sin enlazar abre su ficha (desde ahí se enlaza).
  const abrir = (f: Fila) => { if (f.r) onAbrir(f.r); else if (f.t) setInfo(f.t); };
  const abrirConTeclado = (e: KeyboardEvent, f: Fila) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(f); } };

  // Filtros aplicados, como chips que se quitan de uno en uno. El estado por defecto no cuenta como filtro.
  const aplicados: Array<{ clave: string; etiqueta: string; quitar: () => void }> = [
    ...(filtraEstado ? [...estadias].map((v) => ({ clave: `e-${v}`, etiqueta: OPCIONES_ESTADIA.find((o) => o.value === v)?.label ?? v, quitar: () => cambiar(setEstadias)(conjunto(estadias, v)) })) : []),
    ...(filtraEstado && !estadoPorDefecto ? [...estados].map((v) => ({ clave: `s-${v}`, etiqueta: OPCIONES_ESTADO.find((o) => o.value === v)?.label ?? v, quitar: () => cambiar(setEstados)(conjunto(estados, v)) })) : []),
    ...[...pagos].map((v) => ({ clave: `p-${v}`, etiqueta: OPCIONES_PAGO.find((o) => o.value === v)?.label ?? v, quitar: () => cambiar(setPagos)(conjunto(pagos, v)) })),
    ...[...canales].map((v) => ({ clave: `c-${v}`, etiqueta: v, quitar: () => cambiar(setCanales)(conjunto(canales, v)) })),
    ...[...cabanas].map((v) => ({ clave: `b-${v}`, etiqueta: opcionesCabana.find((o) => o.value === v)?.label ?? v, quitar: () => cambiar(setCabanas)(conjunto(cabanas, v)) })),
    ...(porRevisar ? [{ clave: 'revisar', etiqueta: 'Por revisar', quitar: () => cambiar(setPorRevisar)(false) }] : []),
  ];

  // Una sola insignia de estado por fila, la más importante: lo normal (confirmada) se muestra como texto, sin píldora.
  const celdaEstado = (f: Fila) => {
    const div = f.r ? divergencias.get(f.r.id) : undefined;
    if (f.estado === 'cancelada') return <EstadoBadge tono="neutral">Cancelada</EstadoBadge>;
    if (f.estado === 'rechazada') return <EstadoBadge tono="destructive" title={f.r?.sync_error ?? undefined}>Rechazada</EstadoBadge>;
    if (f.estado === 'pendiente') return <EstadoBadge tono="warning" title="Aún no está en Cloudbeds; se reintenta sola">Sin subir</EstadoBadge>;
    if (!f.r) return <EstadoBadge tono="info" title="Existe en Cloudbeds pero no está enlazada al POS: ábrela para enlazarla">Sin enlazar</EstadoBadge>;
    if (f.r.aviso_cloudbeds) return <EstadoBadge tono="warning" title={`${f.r.aviso_cloudbeds.texto}. Ya aplicado: falta revisar la venta.`}>Revisar venta</EstadoBadge>;
    if (div) return <EstadoBadge tono="warning" title={div.resumen}>Cambió en Cloudbeds</EstadoBadge>;
    const cb = f.t?.estado;
    if (cb === 'checked_out') return <EstadoBadge tono="neutral">Salió</EstadoBadge>;
    if (cb === 'not_confirmed') return <EstadoBadge tono="warning">Sin confirmar</EstadoBadge>;
    if (cb === 'checked_in') return <span className="t-cuerpo text-success-foreground">Check-in hecho</span>;
    return <span className="t-cuerpo text-muted-foreground">Confirmada</span>;
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* El día que se mira y su ocupación: a la izquierda en PC, arriba en pantallas angostas. */}
      <aside className="shrink-0 p-4 sm:px-6 lg:w-72 lg:pr-0 lg:overflow-y-auto">
        <PanelDia fecha={fecha} hoy={hoy} onFecha={elegirFecha} ocupacion={ocupacion} />
      </aside>

      <div className="flex flex-col min-w-0 lg:flex-1 lg:min-h-0">
        <div className="px-4 sm:px-6 pt-0 lg:pt-4 pb-3 shrink-0 flex flex-col gap-3">
          <ActividadKpis vista={vista} onVista={elegirVista} conteos={conteos} />
          {errorCarga && <p className="t-meta text-destructive rounded-2xl bg-destructive-soft px-3 py-2">{errorCarga}</p>}

          {/* Buscador a todo el ancho y el botón «Filtros» con todos los grupos. */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                type="search" aria-label="Buscar reservas" placeholder="Buscar por huésped, cabaña, correo, teléfono o código"
                value={busqueda} onChange={(e) => { onBusqueda(e.target.value); setPagina(1); }}
                className="pl-10 h-10 pointer-coarse:h-11 text-base"
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="h-10 pointer-coarse:h-11 px-4 shrink-0 rounded-2xl border border-border bg-card t-cuerpo-fuerte text-foreground inline-flex items-center gap-2 hover:bg-muted cursor-pointer transition-colors">
                  <SlidersHorizontal size={18} weight="bold" aria-hidden /> Filtros
                  {aplicados.length > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground t-dato flex items-center justify-center" aria-label={`${aplicados.length} aplicados`}>{aplicados.length}</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(34rem,calc(100vw-2rem))] max-h-[min(85vh,44rem)] overflow-y-auto p-4 flex flex-col gap-4">
                {filtraEstado && <GrupoFiltro titulo="Estadía" opciones={OPCIONES_ESTADIA} seleccion={estadias} onToggle={(v) => cambiar(setEstadias)(conjunto(estadias, v))} />}
                {filtraEstado && <GrupoFiltro titulo="Estado" opciones={OPCIONES_ESTADO} seleccion={estados} onToggle={(v) => cambiar(setEstados)(conjunto(estados, v))} />}
                <GrupoFiltro titulo="Pago" opciones={OPCIONES_PAGO} seleccion={pagos} onToggle={(v) => cambiar(setPagos)(conjunto(pagos, v))} />
                {opcionesCanal.length > 1 && <GrupoFiltro titulo="Canal" opciones={opcionesCanal} seleccion={canales} onToggle={(v) => cambiar(setCanales)(conjunto(canales, v))} />}
                <GrupoFiltro titulo="Cabaña" opciones={opcionesCabana} seleccion={cabanas} onToggle={(v) => cambiar(setCabanas)(conjunto(cabanas, v))} />
                {nRevisar > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="t-etiqueta text-muted-foreground">Atención</span>
                    <div className="flex flex-wrap gap-2">
                      <FiltroChip activo={porRevisar} onClick={() => cambiar(setPorRevisar)(!porRevisar)} title="Cambiaron en Cloudbeds o falta revisar su venta">
                        <WarningCircle size={14} weight="bold" /> Por revisar ({nRevisar})
                      </FiltroChip>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="t-meta text-muted-foreground tabular-nums">{plural(filtradas.length, 'reserva', 'reservas')}</span>
                  {hayFiltros && <FiltroLimpiarTodo onClick={limpiar} />}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {aplicados.length > 0 && (
            <div role="group" aria-label="Filtros aplicados" className="flex flex-wrap items-center gap-2">
              {aplicados.map((f) => (
                <span key={f.clave} className="min-h-8 pointer-coarse:min-h-11 pl-3.5 pr-1 rounded-full bg-primary-soft text-primary t-dato inline-flex items-center gap-1">
                  {f.etiqueta}
                  <button type="button" onClick={f.quitar} aria-label={`Quitar el filtro ${f.etiqueta}`} className="size-6 pointer-coarse:size-9 rounded-full flex items-center justify-center hover:bg-primary/15 cursor-pointer"><X size={12} weight="bold" /></button>
                </span>
              ))}
              <FiltroLimpiarTodo onClick={limpiar} />
            </div>
          )}
        </div>

        {/* La lista es una tarjeta propia bajo el buscador: encabezado fijo, filas y paginación dentro, con el mismo margen que las tarjetas de arriba. */}
        <section aria-label="Lista de reservas" className="mx-4 sm:mx-6 mb-[calc(env(safe-area-inset-bottom)+96px)] md:mb-4 lg:mb-6 rounded-2xl border border-border bg-card overflow-hidden flex flex-col lg:flex-1 lg:min-h-0">
        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
          {filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
              <h2 className="t-titulo text-foreground">{hayFiltros || busqueda ? 'Ninguna reserva coincide' : TITULO_VACIO[vista]}</h2>
              <p className="t-meta text-muted-foreground">
                {hayFiltros || busqueda ? 'Prueba con otros filtros o con otra búsqueda.' : vista === 'todas' ? 'Crea una con «Nueva reserva»; las de otros canales aparecen solas al entrar en Cloudbeds.' : 'Cambia de día o mira otra actividad.'}
              </p>
              {(hayFiltros || busqueda) && (
                <button type="button" onClick={limpiar} className="min-h-9 pointer-coarse:min-h-11 px-4 rounded-full border border-border bg-card t-cuerpo-fuerte hover:bg-muted cursor-pointer">Quitar filtros</button>
              )}
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_var(--border)] t-etiqueta text-muted-foreground">
                <tr>
                  <th className="px-3 sm:px-6 py-3.5">Huésped</th>
                  <th className="px-3 sm:px-6 py-3.5 hidden md:table-cell">Cabaña</th>
                  <th className="px-3 sm:px-6 py-3.5 hidden md:table-cell" aria-sort={orden.campo === 'estadia' ? (orden.asc ? 'ascending' : 'descending') : undefined}>
                    <BotonOrden activo={orden.campo === 'estadia'} asc={orden.asc} onClick={() => ordenarPor('estadia')}>Estadía</BotonOrden>
                  </th>
                  <th className="px-3 sm:px-6 py-3.5 hidden xl:table-cell">Canal</th>
                  <th className="px-3 sm:px-6 py-3.5">Estado</th>
                  <th className="px-3 sm:px-6 py-3.5 hidden xl:table-cell">Pago</th>
                  <th className="w-px whitespace-nowrap px-3 sm:px-6 py-3.5 text-right" aria-sort={orden.campo === 'total' ? (orden.asc ? 'ascending' : 'descending') : undefined}>
                    <BotonOrden activo={orden.campo === 'total'} asc={orden.asc} onClick={() => ordenarPor('total')} derecha>Total</BotonOrden>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibles.map((f) => {
                  const noches = dayjs(f.salida).diff(dayjs(f.llegada), 'day');
                  const cancelada = f.estado === 'cancelada' || f.estado === 'rechazada';
                  const textoEstadia = !cancelada ? TEXTO_ESTADIA[estadiaDe(f, hoy)] : '';
                  const venta = f.r?.venta_id ? ventas.get(f.r.venta_id) : undefined;
                  const pago = pagoDeVenta(venta);
                  const huespedes = `${plural(f.adultos, 'adulto', 'adultos')}${f.ninos ? ` · ${plural(f.ninos, 'niño', 'niños')}` : ''}`;
                  const fechas = `${dayjs(f.llegada).format('DD/MM')} → ${dayjs(f.salida).format('DD/MM/YY')}`;
                  return (
                    <tr
                      key={f.clave} tabIndex={0} onClick={() => abrir(f)} onKeyDown={(e) => abrirConTeclado(e, f)}
                      aria-label={`Abrir la reserva de ${f.nombre}, ${f.cabana}, ${fechas}`}
                      className={cn('cursor-pointer hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary transition-colors', cancelada && 'opacity-60')}
                    >
                      <td className="px-3 sm:px-6 py-3 h-14">
                        <div className="flex flex-col min-w-0">
                          <span className={cn('t-fila text-foreground truncate', cancelada && 'line-through')}>{f.nombre}</span>
                          {/* En celular la cabaña y las fechas van aquí; desde md tienen su columna. */}
                          <span className="t-meta text-muted-foreground truncate md:hidden">{f.cabana} · {fechas}</span>
                          <span className="t-meta text-muted-foreground truncate hidden md:block">
                            {f.r?.grupo_etiqueta ? `Grupo ${f.r.grupo_etiqueta}` : f.r?.grupo_id ? 'Grupo' : f.codigo ? `Cloudbeds ${f.codigo}` : 'Sin código de Cloudbeds'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 hidden md:table-cell">
                        <div className="flex flex-col">
                          <span className="t-cuerpo-fuerte text-foreground">{f.cabana}</span>
                          <span className="t-meta text-muted-foreground">{huespedes}</span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 hidden md:table-cell">
                        <div className="flex flex-col gap-0.5">
                          <span className="t-cuerpo text-foreground tabular-nums whitespace-nowrap">{fechas}</span>
                          <span className="t-meta text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
                            {plural(noches, 'noche', 'noches')}
                            {textoEstadia && <EstadoBadge tono="info" className="py-0.5">{textoEstadia}</EstadoBadge>}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 hidden xl:table-cell"><span className="t-cuerpo text-foreground">{f.canal}</span></td>
                      <td className="px-3 sm:px-6 py-3">{celdaEstado(f)}</td>
                      <td className="px-3 sm:px-6 py-3 hidden xl:table-cell">
                        {pago ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <EstadoBadge tono={pago.tono}>{pago.etiqueta}</EstadoBadge>
                            {venta && venta.saldo > 0.005 && <span className="t-meta text-muted-foreground tabular-nums">Saldo {dinero(venta.saldo)}</span>}
                          </div>
                        ) : (
                          <span className="t-meta text-muted-foreground">{venta?.anulado ? 'Venta anulada' : 'Sin venta'}</span>
                        )}
                      </td>
                      <td className="w-px whitespace-nowrap px-3 sm:px-6 py-3 text-right">
                        <span className={cn('t-cuerpo-fuerte tabular-nums text-foreground', cancelada && 'line-through', !f.r && 'text-muted-foreground')}>{f.r ? dinero(totalConExtras(f.r)) : '—'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <Paginacion page={paginaActual} totalPages={paginas} total={filtradas.length} pageSize={POR_PAGINA} onPageChange={setPagina} />
        </section>
      </div>

      <TarjetaInfoDialog info={info} habitaciones={habitaciones} onClose={() => setInfo(null)} puedeGestionar={puedeGestionar} onAdoptar={onAdoptar} onEliminarBloqueo={onEliminarBloqueo} />
    </div>
  );
}

function BotonOrden({ activo, asc, onClick, derecha, children }: { activo: boolean; asc: boolean; onClick: () => void; derecha?: boolean; children: string }) {
  const Flecha = asc ? ArrowUp : ArrowDown;
  return (
    <button type="button" onClick={onClick} title={`Ordenar por ${children.toLowerCase()}`}
      className={cn('inline-flex items-center gap-1 min-h-8 pointer-coarse:min-h-11 uppercase cursor-pointer hover:text-foreground', activo && 'text-foreground', derecha && 'flex-row-reverse')}>
      {children}
      <Flecha size={12} weight="bold" className={cn(!activo && 'opacity-0')} aria-hidden />
    </button>
  );
}

/** Un grupo del panel de filtros: su título y las opciones como chips que se activan y desactivan. */
function GrupoFiltro<T extends string>({ titulo, opciones, seleccion, onToggle }: { titulo: string; opciones: OpcionFiltro<T>[]; seleccion: Set<T>; onToggle: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="t-etiqueta text-muted-foreground">{titulo}</span>
      <div className="flex flex-wrap gap-2">
        {opciones.map((o) => <FiltroChip key={o.value} activo={seleccion.has(o.value)} onClick={() => onToggle(o.value)}>{o.label}</FiltroChip>)}
      </div>
    </div>
  );
}
