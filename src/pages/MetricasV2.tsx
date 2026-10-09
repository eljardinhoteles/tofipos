import { fechaLocal } from '../lib/fechaLocal';
import { esParteRepartida, nombreBaseReparto } from '../lib/reparto';
import { useCallback, useEffect, useMemo, useState } from'react';
import { AreaChart, Area, BarChart, Bar, XAxis, CartesianGrid } from'recharts';
import { Coin, Receipt, Warning, Tag, CalendarBlank, ArrowsClockwise, Plus, Check, X } from'@phosphor-icons/react';
import dayjs from'dayjs';
import { initVerticalRxDb, forceSyncAll, pingSyncStatus } from'../db/rxdb';
import { useDbEpoch } from'../hooks/useDbEpoch';
import { useRxClientes } from'../hooks/useRxClientes';
import { Card, CardContent, CardHeader } from'@/components/ui/card';
import { Badge } from'@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from'@/components/ui/popover';
import { Calendar as CalendarPicker } from'@/components/ui/calendar';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from'@/components/ui/chart';
import { cn } from'@/lib/utils';
import { PageFrame, PageHeader, PageContent, PageToolbar, headerIconButtonClass, toolbarChipClass } from'../components/Common/PageHeader';

type DatesRange = [Date | null, Date | null];

type SalePoint = { fecha: string; monto: number; anterior?: number; fechaAnterior?: string };
type HourPoint = { hora: string; ordenes: number; ventas: number };
// Los ítems anulados no se operaron: no cuentan. Tampoco los de $0.00, que son
// los incluidos en un plan (no son venta). Excepción: el plato origen de un reparto de valor
// (queda a $0 pero sus unidades sí son consumo real).
const esItemSinValor = (item: any) => !!item.anulado || (!Number(item.precio || 0) && !item.reparto);

type TopItemPoint = { nombre: string; cantidad: number; total: number; margen?: number | null };
type CategoryPoint = { nombre: string; monto: number };
type WeekdayPoint = { dia: string; promedio: number; total: number };
type CardMetric = { label: string; description: string; value: string; delta?: string; positive?: boolean; icon: React.ReactNode };

// Un solo acento (azul) para todo lo que se grafica; las tarjetas van neutras y
// el color semántico (verde/rojo) queda solo para subió/bajó.
const CHIP_TARJETA = 'bg-muted text-muted-foreground';

// Posición en un ranking: el primero va en oscuro, el resto en neutro.
function RankBadge({ n }: { n: number }) {
  return (
    <span className={cn("shrink-0 h-6 min-w-8 px-2 rounded-full inline-flex items-center justify-center text-[11px] font-extrabold tabular-nums",
      n === 1 ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
      #{n}
    </span>
  );
}

function money(value: number) {
 return`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function startOfDay(date: Date) {
 const d = new Date(date);
 d.setHours(0, 0, 0, 0);
 return d;
}

function endOfDay(date: Date) {
 const d = new Date(date);
 d.setHours(23, 59, 59, 999);
 return d;
}

function shiftDays(date: Date, days: number) {
 const d = new Date(date);
 d.setDate(d.getDate() + days);
 return d;
}

function daysBetween(start: Date, end: Date) {
 const diff = Math.abs(end.getTime() - start.getTime());
 return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getItemCost(item: any): number | null {
 const candidate = item?.costo ?? item?.costo_compra ?? item?.precio_costo ?? item?.costo_unitario ?? item?.coste;
 return typeof candidate ==='number'&& Number.isFinite(candidate) ? candidate : null;
}

function statDelta(current: number, previous: number, prefix ='') {
 if (previous === 0) {
 if (current === 0) return`${prefix}0%`;
 return`${prefix}+100%`;
 }
 const pct = ((current - previous) / previous) * 100;
 const sign = pct >= 0 ?'+':'';
 return`${prefix}${sign}${pct.toFixed(1)}%`;
}

const salesChartConfig = {
 monto: { label:'Ventas ($)', color:'var(--info)'},
 anterior: { label:'Periodo anterior ($)', color:'var(--muted-foreground)'},
} satisfies ChartConfig;

const ordersChartConfig = {
 ordenes: { label:'Órdenes', color:'var(--info)'},
} satisfies ChartConfig;

const weekdayChartConfig = {
 promedio: { label:'Promedio $', color:'var(--info)'},
} satisfies ChartConfig;

export default function MetricasV2() {
 // Categorías elegidas para filtrar las métricas (vacío = todas).
 const [catFiltro, setCatFiltro] = useState<string[]>([]);
 const [catOpen, setCatOpen] = useState(false);
 const [compararAnterior, setCompararAnterior] = useState(true);
 const [periodo, setPeriodo] = useState<'hoy'|'7d'|'30d'|'mes'|'custom'>('7d');
 const [calendarOpen, setCalendarOpen] = useState(false);
 const [customRange, setCustomRange] = useState<DatesRange>([null, null]);
 const [syncing, setSyncing] = useState(false);

 const handleForceSync = async () => {
 setSyncing(true);
 try {
 await forceSyncAll();
 await pingSyncStatus();
 } finally {
 setTimeout(() => setSyncing(false), 800);
 }
 };

 const [comandas, setComandas] = useState<any[]>([]);
 const [ventas, setVentas] = useState<any[]>([]);
 const [comandaItems, setComandaItems] = useState<any[]>([]);
 const [menuItems, setMenuItems] = useState<any[]>([]);
 const [categorias, setCategorias] = useState<any[]>([]);
 const { clientes } = useRxClientes();

 const dbEpoch = useDbEpoch();

 useEffect(() => {
 let alive = true;
 const subs: Array<{ unsubscribe: () => void }> = [];

 (async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const orgId = localStorage.getItem('pos_active_org_id') ||'';

 const watch = (collection: any, setter: (docs: any[]) => void) => {
 const sub = collection.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
 if (!alive) return;
 setter(docs.map((d) => d.toJSON()));
 });
 subs.push(sub);
 };

 watch(rxDb.comandas, setComandas);
 watch(rxDb.ventas, setVentas);
 watch(rxDb.comanda_items, setComandaItems);
 watch(rxDb.menu_items, setMenuItems);
 watch(rxDb.categorias, setCategorias);
 })().catch((err) => console.error('Error cargando RxDB en métricas V2:', err));

 return () => {
 alive = false;
 subs.forEach((sub) => sub.unsubscribe());
 };
 }, [dbEpoch]);

 const datesLimit = useMemo(() => {
 const today = new Date();
 let inicio = startOfDay(today);
 let fin = endOfDay(today);

 if (periodo ==='hoy') {
 inicio = startOfDay(today);
 fin = endOfDay(today);
 } else if (periodo ==='7d') {
 inicio = startOfDay(shiftDays(today, -6));
 } else if (periodo ==='30d') {
 inicio = startOfDay(shiftDays(today, -29));
 } else if (periodo ==='mes') {
 inicio = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
 } else if (periodo ==='custom'&& customRange[0]) {
 inicio = startOfDay(customRange[0]);
 fin = endOfDay(customRange[1] || customRange[0]);
 }

 return { inicio, fin };
 }, [periodo, customRange]);

 const previousLimit = useMemo(() => {
 const span = daysBetween(datesLimit.inicio, datesLimit.fin);
 const prevFin = shiftDays(datesLimit.inicio, -1);
 const prevInicio = startOfDay(shiftDays(prevFin, -(span - 1)));
 return { inicio: prevInicio, fin: endOfDay(prevFin) };
 }, [datesLimit]);

 // Los cobros reales viven en ventas[].movimientos (tipo 'pago'), no en la
 // colección `pagos` — esa quedó obsoleta cuando Centro de Ventas v2
 // reemplazó el modelo de "pago único inmutable" por ventas con historial
 // de movimientos embebido (ver comentario en RxVentaMovimiento, db/rxdb.ts).
 // Se aplana aquí a la misma forma {comanda_id, monto, fecha} que el resto
 // de este archivo ya consume, para no reescribir cada cálculo de abajo.
 const pagosBase = useMemo(() => {
 const flat: Array<{ comanda_id: string; monto: number; fecha: string; created_at: string }> = [];
 ventas.forEach((v) => {
 if (!v.comanda_id) return;
 (v.movimientos || []).forEach((m: any) => {
 if (m.tipo !=='pago'|| m.anulado) return;
 flat.push({ comanda_id: v.comanda_id, monto: Number(m.monto || 0), fecha: m.fecha, created_at: m.fecha });
 });
 });
 return flat;
 }, [ventas]);

 // ── Filtro por categorías ────────────────────────────────────────────────
 // Los cobros no se reparten por producto, así que con el filtro activo las
 // ventas salen de los ítems de esas categorías (precio × cantidad) en las
 // comandas completadas, fechadas por la comanda. Sin filtro: cobros reales.
 const filtrando = catFiltro.length > 0;
 const categoriaDeItem = useMemo(() => {
 const m = new Map<string, string>();
 menuItems.forEach((it) => { if (it?.id && it?.categoria_id) m.set(it.id, it.categoria_id); });
 return m;
 }, [menuItems]);
 const catSet = useMemo(() => new Set(catFiltro), [catFiltro]);
 // ¿El ítem cuenta en las métricas? Ni los de valor $0 de un plan, ni los
 // de otras categorías cuando hay filtro.
 const itemCuenta = useCallback(
 (item: any) => !esItemSinValor(item) && (!filtrando || catSet.has(categoriaDeItem.get(item.item_id) || '')),
 [filtrando, catSet, categoriaDeItem]
 );
 const montoFiltrado = useMemo(() => {
 const m = new Map<string, number>();
 if (!filtrando) return m;
 comandaItems.forEach((item) => {
 if (esItemSinValor(item) || !catSet.has(categoriaDeItem.get(item.item_id) || '')) return;
 m.set(item.comanda_id, (m.get(item.comanda_id) || 0) + Number(item.precio || 0) * Number(item.cantidad || 0));
 });
 return m;
 }, [filtrando, comandaItems, catSet, categoriaDeItem]);
 const pagos = useMemo(() => {
 if (!filtrando) return pagosBase;
 const flat: Array<{ comanda_id: string; monto: number; fecha: string; created_at: string }> = [];
 comandas.forEach((c) => {
 if (c.estado !== 'cerrado' && c.estado !== 'facturado') return;
 const monto = montoFiltrado.get(c.id);
 if (monto) flat.push({ comanda_id: c.id, monto, fecha: c.created_at, created_at: c.created_at });
 });
 return flat;
 }, [filtrando, pagosBase, comandas, montoFiltrado]);

 const activeComandas = useMemo(() => comandas.filter((c) => {
 const fc = new Date(c.created_at);
 return fc >= datesLimit.inicio && fc <= datesLimit.fin;
 }), [comandas, datesLimit]);

 const previousComandas = useMemo(() => comandas.filter((c) => {
 const fc = new Date(c.created_at);
 return fc >= previousLimit.inicio && fc <= previousLimit.fin;
 }), [comandas, previousLimit]);

 const activeCompletadas = useMemo(() => activeComandas.filter((c) => (c.estado ==='cerrado'|| c.estado ==='facturado') && (!filtrando || montoFiltrado.has(c.id))), [activeComandas, filtrando, montoFiltrado]);
 const previousCompletadas = useMemo(() => previousComandas.filter((c) => (c.estado ==='cerrado'|| c.estado ==='facturado') && (!filtrando || montoFiltrado.has(c.id))), [previousComandas, filtrando, montoFiltrado]);

 const activeAnuladas = useMemo(() => activeComandas.filter((c) => c.estado ==='anulada'), [activeComandas]);
 const previousAnuladas = useMemo(() => previousComandas.filter((c) => c.estado ==='anulada'), [previousComandas]);

 const currentPaidMap = useMemo(() => {
 const map = new Map<string, number>();
 pagos.forEach((p) => {
 const paymentDate = p.fecha ? new Date(p.fecha) : new Date(p.created_at || Date.now());
 if (paymentDate >= datesLimit.inicio && paymentDate <= datesLimit.fin) {
 map.set(p.comanda_id, (map.get(p.comanda_id) || 0) + Number(p.monto || 0));
 }
 });
 return map;
 }, [pagos, datesLimit]);

 // Suman directo de `pagos` (todos los movimientos de pago, con o sin
 // comanda_id) — no desde currentPaidMap/previousPaidMap, que agrupan por
 // comanda_id y por eso excluyen los pagos de checkout de habitación
 // consolidado (una venta ahí cierra varias comandas a la vez y no tiene
 // un comanda_id único que la represente).
 const ventasActuales = useMemo(() => {
 return pagos.reduce((sum, p) => {
 const paymentDate = new Date(p.fecha);
 return paymentDate >= datesLimit.inicio && paymentDate <= datesLimit.fin ? sum + Number(p.monto || 0) : sum;
 }, 0);
 }, [pagos, datesLimit]);
 const ventasAnteriores = useMemo(() => {
 return pagos.reduce((sum, p) => {
 const paymentDate = new Date(p.fecha);
 return paymentDate >= previousLimit.inicio && paymentDate <= previousLimit.fin ? sum + Number(p.monto || 0) : sum;
 }, 0);
 }, [pagos, previousLimit]);

 const ticketActual = activeCompletadas.length > 0 ? ventasActuales / activeCompletadas.length : 0;
 const ticketAnterior = previousCompletadas.length > 0 ? ventasAnteriores / previousCompletadas.length : 0;

 const ventasPorHora = useMemo<HourPoint[]>(() => {
 const buckets = new Map<number, { ordenes: number; ventas: number }>();
 for (let h = 0; h < 24; h += 1) buckets.set(h, { ordenes: 0, ventas: 0 });

 activeCompletadas.forEach((c) => {
 const hour = new Date(c.created_at).getHours();
 const current = buckets.get(hour) || { ordenes: 0, ventas: 0 };
 buckets.set(hour, {
 ordenes: current.ordenes + 1,
 ventas: current.ventas + (currentPaidMap.get(c.id) || 0),
 });
 });

 return Array.from(buckets.entries()).map(([hora, data]) => ({
 hora:`${String(hora).padStart(2,'0')}:00`,
 ordenes: data.ordenes,
 ventas: data.ventas,
 }));
 }, [activeCompletadas, currentPaidMap]);

 const topHoras = useMemo(() => [...ventasPorHora].sort((a, b) => b.ordenes - a.ordenes).slice(0, 5), [ventasPorHora]);

 const topProductos = useMemo<TopItemPoint[]>(() => {
 const counts = new Map<string, { qty: number; total: number; margin: number | null }>();
 const validIds = new Set(activeCompletadas.map((c) => c.id));

 const menuById = new Map<string, any>();
 menuItems.forEach((item) => menuById.set(item.id, item));

comandaItems.forEach((item) => {
 if (!validIds.has(item.comanda_id) || !itemCuenta(item)) return;
 // Una parte de un reparto de valor suma ingreso al plato original, no unidades:
 // las unidades ya cuentan en el ítem origen (que quedó a $0).
 const esParte = esParteRepartida(item);
 const nombre = esParte ? nombreBaseReparto(String(item.nombre)) : item.nombre;
 const current = counts.get(nombre) || { qty: 0, total: 0, margin: null as number | null };
 const total = Number(item.precio || 0) * Number(item.cantidad || 0);
 const cost = getItemCost(menuById.get(item.item_id));
 // El costo del plato ya se descontó en el ítem origen: la parte aporta su valor completo.
 const itemMargin = cost == null ? null : esParte ? total : (Number(item.precio || 0) - cost) * Number(item.cantidad || 0);
 counts.set(nombre, {
 qty: current.qty + (esParte ? 0 : Number(item.cantidad || 0)),
 total: current.total + total,
 margin: current.margin == null || itemMargin == null ? current.margin : current.margin + itemMargin,
 });
 });

 return Array.from(counts.entries())
 .map(([nombre, stat]) => ({ nombre, cantidad: stat.qty, total: stat.total, margen: stat.margin }))
 .sort((a, b) => b.cantidad - a.cantidad);
 }, [activeCompletadas, comandaItems, menuItems, itemCuenta]);

 const topCategorias = useMemo<CategoryPoint[]>(() => {
 const categoryMap = new Map<string, string>();
 const categoryNames = new Map<string, string>();
 menuItems.forEach((item) => {
 if (item?.id && item?.categoria_id) categoryMap.set(item.id, item.categoria_id);
 });
 categorias.forEach((cat) => {
 if (cat?.id && cat?.nombre) categoryNames.set(cat.id, cat.nombre);
 });

 const totals = new Map<string, number>();
 const validIds = new Set(activeCompletadas.map((c) => c.id));

 comandaItems.forEach((item) => {
 if (!validIds.has(item.comanda_id) || !itemCuenta(item)) return;
 const categoryId = categoryMap.get(item.item_id) ||'otros';
 const categoryName = categoryNames.get(categoryId) ||'Otros';
 const total = Number(item.precio || 0) * Number(item.cantidad || 0);
 totals.set(categoryName, (totals.get(categoryName) || 0) + total);
 });

 const sorted = Array.from(totals.entries())
 .map(([nombre, monto]) => ({ nombre, monto }))
 .sort((a, b) => b.monto - a.monto);

 const leading = sorted.slice(0, 9);
 const leadingSum = leading.reduce((sum, item) => sum + item.monto, 0);
 const remainder = Math.max(0, ventasActuales - leadingSum);

 if (remainder > 0) {
 return [...leading, { nombre:'Otros', monto: remainder }];
 }

 return leading.length > 0 ? leading : sorted;
 }, [activeCompletadas, comandaItems, categorias, menuItems, ventasActuales, itemCuenta]);

 // Con un solo día en rango (periodo "Hoy" o un rango personalizado de un
 // día), agrupar por día deja un único punto y el área no se puede trazar.
 // En ese caso agrupamos por hora para tener una curva legible.
 const chartData = useMemo<SalePoint[]>(() => {
 const days = daysBetween(datesLimit.inicio, datesLimit.fin);
 const fechaDe = (p: { fecha?: string; created_at?: string }) => (p.fecha ? new Date(p.fecha) : new Date(p.created_at || Date.now()));
 const enRango = (d: Date, r: { inicio: Date; fin: Date }) => d >= r.inicio && d <= r.fin;

 // Cada punto lleva `anterior`: lo vendido en la misma posición del periodo
 // anterior (misma hora, o el día que corresponde en orden).
 if (days <= 1) {
 const actual = new Map<string, number>();
 const previo = new Map<string, number>();
 for (let h = 0; h < 24; h += 1) {
 const key = `${String(h).padStart(2,'0')}:00`;
 actual.set(key, 0);
 previo.set(key, 0);
 }
 pagos.forEach((p) => {
 const d = fechaDe(p);
 const key = `${String(d.getHours()).padStart(2,'0')}:00`;
 if (enRango(d, datesLimit)) actual.set(key, (actual.get(key) || 0) + Number(p.monto || 0));
 else if (enRango(d, previousLimit)) previo.set(key, (previo.get(key) || 0) + Number(p.monto || 0));
 });
 return Array.from(actual.entries()).map(([fecha, monto]) => ({ fecha, monto, anterior: previo.get(fecha) || 0 }));
 }

 const actual = new Map<string, number>();
 const previo = new Map<string, number>();
 for (let i = 0; i < days; i += 1) {
 actual.set(fechaLocal(shiftDays(datesLimit.inicio, i)), 0);
 previo.set(fechaLocal(shiftDays(previousLimit.inicio, i)), 0);
 }
 pagos.forEach((p) => {
 const d = fechaDe(p);
 const key = fechaLocal(d);
 if (enRango(d, datesLimit)) actual.set(key, (actual.get(key) || 0) + Number(p.monto || 0));
 else if (enRango(d, previousLimit)) previo.set(key, (previo.get(key) || 0) + Number(p.monto || 0));
 });
 const claveAnterior = Array.from(previo.keys());
 return Array.from(actual.entries()).map(([fecha, monto], i) => ({
 fecha,
 monto,
 anterior: previo.get(claveAnterior[i]) || 0,
 fechaAnterior: claveAnterior[i],
 }));
 }, [pagos, datesLimit, previousLimit]);

 const topProductsByQty = useMemo<TopItemPoint[]>(() => {
 const sorted = [...topProductos].sort((a, b) => b.cantidad - a.cantidad);
 const leading = sorted.slice(0, 9);
 const leadingSum = leading.reduce((sum, item) => sum + item.total, 0);
 const remainder = Math.max(0, ventasActuales - leadingSum);

 if (remainder > 0) {
 return [...leading, { nombre:'Otros', cantidad: 0, total: remainder, margen: null }];
 }

 return leading.length > 0 ? leading : sorted;
 }, [topProductos, ventasActuales]);

 const ventasPorDiaSemana = useMemo<WeekdayPoint[]>(() => {
 const map = new Map<number, { total: number; days: Set<string> }>();
 for (let i = 0; i < 7; i += 1) map.set(i, { total: 0, days: new Set<string>() });

 pagos.forEach((p) => {
 const paymentDate = p.fecha ? new Date(p.fecha) : new Date(p.created_at || Date.now());
 if (paymentDate < datesLimit.inicio || paymentDate > datesLimit.fin) return;
 const weekday = paymentDate.getDay(); // 0=Dom, 6=Sáb
 const bucket = map.get(weekday) || { total: 0, days: new Set<string>() };
 const key = fechaLocal(paymentDate);
 bucket.total += Number(p.monto || 0);
 bucket.days.add(key);
 map.set(weekday, bucket);
 });

 return [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
 const bucket = map.get(weekday)!;
 const countDays = Math.max(1, bucket.days.size);
 const labels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
 return {
 dia: labels[(weekday + 6) % 7],
 promedio: bucket.total / countDays,
 total: bucket.total,
 };
 });
 }, [datesLimit, pagos]);

 const diaMasRentable = useMemo(() => {
 return ventasPorDiaSemana.reduce((best, current) => (current.promedio > best.promedio ? current : best), ventasPorDiaSemana[0] || { dia:'N/D', promedio: 0, total: 0 });
 }, [ventasPorDiaSemana]);

 const clientesFidelizacion = useMemo(() => {
 const frecuentes = clientes
 .map((c: any) => {
 const visitas = comandas.filter((x) => x.cliente_id === c.id || x.cliente === c.nombre).length;
 const gasto = comandas
 .filter((x) => x.cliente_id === c.id || x.cliente === c.nombre)
 .reduce((sum, x) => sum + (currentPaidMap.get(x.id) || 0), 0);
 return { nombre: c.nombre, visitas, gasto };
 })
 .filter((c) => c.visitas > 0)
 .sort((a, b) => b.gasto - a.gasto)
 .slice(0, 5);
 return frecuentes;
 }, [clientes, comandas, currentPaidMap]);

 const baseMetricCards: CardMetric[] = [
 { label:'Ventas totales', description:'Facturación acumulada en el periodo.', value: money(ventasActuales), delta: statDelta(ventasActuales, ventasAnteriores), positive: ventasActuales >= ventasAnteriores, icon: <Coin size={20} weight="fill"/> },
 { label:'Ticket promedio', description:'Promedio por orden completada.', value: money(ticketActual), delta: statDelta(ticketActual, ticketAnterior), positive: ticketActual >= ticketAnterior, icon: <Tag size={20} weight="fill"/> },
 { label:'Órdenes completadas', description:'Órdenes cerradas o facturadas.', value: String(activeCompletadas.length), delta: statDelta(activeCompletadas.length, previousCompletadas.length), positive: activeCompletadas.length >= previousCompletadas.length, icon: <Receipt size={20} weight="fill"/> },
 { label:'Órdenes anuladas', description:'Órdenes canceladas dentro del periodo.', value: String(activeAnuladas.length), delta: statDelta(activeAnuladas.length, previousAnuladas.length), positive: activeAnuladas.length <= previousAnuladas.length, icon: <Warning size={20} weight="fill"/> },
 ];

 const etiquetaPeriodo = periodo === 'hoy' ? 'Hoy' : periodo === '7d' ? 'Últimos 7 días' : periodo === '30d' ? 'Últimos 30 días' : periodo === 'mes' ? 'Este mes'
 : customRange[0] ? `${dayjs(customRange[0]).format('DD/MM')}${customRange[1] ? ` - ${dayjs(customRange[1]).format('DD/MM')}` : ''}` : 'Rango personalizado';
 const peakHour = topHoras[0]?.hora ||'N/D';
 const peakOrders = topHoras[0]?.ordenes || 0;
 const peakSales = topHoras[0]?.ventas || 0;

 return (
 <PageFrame>
 <PageHeader
 title="Métricas"
 subtitle={`${etiquetaPeriodo}${filtrando ? ` · ${catFiltro.length} ${catFiltro.length === 1 ? 'categoría' : 'categorías'}` : ''}`}
 actions={
 <button type="button" title="Recargar datos" aria-label="Recargar datos" onClick={handleForceSync} disabled={syncing}
 className={cn(headerIconButtonClass, 'disabled:opacity-60')}>
 <ArrowsClockwise size={18} weight="bold" className={syncing ? 'animate-spin' : ''}/>
 </button>
 }
 />

 <PageContent>
 {/* Periodo y categorías en una sola fila */}
 <PageToolbar>
 {([
 { value:'hoy', label:'Hoy'},
 { value:'7d', label:'7d'},
 { value:'30d', label:'30d'},
 { value:'mes', label:'Este Mes'},
 { value:'custom', label:'Personalizado'},
 ] as const).map(({ value, label }) => (
 <button
 key={value}
 type="button" onClick={() => { setPeriodo(value); if (value === 'custom') setCalendarOpen(true); }}
 className={toolbarChipClass(periodo === value)}
 >
 {label}
 </button>
 ))}

 {periodo ==='custom' && (
 <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
 <PopoverTrigger asChild>
 <button type="button" title="Cambiar rango de fechas"
 className="h-8 px-3 rounded-full bg-muted text-foreground text-xs font-bold border border-border inline-flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap">
 <CalendarBlank size={14} />
 {customRange[0] ? `${dayjs(customRange[0]).format('DD/MM')}${customRange[1] ? ` - ${dayjs(customRange[1]).format('DD/MM')}` : ''}` : 'Elegir fechas'}
 </button>
 </PopoverTrigger>
 <PopoverContent className="w-auto p-0" align="start">
 <CalendarPicker
 mode="range"
 selected={customRange[0] ? { from: customRange[0], to: customRange[1] ?? undefined } : undefined}
 onSelect={(range) => {
 setCustomRange([range?.from ?? null, range?.to ?? null]);
 if (range?.from && range?.to) setCalendarOpen(false);
 }}
 />
 </PopoverContent>
 </Popover>
 )}

 {categorias.length > 0 && (
 <>
 <div className="w-px h-6 bg-border shrink-0" />
 <Popover open={catOpen} onOpenChange={setCatOpen}>
 <PopoverTrigger asChild>
 <button type="button"
 className="h-8 px-3 rounded-full border border-dashed border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:border-foreground/40 flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 whitespace-nowrap">
 <Plus size={13} weight="bold" /> Categoría
 </button>
 </PopoverTrigger>
 <PopoverContent align="start" className="w-60 p-1.5 flex flex-col gap-0.5 max-h-80 overflow-y-auto">
 {categorias.map((cat: any) => {
 const on = catFiltro.includes(cat.id);
 return (
 <button key={cat.id} type="button" aria-pressed={on}
 onClick={() => setCatFiltro(prev => on ? prev.filter(x => x !== cat.id) : [...prev, cat.id])}
 className="flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-left text-sm font-semibold hover:bg-muted cursor-pointer">
 <span className={cn("w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0", on ? "bg-foreground border-foreground text-background" : "border-border")}>
 {on && <Check size={11} weight="bold" />}
 </span>
 <span className="truncate">{cat.nombre}</span>
 </button>
 );
 })}
 </PopoverContent>
 </Popover>
 {catFiltro.map((id) => {
 const cat = categorias.find((c: any) => c.id === id);
 if (!cat) return null;
 return (
 <span key={id} className="h-8 pl-3 pr-1.5 rounded-full bg-muted text-xs font-bold text-foreground inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
 {cat.nombre}
 <button type="button" aria-label={`Quitar ${cat.nombre}`} onClick={() => setCatFiltro(prev => prev.filter(x => x !== id))}
 className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background cursor-pointer">
 <X size={11} weight="bold" />
 </button>
 </span>
 );
 })}
 {filtrando && (
 <button type="button" onClick={() => setCatFiltro([])} className="h-8 px-2 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer shrink-0 whitespace-nowrap">Quitar todo</button>
 )}
 </>
 )}
 </PageToolbar>

 {/* Content */}
 <main className="flex-1 overflow-y-auto p-6 w-full flex flex-col gap-6">
 {/* Metric Cards */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 {baseMetricCards.map((card) => (
 <Card key={card.label}>
 <CardContent className="flex flex-col justify-between gap-3">
 <div className="flex items-start justify-between">
 <div className="flex flex-col gap-1 min-w-0">
 <span className="text-2xl font-black text-foreground tracking-tight">{card.value}</span>
 <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{card.label}</span>
 <span className="text-xs text-muted-foreground leading-snug">{card.description}</span>
 </div>
 <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
 CHIP_TARJETA)}>
 {card.icon}
 </div>
 </div>

 {card.delta && (
 <Badge variant="secondary" className={cn("w-fit font-extrabold text-[11px]",
 card.positive ?"bg-success-soft text-success-foreground":"bg-destructive-soft text-destructive")}>
 {card.positive ?'↑':'↓'} {card.delta.replace(/^[+-]/,'')}
 </Badge>
 )}
 </CardContent>
 </Card>
 ))}
 </div>

 {/* Evolución de ventas.
 Envuelta en un div: un Card (flex flex-col + overflow-hidden) como hijo
 DIRECTO del <main> (también flex-col) colapsa a la altura del header en
 Chromium — es un caso conocido de flex-col anidado sin básis de altura
 explícita. Todas las demás cards de esta página escapan al bug porque
 están dentro de un grid intermedio; replicamos ese mismo aislamiento
 aquí con un div en vez de meterla en un grid de 1 columna. */}
 <div>
 <Card>
 <CardHeader>
 <div className="flex items-start justify-between gap-3">
 <div className="flex flex-col gap-0.5">
 <h3 className="font-extrabold text-base text-foreground">Evolución de ventas</h3>
 <p className="text-xs text-muted-foreground">Facturación dentro del periodo seleccionado.</p>
 </div>
 <button type="button" aria-pressed={compararAnterior} onClick={() => setCompararAnterior(v => !v)}
 className={cn("h-8 px-3 rounded-full border text-xs font-bold whitespace-nowrap cursor-pointer transition-colors shrink-0",
 compararAnterior ? "bg-muted text-foreground border-border" : "bg-card text-muted-foreground border-border hover:text-foreground")}>
 {compararAnterior ? 'Comparando con periodo anterior' : 'Comparar con periodo anterior'}
 </button>
 </div>
 </CardHeader>
 <CardContent>
 {ventasActuales === 0 ? (
 <div className="h-[230px] w-full flex items-center justify-center text-xs text-muted-foreground">
 Sin ventas registradas en el periodo.
 </div>
 ) : (
 <ChartContainer config={salesChartConfig} className="h-[230px] w-full">
 <AreaChart data={chartData}>
 <CartesianGrid vertical={false} />
 <XAxis dataKey="fecha" tickLine={false} axisLine={false} tickMargin={8} />
 <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => (
 <div className="flex w-full items-center justify-between gap-4">
 <span className="text-muted-foreground">{name === 'anterior' ? 'Periodo anterior' : 'Este periodo'}</span>
 <span className="font-mono font-bold text-foreground tabular-nums">{money(Number(value))}</span>
 </div>
 )} />} />
 {compararAnterior && (
 <Area dataKey="anterior" type="monotone" fill="none" stroke="var(--color-anterior)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
 )}
 <Area dataKey="monto" type="monotone" fill="var(--color-monto)" fillOpacity={0.2} stroke="var(--color-monto)" strokeWidth={2} />
 </AreaChart>
 </ChartContainer>
 )}
 </CardContent>
 </Card>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Ventas por hora */}
 <Card>
 <CardHeader>
 <h3 className="font-extrabold text-base text-foreground">Ventas por hora y horas pico</h3>
 <p className="text-xs text-muted-foreground">La franja con más pedidos del día marca la hora pico operativa.</p>
 </CardHeader>
 <CardContent className="flex flex-col gap-3">
 <ChartContainer config={ordersChartConfig} className="h-[230px] w-full">
 <BarChart data={ventasPorHora}>
 <CartesianGrid vertical={false} />
 <XAxis dataKey="hora" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
 <ChartTooltip content={<ChartTooltipContent />} />
 <Bar dataKey="ordenes" fill="var(--color-ordenes)" radius={4} />
 </BarChart>
 </ChartContainer>
 <div className="flex items-center justify-between">
 <span className="text-sm font-bold text-foreground">Hora pico: {peakHour}</span>
 <span className="text-sm text-muted-foreground">{peakOrders} órdenes, {money(peakSales)}</span>
 </div>
 </CardContent>
 </Card>

 {/* Rentabilidad por día */}
 <Card>
 <CardHeader>
 <h3 className="font-extrabold text-base text-foreground">Rentabilidad promedio por día de semana</h3>
 <p className="text-xs text-muted-foreground">Usa ventas promedio por día para detectar el día más fuerte del periodo.</p>
 </CardHeader>
 <CardContent className="flex flex-col gap-3">
 <ChartContainer config={weekdayChartConfig} className="h-[230px] w-full">
 <BarChart data={ventasPorDiaSemana}>
 <CartesianGrid vertical={false} />
 <XAxis dataKey="dia" tickLine={false} axisLine={false} tickMargin={8} />
 <ChartTooltip content={<ChartTooltipContent formatter={(value) => money(Number(value))} />} />
 <Bar dataKey="promedio" fill="var(--color-promedio)" radius={4} />
 </BarChart>
 </ChartContainer>
 <p className="text-sm font-bold text-foreground text-center">
 Día más rentable: {diaMasRentable.dia} - {money(diaMasRentable.promedio)}
 </p>
 </CardContent>
 </Card>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Top productos */}
 <Card>
 <CardHeader>
 <h3 className="font-extrabold text-base text-foreground">Top productos vendidos</h3>
 <p className="text-xs text-muted-foreground">Productos con mayor volumen de venta por unidades.</p>
 </CardHeader>
 <CardContent className="flex flex-col gap-4">
 {topProductsByQty.map((item, index) => {
 const pct = ventasActuales > 0 ? (item.total / ventasActuales) * 100 : 0;
 return (
 <div key={item.nombre}>
 <div className="flex items-start justify-between gap-3 mb-1.5">
 <div className="flex items-center gap-2.5 min-w-0 flex-1">
 <RankBadge n={index + 1} />
 <div className="min-w-0 flex-1">
 <p className="text-sm font-bold text-foreground truncate">{item.nombre}</p>
 <p className="text-xs text-muted-foreground">{item.cantidad} unidades</p>
 </div>
 </div>
 <div className="flex flex-col items-end shrink-0">
 <span className="text-sm font-black text-foreground">{money(item.total)}</span>
 <span className="text-xs text-muted-foreground">{pct.toFixed(0)}% de ventas</span>
 </div>
 </div>
 <div className="h-2 rounded-full bg-muted overflow-hidden">
 <div className={cn("h-full rounded-full", index === 0 ?"bg-info":"bg-info/50")} style={{ width:`${Math.min(100, pct)}%`}} />
 </div>
 </div>
 );
 })}
 </CardContent>
 </Card>

 {/* Top categorías */}
 <Card>
 <CardHeader>
 <h3 className="font-extrabold text-base text-foreground">Top categorías</h3>
 <p className="text-xs text-muted-foreground">Distribución de facturación por categoría de producto.</p>
 </CardHeader>
 <CardContent className="flex flex-col gap-4">
 {topCategorias.map((c, i) => {
 const pct = ventasActuales > 0 ? (c.monto / ventasActuales) * 100 : 0;
 return (
 <div key={c.nombre}>
 <div className="flex items-start justify-between gap-3 mb-1.5">
 <div className="flex items-center gap-2.5 min-w-0 flex-1">
 <RankBadge n={i + 1} />
 <div className="min-w-0 flex-1">
 <p className="text-sm font-bold text-foreground truncate">{c.nombre}</p>
 <p className="text-xs text-muted-foreground">{pct.toFixed(0)}% de ventas</p>
 </div>
 </div>
 <span className="text-sm font-black text-foreground shrink-0">{money(c.monto)}</span>
 </div>
 <div className="h-2 rounded-full bg-muted overflow-hidden">
 <div className={cn("h-full rounded-full", i === 0 ?"bg-info":"bg-info/50")} style={{ width:`${Math.min(100, pct)}%`}} />
 </div>
 </div>
 );
 })}
 </CardContent>
 </Card>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Clientes más valiosos */}
 <Card>
 <CardHeader>
 <h3 className="font-extrabold text-base text-foreground">Clientes más valiosos</h3>
 <p className="text-xs text-muted-foreground">Basado en visitas y gasto acumulado.</p>
 </CardHeader>
 <CardContent className="flex flex-col gap-2.5">
 {clientesFidelizacion.map((client, index) => (
 <div key={client.nombre} className="p-3 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
 <div className="flex items-center gap-2.5 min-w-0 flex-1">
 <RankBadge n={index + 1} />
 <div className="min-w-0 flex-1">
 <p className="text-sm font-bold text-foreground truncate">{client.nombre}</p>
 <p className="text-xs text-muted-foreground">{client.visitas} visitas</p>
 </div>
 </div>
 <span className="text-sm font-black text-foreground shrink-0">{money(client.gasto)}</span>
 </div>
 ))}
 </CardContent>
 </Card>

 {/* Resumen de fidelización */}
 <Card>
 <CardHeader>
 <h3 className="font-extrabold text-base text-foreground">Resumen de fidelización</h3>
 <p className="text-xs text-muted-foreground">Clientes, recurrencia y consumo promedio.</p>
 </CardHeader>
 <CardContent className="flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <span className="text-sm font-bold text-foreground">Total clientes</span>
 <span className="text-sm font-black text-foreground">{clientes.length}</span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-sm font-bold text-foreground">Clientes con consumo en el periodo</span>
 <span className="text-sm font-black text-foreground">{clientesFidelizacion.length}</span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-sm font-bold text-foreground">Ticket promedio</span>
 <span className="text-sm font-black text-foreground">{money(ticketActual)}</span>
 </div>
 </CardContent>
 </Card>
 </div>
 </main>
 </PageContent>
 </PageFrame>
 );
}
