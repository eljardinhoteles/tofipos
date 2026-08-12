import { useEffect, useMemo, useState } from'react';
import { AreaChart, Area, BarChart, Bar, XAxis, CartesianGrid } from'recharts';
import { Coin, Receipt, Warning, Tag, CalendarBlank } from'@phosphor-icons/react';
import dayjs from'dayjs';
import { initVerticalRxDb } from'../db/rxdb';
import { useDbEpoch } from'../hooks/useDbEpoch';
import { useRxClientes } from'../hooks/useRxClientes';
import { Card, CardContent, CardHeader } from'@/components/ui/card';
import { Badge } from'@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from'@/components/ui/popover';
import { Calendar as CalendarPicker } from'@/components/ui/calendar';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from'@/components/ui/chart';
import { cn } from'@/lib/utils';

type DatesRange = [Date | null, Date | null];

type SalePoint = { fecha: string; monto: number };
type HourPoint = { hora: string; ordenes: number; ventas: number };
type TopItemPoint = { nombre: string; cantidad: number; total: number; margen?: number | null };
type CategoryPoint = { nombre: string; monto: number };
type WeekdayPoint = { dia: string; promedio: number; total: number };
type CardMetric = { label: string; description: string; value: string; delta?: string; positive?: boolean; icon: React.ReactNode };

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
 monto: { label:'Ventas ($)', color:'var(--primary)'},
} satisfies ChartConfig;

const ordersChartConfig = {
 ordenes: { label:'Órdenes', color:'var(--primary)'},
} satisfies ChartConfig;

const weekdayChartConfig = {
 promedio: { label:'Promedio $', color:'var(--primary)'},
} satisfies ChartConfig;

export default function MetricasV2() {
 const [periodo, setPeriodo] = useState<'hoy'|'7d'|'30d'|'mes'|'custom'>('7d');
 const [calendarOpen, setCalendarOpen] = useState(false);
 const [customRange, setCustomRange] = useState<DatesRange>([null, null]);

 const [comandas, setComandas] = useState<any[]>([]);
 const [pagos, setPagos] = useState<any[]>([]);
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
 watch(rxDb.pagos, setPagos);
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

 const activeComandas = useMemo(() => comandas.filter((c) => {
 const fc = new Date(c.created_at);
 return fc >= datesLimit.inicio && fc <= datesLimit.fin;
 }), [comandas, datesLimit]);

 const previousComandas = useMemo(() => comandas.filter((c) => {
 const fc = new Date(c.created_at);
 return fc >= previousLimit.inicio && fc <= previousLimit.fin;
 }), [comandas, previousLimit]);

 const activeCompletadas = useMemo(() => activeComandas.filter((c) => c.estado ==='cerrado'|| c.estado ==='facturado'), [activeComandas]);
 const previousCompletadas = useMemo(() => previousComandas.filter((c) => c.estado ==='cerrado'|| c.estado ==='facturado'), [previousComandas]);

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

 const previousPaidMap = useMemo(() => {
 const map = new Map<string, number>();
 pagos.forEach((p) => {
 const paymentDate = p.fecha ? new Date(p.fecha) : new Date(p.created_at || Date.now());
 if (paymentDate >= previousLimit.inicio && paymentDate <= previousLimit.fin) {
 map.set(p.comanda_id, (map.get(p.comanda_id) || 0) + Number(p.monto || 0));
 }
 });
 return map;
 }, [pagos, previousLimit]);

 const ventasActuales = useMemo(() => Array.from(currentPaidMap.values()).reduce((a, b) => a + b, 0), [currentPaidMap]);
 const ventasAnteriores = useMemo(() => Array.from(previousPaidMap.values()).reduce((a, b) => a + b, 0), [previousPaidMap]);

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
 if (!validIds.has(item.comanda_id)) return;
 const current = counts.get(item.nombre) || { qty: 0, total: 0, margin: null as number | null };
 const total = Number(item.precio || 0) * Number(item.cantidad || 0);
 const cost = getItemCost(menuById.get(item.item_id));
 const itemMargin = cost == null ? null : (Number(item.precio || 0) - cost) * Number(item.cantidad || 0);
 counts.set(item.nombre, {
 qty: current.qty + Number(item.cantidad || 0),
 total: current.total + total,
 margin: current.margin == null || itemMargin == null ? current.margin : current.margin + itemMargin,
 });
 });

 return Array.from(counts.entries())
 .map(([nombre, stat]) => ({ nombre, cantidad: stat.qty, total: stat.total, margen: stat.margin }))
 .sort((a, b) => b.cantidad - a.cantidad);
 }, [activeCompletadas, comandaItems, menuItems]);

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
 if (!validIds.has(item.comanda_id)) return;
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
 }, [activeCompletadas, comandaItems, categorias, menuItems, ventasActuales]);

 // Con un solo día en rango (periodo "Hoy" o un rango personalizado de un
 // día), agrupar por día deja un único punto y el área no se puede trazar.
 // En ese caso agrupamos por hora para tener una curva legible.
 const chartData = useMemo<SalePoint[]>(() => {
 const days = daysBetween(datesLimit.inicio, datesLimit.fin);

 if (days <= 1) {
 const map = new Map<string, number>();
 for (let h = 0; h < 24; h += 1) map.set(`${String(h).padStart(2,'0')}:00`, 0);

 pagos.forEach((p) => {
 const paymentDate = p.fecha ? new Date(p.fecha) : new Date(p.created_at || Date.now());
 if (paymentDate >= datesLimit.inicio && paymentDate <= datesLimit.fin) {
 const key =`${String(paymentDate.getHours()).padStart(2,'0')}:00`;
 map.set(key, (map.get(key) || 0) + Number(p.monto || 0));
 }
 });

 return Array.from(map.entries()).map(([fecha, monto]) => ({ fecha, monto }));
 }

 const map = new Map<string, number>();
 for (let i = 0; i < days; i += 1) {
 const d = shiftDays(datesLimit.inicio, i);
 map.set(d.toISOString().split('T')[0], 0);
 }

 pagos.forEach((p) => {
 const paymentDate = p.fecha ? new Date(p.fecha) : new Date(p.created_at || Date.now());
 if (paymentDate >= datesLimit.inicio && paymentDate <= datesLimit.fin) {
 const key = paymentDate.toISOString().split('T')[0];
 map.set(key, (map.get(key) || 0) + Number(p.monto || 0));
 }
 });

 return Array.from(map.entries()).map(([fecha, monto]) => ({ fecha, monto }));
 }, [pagos, datesLimit]);

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
 const key = paymentDate.toISOString().split('T')[0];
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

 const cobradasCount = useMemo(
 () => activeComandas.filter((c) => c.estado ==='cobradas').length,
 [activeComandas]
 );
 const conciliadasCount = useMemo(
 () => activeComandas.filter((c) => c.estado ==='conciliadas').length,
 [activeComandas]
 );

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

 const peakHour = topHoras[0]?.hora ||'N/D';
 const peakOrders = topHoras[0]?.ordenes || 0;
 const peakSales = topHoras[0]?.ventas || 0;

 return (
 <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
 {/* Header */}
 <header className="h-14 px-6 bg-card border-b border-border flex items-center shrink-0 shadow-xs gap-3">
 <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
 {periodo ==='custom'&& customRange[0] && (
 <button
 type="button"onClick={() => setCalendarOpen(true)}
 className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/30 whitespace-nowrap cursor-pointer">
 {dayjs(customRange[0]).format('DD/MM')}
 {customRange[1] &&`- ${dayjs(customRange[1]).format('DD/MM')}`}
 </button>
 )}

 {([
 { value:'hoy', label:'Hoy'},
 { value:'7d', label:'7d'},
 { value:'30d', label:'30d'},
 { value:'mes', label:'Este Mes'},
 { value:'custom', label:'Personalizado'},
 ] as const).map(({ value, label }) => {
 const active = periodo === value;
 return (
 <button
 key={value}
 type="button"onClick={() => {
 setPeriodo(value);
 if (value ==='custom') setCalendarOpen(true);
 }}
 className={cn("px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border",
 active
 ?"bg-primary text-primary-foreground border-primary shadow-xs":"bg-card text-muted-foreground border-border")}
 >
 {label}
 </button>
 );
 })}

 {periodo ==='custom'&& (
 <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
 <PopoverTrigger asChild>
 <button
 type="button"title="Cambiar rango de fechas"
 className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 cursor-pointer">
 <CalendarBlank size={18} />
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
 </div>
 </header>

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
 card.positive ?"bg-emerald-50 text-emerald-600":"bg-red-50 text-red-600")}>
 {card.icon}
 </div>
 </div>

 {card.delta && (
 <Badge variant="secondary" className={cn("w-fit font-extrabold text-[11px]",
 card.positive ?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-700")}>
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
 <h3 className="font-extrabold text-base text-foreground">Evolución de ventas</h3>
 <p className="text-xs text-muted-foreground">Comparación de facturación diaria dentro del periodo seleccionado.</p>
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
 <ChartTooltip content={<ChartTooltipContent formatter={(value) => money(Number(value))} />} />
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
 <Badge variant={index === 0 ?"default":"secondary"} className="shrink-0">#{index + 1}</Badge>
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
 <div className={cn("h-full rounded-full", index === 0 ?"bg-emerald-500":"bg-primary")} style={{ width:`${Math.min(100, pct)}%`}} />
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
 <Badge variant={i === 0 ?"default":"secondary"} className="shrink-0">#{i + 1}</Badge>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-bold text-foreground truncate">{c.nombre}</p>
 <p className="text-xs text-muted-foreground">{pct.toFixed(0)}% de ventas</p>
 </div>
 </div>
 <span className="text-sm font-black text-foreground shrink-0">{money(c.monto)}</span>
 </div>
 <div className="h-2 rounded-full bg-muted overflow-hidden">
 <div className={cn("h-full rounded-full", i === 0 ?"bg-emerald-500":"bg-muted-foreground/40")} style={{ width:`${Math.min(100, pct)}%`}} />
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
 <Badge variant={index === 0 ?"default":"secondary"} className="shrink-0">#{index + 1}</Badge>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-bold text-foreground truncate">{client.nombre}</p>
 <p className="text-xs text-muted-foreground">{client.visitas} visitas</p>
 </div>
 </div>
 <span className="text-sm font-black text-primary shrink-0">{money(client.gasto)}</span>
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
 <div className="p-3 rounded-xl border border-border bg-muted flex flex-col gap-1.5">
 <span className="text-sm font-black text-foreground">Órdenes cobradas vs conciliadas</span>
 <div className="flex items-center justify-between">
 <span className="text-sm text-muted-foreground">Cobradas</span>
 <span className="text-sm font-black text-foreground">{cobradasCount}</span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-sm text-muted-foreground">Conciliadas</span>
 <span className="text-sm font-black text-foreground">{conciliadasCount}</span>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 </main>
 </div>
 );
}
