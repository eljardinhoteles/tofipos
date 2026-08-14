import { useMemo, useState, useEffect } from 'react';
import { MagnifyingGlass, Plus, Paperclip, Receipt, Receipt as ReceiptEmpty, CreditCard, ForkKnife, BedIcon, Table, Door, Calendar, FunnelSimple, CaretDown, ChatText } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useVentasConMovimientos, type VentaConMovimientos } from '../hooks/useVentasConMovimientos';
import type { VentaOrigen, VentaTipo } from '../db/rxdb';
import { VentaDetalleAcciones } from '../components/CentroVentas/VentaDetalleAcciones';
import { RegistrarVentaPanel } from '../components/CentroVentas/RegistrarVentaPanel';

const ORIGEN_LABEL: Record<VentaOrigen, string> = {
  mesa: 'Mesa',
  reserva_restaurante: 'Reserva restaurante',
  reserva_hotel: 'Reserva hotel',
  habitacion: 'Checkout habitación',
};

const ORIGEN_FILTER_LABEL: Record<VentaOrigen, string> = {
  mesa: 'Mesa',
  reserva_restaurante: 'Restaurante',
  reserva_hotel: 'Hotel',
  habitacion: 'Habitación',
};

const ORIGEN_ICON: Record<VentaOrigen, typeof Table> = {
  mesa: Table,
  reserva_restaurante: ForkKnife,
  reserva_hotel: BedIcon,
  habitacion: Door,
};

const ORIGEN_CLASSES: Record<VentaOrigen, string> = {
  mesa: 'bg-blue-50 text-blue-700 border-blue-200',
  reserva_restaurante: 'bg-amber-50 text-amber-700 border-amber-200',
  reserva_hotel: 'bg-purple-50 text-purple-700 border-purple-200',
  habitacion: 'bg-teal-50 text-teal-700 border-teal-200',
};

const ORIGEN_FILTERS: VentaOrigen[] = ['mesa', 'reserva_restaurante', 'reserva_hotel', 'habitacion'];

// Dropdown de estado: solo clasificadores de conciliación, combinables
// entre sí. Directa/Crédito quedan como chips principales aparte.
type EstadoFiltro = 'pagado' | 'facturado' | 'anulado';

const ESTADO_FILTERS: { value: EstadoFiltro; label: string }[] = [
  { value: 'pagado', label: 'Pagado' },
  { value: 'facturado', label: 'Facturado' },
  { value: 'anulado', label: 'Anulado' },
];

function cumpleEstado(item: VentaConMovimientos, filtro: EstadoFiltro) {
  if (filtro === 'pagado') return item.totalPagado > 0;
  if (filtro === 'facturado') return item.facturado;
  if (filtro === 'anulado') return item.anulado;
  return true;
}

// Estado principal de la fila — un único vistazo: pagado (verde), pendiente
// de cobro (ámbar), o anulado (gris) — franja lateral + badge de texto,
// en vez de un cluster de iconos sueltos.
type EstadoPrincipal = 'pagado' | 'pendiente' | 'anulado';

const ESTADO_PRINCIPAL_LABEL: Record<EstadoPrincipal, string> = {
  pagado: 'Pagado',
  pendiente: 'Pendiente',
  anulado: 'Anulado',
};

const ESTADO_PRINCIPAL_BAR: Record<EstadoPrincipal, string> = {
  pagado: 'bg-emerald-500',
  pendiente: 'bg-amber-500',
  anulado: 'bg-muted-foreground/30',
};

const ESTADO_PRINCIPAL_BADGE: Record<EstadoPrincipal, string> = {
  pagado: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  pendiente: 'border-amber-200 text-amber-700 bg-amber-50',
  anulado: 'border-border text-muted-foreground bg-muted',
};

function estadoPrincipalDe(item: VentaConMovimientos): EstadoPrincipal {
  if (item.anulado) return 'anulado';
  if (item.totalPagado > 0) return 'pagado';
  return 'pendiente';
}

const toggleSet = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setter(next);
};

export default function CentroVentasV2() {
  const { items } = useVentasConMovimientos();

  const [searchQuery, setSearchQuery] = useState('');
  const [tipoFilter, setTipoFilter] = useState<VentaTipo | null>(null);
  const [origenFilters, setOrigenFilters] = useState<Set<VentaOrigen>>(new Set());
  const [estadoFilters, setEstadoFilters] = useState<Set<EstadoFiltro>>(new Set());
  const [estadoOpen, setEstadoOpen] = useState(false);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedVentaId, setSelectedVentaId] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);

  const [displayLimit, setDisplayLimit] = useState(30);

  // Buscador robusto: cliente, referencia, monto, fecha, factura, método —
  // cualquier dato recordado sirve de punto de entrada, sin pasar primero
  // por "¿de qué cliente es?".
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const [start, end] = dateRange;

    return items.filter(item => {
      if (tipoFilter && item.venta.tipo !== tipoFilter) return false;
      if (origenFilters.size > 0 && !origenFilters.has(item.venta.origen)) return false;
      if (estadoFilters.size > 0 && ![...estadoFilters].every(f => cumpleEstado(item, f))) return false;

      if (start) {
        const fecha = new Date(item.fechaUltimoMovimiento);
        const startLimit = new Date(start);
        startLimit.setHours(0, 0, 0, 0);
        const endLimit = new Date(end || start);
        endLimit.setHours(23, 59, 59, 999);
        if (fecha < startLimit || fecha > endLimit) return false;
      }

      if (q) {
        const haystack = [
          item.venta.cliente_nombre ?? '',
          item.venta.referencia ?? '',
          item.metodoPago ?? '',
          item.numeroFactura ?? '',
          item.textoComentarios,
          item.montoTotal.toFixed(2),
          String(Math.round(item.montoTotal)),
          dayjs(item.fechaUltimoMovimiento).format('DD/MM/YYYY'),
          dayjs(item.fechaUltimoMovimiento).format('DD MMM'),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [items, tipoFilter, origenFilters, estadoFilters, dateRange, searchQuery]);

  // Resetear el límite al aplicar filtros o escribir en el buscador
  useEffect(() => {
    setDisplayLimit(30);
  }, [searchQuery, tipoFilter, origenFilters, estadoFilters, dateRange]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, displayLimit);
  }, [filteredItems, displayLimit]);

  const groupedByDay = useMemo(() => {
    const groups: { label: string; items: VentaConMovimientos[] }[] = [];
    for (const item of visibleItems) {
      const label = dayjs(item.fechaUltimoMovimiento).format('DD MMM YYYY');
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [visibleItems]);

  useEffect(() => {
    if (selectedVentaId && !items.some(i => i.venta.id === selectedVentaId)) {
      setSelectedVentaId(null);
    }
  }, [items, selectedVentaId]);

  const selected = useMemo(
    () => items.find(i => i.venta.id === selectedVentaId) ?? null,
    [items, selectedVentaId]
  );

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Panel 1: buscador + filtros + lista de ventas */}
        <aside className={cn("shrink-0 border-r border-border flex flex-col min-h-0 bg-card", (selected || registrando) ? "w-2/5" : "flex-1")}>
          <div className="p-3 border-b border-border shrink-0 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
                <Input
                  type="text" placeholder="Buscar cliente, monto, fecha, factura..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs" />
              </div>

              {/* Icono/Filtro de fecha antes del botón de añadir */}
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="Filtrar por fecha"
                    className={cn(
                      "h-9 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0",
                      dateRange[0] ? "bg-foreground text-background border-foreground shadow-xs" : "bg-card text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    <Calendar size={15} weight="bold" />
                    {dateRange[0]
                      ? `${dayjs(dateRange[0]).format('DD/MM')}${dateRange[1] ? ` - ${dayjs(dateRange[1]).format('DD/MM')}` : ''}`
                      : 'Fecha'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
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
                        type="button" onClick={() => { setDateRange([null, null]); setCalendarOpen(false); }}
                        className="text-xs font-bold text-muted-foreground cursor-pointer">
                        Limpiar filtro
                      </button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              <button
                type="button" title="Registrar venta"
                onClick={() => { setSelectedVentaId(null); setRegistrando(true); }}
                className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-xs active:scale-95 transition-all cursor-pointer shrink-0">
                <Plus size={16} weight="bold" />
              </button>
            </div>

            {/* Fila de filtros ordenados: Primero Origen (Mesa, Restaurante, Hotel) / Directo - Crédito / Dropdown de Estado */}
            <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pt-0.5">
              {/* Origen: Mesa, Restaurante, Hotel */}
              {ORIGEN_FILTERS.map(o => {
                const active = origenFilters.has(o);
                const Icon = ORIGEN_ICON[o];
                return (
                  <button
                    key={o}
                    type="button" onClick={() => toggleSet(origenFilters, o, setOrigenFilters)}
                    className={cn("px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer flex items-center gap-1 shrink-0",
                      active ? "bg-primary text-primary-foreground border-primary shadow-xs" : "bg-card text-muted-foreground border-border hover:bg-muted")}
                  >
                    <Icon size={12} weight="bold" /> {ORIGEN_FILTER_LABEL[o]}
                  </button>
                );
              })}

              <div className="w-[1px] h-4 bg-border shrink-0 mx-0.5" />

              {/* Directo / Crédito */}
              <button
                type="button" onClick={() => setTipoFilter(t => t === 'directa' ? null : 'directa')}
                className={cn("px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer shrink-0",
                  tipoFilter === 'directa' ? "bg-foreground text-background border-foreground shadow-xs" : "bg-card text-muted-foreground border-border hover:bg-muted")}
              >
                Directo
              </button>
              <button
                type="button" onClick={() => setTipoFilter(t => t === 'credito' ? null : 'credito')}
                className={cn("px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer flex items-center gap-1 shrink-0",
                  tipoFilter === 'credito' ? "bg-rose-600 text-white border-rose-600 shadow-xs" : "bg-card text-muted-foreground border-border hover:bg-muted")}
              >
                <CreditCard size={12} weight="bold" /> Crédito
              </button>

              <div className="w-[1px] h-4 bg-border shrink-0 mx-0.5" />

              {/* Dropdown de Estado */}
              <Popover open={estadoOpen} onOpenChange={setEstadoOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn("px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer flex items-center gap-1 shrink-0",
                      estadoFilters.size > 0 ? "bg-foreground text-background border-foreground shadow-xs" : "bg-card text-muted-foreground border-border hover:bg-muted")}
                  >
                    <FunnelSimple size={12} weight="bold" />
                    Estado{estadoFilters.size > 0 ? ` (${estadoFilters.size})` : ''}
                    <CaretDown size={10} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1.5" align="start">
                  {ESTADO_FILTERS.map(f => {
                    const active = estadoFilters.has(f.value);
                    return (
                      <button
                        key={f.value}
                        type="button" onClick={() => toggleSet(estadoFilters, f.value, setEstadoFilters)}
                        className={cn("w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between",
                          active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}
                      >
                        {f.label}
                        {active && <span className="text-primary">✓</span>}
                      </button>
                    );
                  })}
                  {estadoFilters.size > 0 && (
                    <button
                      type="button" onClick={() => setEstadoFilters(new Set())}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer mt-1 border-t border-border pt-2"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
                <span className="text-xs font-bold text-muted-foreground">No hay ventas</span>
                <span className="text-[11px] text-muted-foreground">Ajusta los filtros o la búsqueda.</span>
              </div>
            ) : (
              groupedByDay.map(group => (
                <div key={group.label} className="flex flex-col">
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider px-4 py-2 bg-muted/60 sticky top-0">
                    {group.label}
                  </span>
                  {group.items.map(item => {
                    const active = item.venta.id === selectedVentaId;
                    const OrigenIcon = ORIGEN_ICON[item.venta.origen];
                    const estado = estadoPrincipalDe(item);
                    return (
                      <button
                        key={item.venta.id}
                        type="button"
                        onClick={() => { setRegistrando(false); setSelectedVentaId(item.venta.id); }}
                        className={cn(
                          "w-full flex items-stretch gap-0 text-left border-b border-border/60 transition-colors cursor-pointer",
                          active ? "bg-primary/10" : "hover:bg-muted"
                        )}
                      >
                        {/* Franja de estado — verde pagado, ámbar pendiente, gris anulado */}
                        <div className={cn("w-1 shrink-0", ESTADO_PRINCIPAL_BAR[estado])} />

                        <div className="flex-1 min-w-0 flex flex-col gap-1.5 px-3.5 py-3">
                          {/* Fila 1: Badges (Origen / Crédito) -------------- Valor ($ Monto) */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <Badge variant="outline" className={cn("shrink-0 font-bold text-[10px] gap-1 px-1.5 py-0", ORIGEN_CLASSES[item.venta.origen])}>
                                <OrigenIcon size={10} weight="bold" /> {ORIGEN_LABEL[item.venta.origen]}
                              </Badge>
                              {item.venta.tipo === 'credito' && (
                                <Badge variant="outline" className="shrink-0 font-bold text-[10px] border-rose-200 text-rose-700 bg-rose-50 gap-1 px-1.5 py-0">
                                  <CreditCard size={10} weight="bold" /> Crédito
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs font-black text-foreground shrink-0">${item.montoTotal.toFixed(2)}</span>
                          </div>

                          {/* Fila 2: Nombre del cliente ---------------- Estado (Pagado/Pendiente/Anulado + Saldo) */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-foreground truncate">{item.venta.cliente_nombre || 'Sin cliente'}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {item.saldo > 0.01 && (
                                <span className="text-[10px] font-extrabold text-amber-600">saldo ${item.saldo.toFixed(2)}</span>
                              )}
                              <Badge variant="outline" className={cn("font-bold text-[10px] px-1.5 py-0", ESTADO_PRINCIPAL_BADGE[estado])}>
                                {ESTADO_PRINCIPAL_LABEL[estado]}
                              </Badge>
                            </div>
                          </div>

                          {/* Fila 3: Referencia ---------------- Icons (Comprobante / Factura / Comentario) */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground truncate font-medium">{item.venta.referencia || 'Sin referencia'}</span>
                            <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                              {item.textoComentarios && <div title={`Comentario: ${item.textoComentarios}`}><ChatText size={12} className="text-blue-600" /></div>}
                              {item.comprobanteUrl && <div title="Tiene comprobante"><Paperclip size={12} className="text-primary" /></div>}
                              {item.facturado && <div title="Facturado"><Receipt size={12} weight="fill" className="text-emerald-600" /></div>}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}

            {/* Botón de Cargar más ventas anteriores */}
            {visibleItems.length < filteredItems.length && (
              <div className="p-4 flex flex-col items-center justify-center gap-1.5 bg-muted/20 border-t border-border">
                <button
                  type="button"
                  onClick={() => setDisplayLimit(prev => prev + 30)}
                  className="px-4 py-2 rounded-xl bg-card border border-border text-xs font-bold text-foreground hover:bg-muted transition-all shadow-2xs cursor-pointer"
                >
                  Cargar más ventas ({filteredItems.length - visibleItems.length} restantes)
                </button>
                <span className="text-[10px] text-muted-foreground font-semibold">
                  Mostrando {visibleItems.length} de {filteredItems.length} ventas
                </span>
              </div>
            )}
          </div>
        </aside>

        {/* Panel 2: trabajo — detalle/acciones, formulario de registro, o estado vacío. Fijo, sin overlay. */}
        {registrando ? (
          <main className="w-3/5 shrink-0 overflow-y-auto p-6">
            <RegistrarVentaPanel
              onCancel={() => setRegistrando(false)}
              onSuccess={(ventaId) => { setRegistrando(false); setSelectedVentaId(ventaId); }}
            />
          </main>
        ) : selected ? (
          <main className="w-3/5 shrink-0 flex flex-col min-h-0">
            <VentaDetalleAcciones item={selected} />
          </main>
        ) : (
          <main className="flex-1 min-w-0 flex flex-col items-center justify-center gap-3 text-center px-6">
            <ReceiptEmpty size={40} className="text-muted-foreground/40" />
            <h2 className="text-foreground font-bold text-base">Selecciona una venta</h2>
            <p className="text-muted-foreground text-xs max-w-xs">
              Elige una venta de la lista para ver su historial, anclar, facturar o marcarla como crédito.
            </p>
          </main>
        )}
      </div>
    </div>
  );
}
