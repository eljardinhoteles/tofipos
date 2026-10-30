import { useRef, useMemo, useState, useEffect, useDeferredValue } from 'react';
import { Plus, Receipt as ReceiptEmpty, CreditCard, Money, ArrowLeft, ChatText, Checks, CaretRight } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { ventaCompleta, ventaIncompleta } from '../lib/seguimientoVenta';
import { IndicadoresSeguimiento } from '../components/CentroVentas/IndicadoresSeguimiento';
import { jornadaDe } from '../lib/jornada';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useRxClientes } from '../hooks/useRxClientes';
import { useVentasConMovimientos, type VentaConMovimientos } from '../hooks/useVentasConMovimientos';
import type { VentaOrigen, VentaTipo } from '../db/rxdb';
import { VentaDetalleAcciones } from '../components/CentroVentas/VentaDetalleAcciones';
import { RegistrarVentaPanel } from '../components/CentroVentas/RegistrarVentaPanel';
import { Paginacion } from '../components/Common/Paginacion';
import { limpiarReferencia } from '../lib/nombreMesa';
import { OrigenBadge, ORIGEN_BARRA_ACTIVA, ORIGEN_LABEL, ORIGEN_ICON } from '../components/Common/OrigenBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FiltroChip, FiltroLimpiarTodo, FiltroMultiple } from '../components/Common/FiltroChip';
import { FilaDeslizable } from '../components/Common/FilaDeslizable';
import { EstadoBadge, type TonoEstado } from '../components/Common/EstadoBadge';
import { PageFrame, PageHeader, PageContent, HeaderSearch, headerPrimaryButtonClass } from '../components/Common/PageHeader';
import { AsistenteCierreTurno } from '../components/CentroVentas/AsistenteCierreTurno';

// Nombres completos usados en el dropdown de filtro de origen (distinto de
// ORIGEN_LABEL: "Mesa" pasa a "Mesa de restaurante" para diferenciarse de
// "Reserva restaurante" al elegir entre las 4 opciones).
const ORIGEN_FILTER_LABEL: Record<VentaOrigen, string> = {
  mesa: 'Mesa de restaurante',
  reserva_restaurante: 'Reserva restaurante',
  reserva_hotel: 'Reserva hotel',
  habitacion: 'Consumo habitación',
};

const ORIGEN_FILTERS: VentaOrigen[] = ['mesa', 'reserva_restaurante', 'reserva_hotel', 'habitacion'];

// Dropdown de estado: solo clasificadores de conciliación, combinables
// entre sí. Directa/Crédito quedan como chips principales aparte.
type EstadoFiltro = 'pagado' | 'facturado' | 'anulado' | 'incompleta' | 'completa';

const ESTADO_FILTERS: { value: EstadoFiltro; label: string }[] = [
  { value: 'pagado', label: 'Pagado' },
  { value: 'facturado', label: 'Facturado' },
  { value: 'anulado', label: 'Anulado' },
  { value: 'incompleta', label: 'Incompleta' },
  { value: 'completa', label: 'Completa' },
];

function cumpleEstado(item: VentaConMovimientos, filtro: EstadoFiltro) {
  if (filtro === 'pagado') return item.totalPagado > 0;
  if (filtro === 'facturado') return item.facturado;
  if (filtro === 'anulado') return item.anulado;
  if (filtro === 'incompleta') return ventaIncompleta(item);
  if (filtro === 'completa') return ventaCompleta(item);
  return true;
}

// Estado principal de la fila — un único vistazo: facturado (morado, tiene
// prioridad sobre pagado porque ya cerró todo el ciclo), pagado (verde),
// pendiente de cobro (naranja), o anulado (rojo) — mismos colores que los estados de Órdenes; badge de texto, en vez de
// un cluster de iconos sueltos.
type EstadoPrincipal = 'completa' | 'facturado' | 'pagado' | 'pendiente' | 'anulado';

const ESTADO_PRINCIPAL_LABEL: Record<EstadoPrincipal, string> = {
  completa: 'Completa',
  facturado: 'Facturado',
  pagado: 'Pagado',
  pendiente: 'Pendiente',
  anulado: 'Anulado',
};

// Completa no usa badge (ver la fila): va como texto verde liso, sin fondo.
const ESTADO_PRINCIPAL_BADGE: Record<EstadoPrincipal, { tono: TonoEstado }> = {
  completa: { tono: 'neutral' },
  facturado: { tono: 'special' },
  pagado: { tono: 'success' },
  pendiente: { tono: 'warning' },
  anulado: { tono: 'destructive' },
};

function estadoPrincipalDe(item: VentaConMovimientos): EstadoPrincipal {
  if (item.anulado) return 'anulado';
  // Sin nada pendiente (cobro, comprobante y factura): el estado lo dice y los indicadores se ocultan.
  if (ventaCompleta(item)) return 'completa';
  // facturaAlDia exige además que no haya pagos posteriores a la última
  // factura — un pago nuevo tras facturar hace que la venta vuelva a verse
  // como "Pagado" hasta que se facture también ese monto (ver useVentasConMovimientos).
  if (item.facturaAlDia) return 'facturado';
  if (item.totalPagado > 0) return 'pagado';
  return 'pendiente';
}

// Quita acentos/diacríticos para que "Jose" encuentre "José" y viceversa,
// sin depender de que el usuario escriba la tilde correcta.
function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Períodos que se piden a la base local; "Todo el historial" no tiene límite de días.
const PERIODOS: { dias: number | null; label: string }[] = [
  { dias: 30, label: 'Últimos 30 días' },
  { dias: 90, label: 'Últimos 90 días' },
  { dias: 365, label: 'Último año' },
  { dias: null, label: 'Todo el historial' },
];

const toggleSet = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setter(next);
};

export default function CentroVentasV2() {
  const [searchQuery, setSearchQuery] = useState('');
  const [tipoFilter, setTipoFilter] = useState<VentaTipo | null>(null);
  // Solo ventas con comentarios: suelen ser novedades de caja.
  const [soloComentarios, setSoloComentarios] = useState(false);
  const [origenFilters, setOrigenFilters] = useState<Set<VentaOrigen>>(new Set());
  const [estadoFilters, setEstadoFilters] = useState<Set<EstadoFiltro>>(new Set());
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedVentaId, setSelectedVentaId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);

  const [page, setPage] = useState(1);
  const listaRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 30;

  // Ventana de datos: solo se piden a la base local las ventas tocadas en los últimos N días (30 por defecto).
  // "Cargar más" la amplía (90, 365 días y, al final, todo el historial). Al escribir en el buscador se busca en
  // todo el historial, y al elegir un rango de fechas manda ese rango.
  const [ventanaDias, setVentanaDias] = useState<number | null>(30);

  // Llegada desde otra pantalla (p. ej. "Ver en Centro de Ventas" de una
  // comanda cobrada): abre esa venta directamente. Lee y borra marcas de sessionStorage (sistema externo) una sola vez al
  // montar, así que va en un efecto y no en un inicializador de estado (que React ejecuta dos veces en desarrollo).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      // Llegada desde la actividad de hoy: abre el cierre de turno de hoy.
      if (sessionStorage.getItem('pos_cierre_a_abrir')) {
        sessionStorage.removeItem('pos_cierre_a_abrir');
        setSelectedDate(jornadaDe().format('DD MMM YYYY'));
      }
      const id = sessionStorage.getItem('pos_venta_a_abrir');
      if (id) {
        sessionStorage.removeItem('pos_venta_a_abrir');
        setSelectedVentaId(id);
        setVentanaDias(null); // la venta puede ser antigua: se carga todo el historial para encontrarla
      }
    } catch { /* sin storage */ }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // El buscador espera a que termines de escribir antes de recorrer la lista.
  const busquedaDiferida = useDeferredValue(searchQuery);

  // Cada palabra es una condición independiente ("juan 150" encuentra a Juan con $150); "$" y la coma decimal se ignoran.
  const terminos = useMemo(
    () => normalizar(busquedaDiferida.trim()).split(/\s+/).map(t => t.replace(/^\$/, '').replace(',', '.')).filter(Boolean),
    [busquedaDiferida],
  );

  // Fecha desde la que se piden ventas: el rango elegido manda; si no, la ventana de días; con búsqueda activa, todo.
  const desde = useMemo(() => {
    if (terminos.length > 0) return null;
    if (dateRange[0]) return dayjs(dateRange[0]).startOf('day').toISOString();
    return ventanaDias ? dayjs().subtract(ventanaDias, 'day').startOf('day').toISOString() : null;
  }, [terminos.length, dateRange, ventanaDias]);
  const { items } = useVentasConMovimientos({ desde });

  // Índice de búsqueda: el texto de cada venta se arma una sola vez cuando cambian las ventas o los clientes,
  // no en cada tecla. Incluye cliente (con documento y teléfono), referencia, método, factura, comentarios, origen,
  // estado, montos (venta, cobrado y saldo, con y sin decimales) y fecha.
  const { clientes } = useRxClientes();
  const indiceBusqueda = useMemo(() => {
    const clientePorId = new Map<string, any>(clientes.map((c: any) => [c.id, c]));
    const indice = new Map<string, string>();
    for (const item of items) {
      const c = item.venta.cliente_id ? clientePorId.get(item.venta.cliente_id) : undefined;
      const fecha = dayjs(item.fechaUltimoMovimiento);
      const montos = [item.montoTotal, item.totalPagado, Math.max(0, item.saldo)].flatMap(n => [n.toFixed(2), String(Math.round(n))]);
      indice.set(item.venta.id, normalizar([
        item.venta.cliente_nombre ?? '',
        c?.dni ?? '', c?.numero_doc ?? '', c?.telefono ?? '',
        item.venta.referencia ?? '',
        item.metodoPago ?? '',
        item.numeroFactura ?? '',
        item.textoComentarios,
        ORIGEN_LABEL[item.venta.origen],
        item.venta.tipo === 'credito' ? 'credito' : 'directa',
        item.anulado ? 'anulado anulada' : item.facturado ? 'facturado' : item.saldo > 0.01 ? 'pendiente' : 'pagado',
        ...montos,
        fecha.format('DD/MM/YYYY'),
        fecha.format('DD MMM'),
      ].join(' ')));
    }
    return indice;
  }, [items, clientes]);

  const filteredItems = useMemo(() => {
    const [start, end] = dateRange;

    return items.filter(item => {
      if (tipoFilter && item.venta.tipo !== tipoFilter) return false;
      if (soloComentarios && !item.textoComentarios) return false;
      if (origenFilters.size > 0 && !origenFilters.has(item.venta.origen)) return false;
      // Las ventas anuladas no salen en la lista por defecto: se ven eligiendo «Anulado» en el filtro de estado.
      if (item.anulado && !estadoFilters.has('anulado')) return false;
      if (estadoFilters.size > 0 && ![...estadoFilters].every(f => cumpleEstado(item, f))) return false;

      if (start) {
        const fecha = new Date(item.fechaUltimoMovimiento);
        const startLimit = new Date(start);
        startLimit.setHours(0, 0, 0, 0);
        const endLimit = new Date(end || start);
        endLimit.setHours(23, 59, 59, 999);
        if (fecha < startLimit || fecha > endLimit) return false;
      }

      if (terminos.length > 0) {
        const texto = indiceBusqueda.get(item.venta.id) ?? '';
        if (!terminos.every(t => texto.includes(t))) return false;
      }

      return true;
    });
  }, [items, tipoFilter, soloComentarios, origenFilters, estadoFilters, dateRange, terminos, indiceBusqueda]);

  // Volver a la primera página al cambiar cualquier filtro, el período o el texto de búsqueda. Se ajusta durante el
  // render (patrón de React para estado derivado de otro estado) y no en un efecto, que mostraría un instante la
  // página vieja. Todo filtro nuevo debe entrar en esta firma.
  const firmaFiltros = JSON.stringify([
    busquedaDiferida, tipoFilter, soloComentarios, [...origenFilters].sort(), [...estadoFilters].sort(),
    dateRange[0]?.getTime() ?? null, dateRange[1]?.getTime() ?? null, ventanaDias,
  ]);
  const [firmaPrevia, setFirmaPrevia] = useState(firmaFiltros);
  if (firmaPrevia !== firmaFiltros) {
    setFirmaPrevia(firmaFiltros);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPages);
  const visibleItems = useMemo(() => {
    return filteredItems.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);
  }, [filteredItems, paginaActual]);

  const groupedByDay = useMemo(() => {
    const groups: { label: string; items: VentaConMovimientos[] }[] = [];
    for (const item of visibleItems) {
      const label = jornadaDe(item.fechaUltimoMovimiento).format('DD MMM YYYY');
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [visibleItems]);

  // La venta abierta se descarta si ya no existe (p. ej. se borró). Con la lista aún vacía (cargando) no se descarta:
  // puede venir preseleccionada. Solo cuando están cargadas todas las ventas: con la ventana de días, una venta antigua
  // abierta desde el buscador sigue siendo válida aunque ya no esté en la lista.
  // Efecto (no ajuste durante el render): reacciona a datos que llegan de la base local, y así no pisa una selección
  // que otro camino acaba de fijar en el mismo render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (desde === null && selectedVentaId && items.length > 0 && !items.some(i => i.venta.id === selectedVentaId)) {
      setSelectedVentaId(null);
    }
  }, [items, selectedVentaId, desde]);

  const selected = useMemo(
    () => items.find(i => i.venta.id === selectedVentaId) ?? null,
    [items, selectedVentaId]
  );


  // Con un panel de trabajo abierto (registrar o cierre) la lista se apaga en gris, salvo la fecha cuyo cierre está abierto.
  const atenuar = registrando || (!!selectedDate && !selected);
  const claseAtenuar = cn('transition-[opacity,filter] duration-200', atenuar && 'grayscale opacity-60');

  return (
    <PageFrame>
      <PageHeader
        title="Centro de Ventas"
        subtitle={`${filteredItems.length} ${filteredItems.length === 1 ? 'venta' : 'ventas'}`}
        search={<HeaderSearch value={searchQuery} onChange={setSearchQuery} placeholder="Buscar cliente, referencia, monto..." />}
        actions={
          <>
            <button
              type="button"
              onClick={() => { setSelectedVentaId(null); setSelectedDate(null); setRegistrando(true); }}
              title="Registrar venta"
              aria-label="Registrar venta"
              className={headerPrimaryButtonClass}
            >
              <Plus size={18} weight="bold" />
              <span className="hidden 2xl:inline">Registrar venta</span>
            </button>
          </>
        }
      />

      <PageContent className="md:flex-row">
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Panel 1: buscador + filtros + lista de ventas */}
        <aside className={cn("shrink-0 border-r border-border flex flex-col min-h-0 min-w-0 bg-card", (selected || registrando || selectedDate) ? "hidden md:flex md:w-2/5" : "flex-1")}>
          <div className={cn("h-[63px] px-3 shrink-0 flex items-center", claseAtenuar)}>
            {/* Filtros: un chip por criterio, todos con el mismo componente (FiltroChip / FiltroMultiple) */}
            <FilaDeslizable etiqueta="filtros" className="flex items-center gap-2">
              <FiltroMultiple
                etiqueta="Origen"
                opciones={ORIGEN_FILTERS.map(o => ({ value: o, label: ORIGEN_FILTER_LABEL[o], icono: ORIGEN_ICON[o] }))}
                seleccion={origenFilters}
                onToggle={(o) => toggleSet(origenFilters, o, setOrigenFilters)}
                onLimpiar={() => setOrigenFilters(new Set())}
                ancho="w-64"
              />

              <FiltroChip activo={tipoFilter === 'directa'} onClick={() => setTipoFilter(t => t === 'directa' ? null : 'directa')}><Money size={14} weight="bold" /> Directo</FiltroChip>
              <FiltroChip activo={tipoFilter === 'credito'} onClick={() => setTipoFilter(t => t === 'credito' ? null : 'credito')}><CreditCard size={14} weight="bold" /> Crédito</FiltroChip>
              <FiltroChip activo={soloComentarios} onClick={() => setSoloComentarios(v => !v)} title="Solo ventas con comentarios" aria-label="Solo ventas con comentarios"><ChatText size={14} weight="bold" /></FiltroChip>

              <FiltroMultiple
                etiqueta="Estado"
                opciones={ESTADO_FILTERS.map(f => ({ value: f.value, label: f.label }))}
                seleccion={estadoFilters}
                onToggle={(v) => toggleSet(estadoFilters, v, setEstadoFilters)}
                onLimpiar={() => setEstadoFilters(new Set())}
              />

              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <FiltroChip menu activo={!!dateRange[0] || ventanaDias !== 30} title="Período de las ventas">
                    {dateRange[0]
                      ? `${dayjs(dateRange[0]).format('DD/MM')}${dateRange[1] ? ` - ${dayjs(dateRange[1]).format('DD/MM')}` : ''}`
                      : (PERIODOS.find(p => p.dias === ventanaDias)?.label ?? 'Fecha')}
                  </FiltroChip>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div role="radiogroup" aria-label="Período" className="p-2 flex flex-col">
                    {PERIODOS.map(p => {
                      const activa = !dateRange[0] && ventanaDias === p.dias;
                      return (
                        <button key={p.label} type="button" role="radio" aria-checked={activa}
                          onClick={() => { setDateRange([null, null]); setVentanaDias(p.dias); setCalendarOpen(false); }}
                          className="min-h-9 pointer-coarse:min-h-11 px-3 rounded-xl flex items-center gap-2.5 t-cuerpo text-left text-foreground hover:bg-muted cursor-pointer touch-manipulation">
                          <span className={cn("size-5 rounded-full border flex items-center justify-center shrink-0", activa ? "border-primary" : "border-border")}>
                            {activa && <span className="size-2.5 rounded-full bg-primary" />}
                          </span>
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-border">
                    <span className="block px-4 pt-3 t-etiqueta text-muted-foreground">Rango de fechas</span>
                    <CalendarPicker
                      mode="range"
                      selected={dateRange[0] ? { from: dateRange[0], to: dateRange[1] ?? undefined } : undefined}
                      onSelect={(range) => {
                        setDateRange([range?.from ?? null, range?.to ?? null]);
                        if (range?.from && range?.to) setCalendarOpen(false);
                      }}
                    />
                  </div>
                  {dateRange[0] && (
                    <div className="p-3 border-t border-border flex justify-end">
                      <button
                        type="button" onClick={() => { setDateRange([null, null]); setCalendarOpen(false); }}
                        className="min-h-9 pointer-coarse:min-h-11 px-2 t-cuerpo text-muted-foreground hover:text-foreground cursor-pointer">
                        Quitar rango
                      </button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {(dateRange[0] || origenFilters.size > 0 || estadoFilters.size > 0 || tipoFilter || soloComentarios || ventanaDias !== 30) && (
                <FiltroLimpiarTodo onClick={() => { setDateRange([null, null]); setOrigenFilters(new Set()); setEstadoFilters(new Set()); setTipoFilter(null); setSoloComentarios(false); setVentanaDias(30); }} />
              )}
            </FilaDeslizable>
          </div>

          <div ref={listaRef} className="flex-1 overflow-y-auto hide-scrollbar">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
                <span className="t-meta text-muted-foreground">No hay ventas</span>
                <span className="t-meta text-muted-foreground">Ajusta los filtros o la búsqueda. Las anuladas están ocultas: se ven con Estado → Anulado.</span>
              </div>
            ) : (
              groupedByDay.map(group => {
                const diaActivo = selectedDate === group.label && !selected && !registrando;
                return (
                <div key={group.label} className={cn("flex flex-col", !diaActivo && claseAtenuar)}>
                  {(() => {
                    // Hoy se cierra; los días pasados solo muestran el historial de sus cierres.
                    const fechaGrupo = dayjs(group.label, 'DD MMM YYYY');
                    const esHoy = !fechaGrupo.isValid() || fechaGrupo.isSame(jornadaDe(), 'day');
                    return (
                      <button
                        type="button"
                        aria-pressed={diaActivo}
                        onClick={() => { setRegistrando(false); setSelectedVentaId(null); setSelectedDate(group.label); }}
                        className={cn(
                          "t-etiqueta px-4 min-h-10 pointer-coarse:min-h-11 flex items-center justify-between gap-3 border-t border-border sticky top-0 z-10 text-left transition-colors cursor-pointer w-full touch-manipulation",
                          diaActivo ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <span>{jornadaDe(group.items[0].fechaUltimoMovimiento).toDate().toLocaleDateString('es-ES', { weekday: 'long' })} · {group.label}</span>
                        <span className={cn("flex items-center gap-1 shrink-0 t-meta normal-case tracking-normal", diaActivo ? "text-primary-foreground" : "text-muted-foreground")}>
                          {esHoy ? 'Cierre' : 'Historial'} <CaretRight size={14} />
                        </span>
                      </button>
                    );
                  })()}
                  {group.items.map(item => {
                    const active = item.venta.id === selectedVentaId;
                    const estado = estadoPrincipalDe(item);
                    // Una venta anulada se ve toda en tonos grises — ningún
                    // acento de color (origen, crédito, iconos) compite por
                    // atención con las ventas activas al escanear la lista.
                    const isAnulada = estado === 'anulado';
                    // Saldo solo cuando hubo un cobro parcial; si está todo pendiente, el total ya lo dice.
                    const excedente = !isAnulada && item.saldo < -0.01;
                    const parcial = item.saldo > 0.01 && item.saldo < item.montoTotal - 0.01;
                    const detalleVenta = [limpiarReferencia(item.venta.referencia) || null, parcial && !isAnulada ? `Saldo $${item.saldo.toFixed(2)}` : null].filter(Boolean).join(' · ');
                    return (
                      <button
                        key={item.venta.id}
                        type="button"
                        onClick={() => { setRegistrando(false); setSelectedDate(null); setSelectedVentaId(item.venta.id); }}
                        className={cn(
                          "w-full min-w-0 flex items-stretch gap-0 text-left border-b border-dashed border-border last:border-b-0 transition-colors cursor-pointer", diaActivo && claseAtenuar,
                          active ? cn("bg-muted", isAnulada ? "shadow-[inset_3px_0_0_var(--muted-foreground)]" : ORIGEN_BARRA_ACTIVA[item.venta.origen]) : "hover:bg-muted/60"
                        )}
                      >
                        {/* Dos columnas y tres filas alineadas (sin cuadrícula visible): cliente | valor, detalle (mesa o referencia y
                            comanda) | estado, origen | tres indicadores (cobro, comprobante y factura). */}
                        <div className={cn("flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4", isAnulada && "opacity-50")}>
                          <span className={cn("font-redonda t-titulo uppercase truncate", isAnulada ? "text-muted-foreground" : "text-secondary-foreground")}>
                              {item.venta.cliente_nombre || 'Sin cliente'}
                            </span>
                          <span className="justify-self-end"><span className="flex items-baseline gap-1.5">
                              {/* Un crédito ya saldado termina igual que cualquier venta completa: sin la marca «Crédito». */}
                              {item.venta.tipo === 'credito' && estado !== 'completa' && (
                                <span className={cn("t-meta", isAnulada ? "text-muted-foreground" : "text-destructive")}>Crédito</span>
                              )}
                              {/* Excedente: se cobró de más que el monto de la venta (saldo negativo), igual que en el detalle. */}
                              {excedente && (
                                <span role="img" aria-label="Con excedente" title="Con excedente" className="size-2 rounded-full bg-info self-center shrink-0" />
                              )}
                              <span className={cn("font-redonda t-titulo tabular-nums", isAnulada ? "text-muted-foreground line-through" : excedente ? "text-info-foreground" : estado === 'completa' ? "text-success-foreground" : item.venta.tipo === 'credito' ? "text-destructive" : "text-secondary-foreground")}>
                                ${item.montoTotal.toFixed(2)}
                              </span>
                            </span></span>
                          {detalleVenta ? <span className="t-meta leading-relaxed text-muted-foreground truncate">{detalleVenta}</span> : <span />}
                          {estado === 'completa' ? (
                            // Sin fondo a propósito: verde = bien, pero más liviano que el badge "Pagado" (que tiene fondo) y
                            // distinto del gris de las anuladas.
                            <span className="justify-self-end inline-flex items-center gap-1 px-1 t-dato text-success-foreground">
                              <Checks size={16} weight="bold" /> {ESTADO_PRINCIPAL_LABEL[estado]}
                            </span>
                          ) : (
                            <span className="justify-self-end"><EstadoBadge tono={ESTADO_PRINCIPAL_BADGE[estado].tono}>
                              {ESTADO_PRINCIPAL_LABEL[estado]}
                            </EstadoBadge></span>
                          )}
                          <div className="justify-self-start flex items-center gap-2 min-w-0">
                            <OrigenBadge origen={item.venta.origen} apagado={isAnulada} activo={active} />
                            {item.textoComentarios && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span role="img" aria-label={`Comentarios: ${item.cantidadComentarios}`} className={cn("flex shrink-0", isAnulada ? "text-muted-foreground" : "text-info-foreground")}><ChatText size={20} weight="fill" aria-hidden="true" /></span>
                                </TooltipTrigger>
                                <TooltipContent>{`Comentarios: ${item.cantidadComentarios}`}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="justify-self-end"><div className="flex items-center gap-1.5">
                              {!isAnulada && estado !== 'completa' && <IndicadoresSeguimiento item={item} />}
                            </div></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                );
              })
            )}
            {/* Móvil: el paginador va al final de la lista, con espacio para la barra de navegación. */}
            <div className={cn("md:hidden pb-[calc(env(safe-area-inset-bottom)+96px)]", claseAtenuar)}>
              <Paginacion page={paginaActual} totalPages={totalPages} total={filteredItems.length} pageSize={PAGE_SIZE}
                onPageChange={(n) => { setPage(n); listaRef.current?.scrollTo({ top: 0 }); }} />
            </div>
          </div>
          <Paginacion className={cn("hidden md:block", claseAtenuar)} page={paginaActual} totalPages={totalPages} total={filteredItems.length} pageSize={PAGE_SIZE}
            onPageChange={(n) => { setPage(n); listaRef.current?.scrollTo({ top: 0 }); }} />
        </aside>

        {/* Panel 2: trabajo — detalle/acciones, formulario de registro, o estado vacío. Fijo, sin overlay. */}
        {registrando ? (
          <main className="w-full md:w-3/5 shrink-0 flex flex-col min-h-0 relative">
            <div className="md:hidden flex items-center p-3 border-b border-border bg-card shrink-0">
              <button 
                onClick={() => setRegistrando(false)}
                className="flex items-center gap-2 min-h-11 text-muted-foreground hover:text-foreground">
                <ArrowLeft size={18} />
                <span className="t-cuerpo">Volver a la lista</span>
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <RegistrarVentaPanel
                onCancel={() => setRegistrando(false)}
                onSuccess={(ventaId) => { setRegistrando(false); setSelectedVentaId(ventaId); }}
              />
            </div>
          </main>
        ) : selected ? (
          <main className="w-full md:w-3/5 shrink-0 flex flex-col min-h-0 relative">
            <div className="md:hidden flex items-center p-3 border-b border-border bg-card shrink-0">
              <button 
                onClick={() => setSelectedVentaId(null)}
                className="flex items-center gap-2 min-h-11 text-muted-foreground hover:text-foreground">
                <ArrowLeft size={18} />
                <span className="t-cuerpo">Volver a la lista</span>
              </button>
            </div>
            {/* key: al cambiar de venta el detalle se remonta con su estado limpio (pestaña, acción abierta, sincronización). */}
            <VentaDetalleAcciones key={selected.venta.id} item={selected} />
          </main>
        ) : selectedDate ? (
          <main className="w-full md:w-3/5 shrink-0 flex flex-col min-h-0 relative">
            <div className="md:hidden flex items-center p-3 border-b border-border bg-card shrink-0">
              <button 
                onClick={() => setSelectedDate(null)}
                className="flex items-center gap-2 min-h-11 text-muted-foreground hover:text-foreground">
                <ArrowLeft size={18} />
                <span className="t-cuerpo">Volver a la lista</span>
              </button>
            </div>
            <AsistenteCierreTurno 
              date={selectedDate}
              items={items}
              onSelectVenta={(id) => {
                setSelectedDate(null);
                setSelectedVentaId(id);
              }}
            />
          </main>
        ) : (
          <main className="hidden md:flex flex-1 min-w-0 flex-col items-center justify-center gap-3 text-center px-6">
            <ReceiptEmpty size={40} className="text-muted-foreground/40" />
            <h2 className="text-foreground t-fila">Selecciona una venta</h2>
            <p className="text-muted-foreground t-meta max-w-xs">
              Elige una venta de la lista para ver su historial, anclar, facturar o marcarla como crédito.
            </p>
          </main>
        )}
      </div>
      </PageContent>
    </PageFrame>
  );
}
