import { useEffect, useMemo, useState } from 'react';
import { Bed, Coin, Package, Receipt, CalendarCheck, Percent, Wallet, Warning, CreditCard } from '@phosphor-icons/react';
import { AreaChart, Area, BarChart, Bar, Cell, CartesianGrid, XAxis } from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import { OrdenTopToggle, type OrdenTop } from '../Common/OrdenTop';
import { listarExtrasHotel, listarReservasHotel, listarReservasCreadasHotel, type ExtraConReserva, type ReservaHotel } from '../../lib/hotelReservasApi';
import { listarHabitaciones } from '../../lib/hotelHabitacionesApi';
import { calcularVenta } from '../../lib/ventaConMovimientos';

interface Props {
  inicio: Date; fin: Date;
  inicioAnterior: Date; finAnterior: Date;
  menuItems: any[];
  categorias: any[];
  /** Ventas de RxDB (todas): aquí se filtran las del hotel. */
  ventas: any[];
}

const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Linea { nombre: string; categoria: string; cantidad: number; total: number }

// Cada extra a una línea de producto: el del menú con su nombre y categoría; el resto en grupos fijos.
function agrupar(extras: ExtraConReserva[], menuPorId: Map<string, any>, catPorId: Map<string, string>) {
  const lineas = new Map<string, Linea>();
  let total = 0, unidades = 0;
  const reservas = new Set<string>();
  for (const { reserva_id, extra: e } of extras) {
    const monto = Number(e.monto) || 0;
    // Los cargos de Cloudbeds con monto 0 son solo la marca de «ya cubierto con productos del POS»: no son venta.
    if (!monto && !e.producto_id) continue;
    const prod = e.producto_id ? menuPorId.get(e.producto_id) : undefined;
    const nombre = prod?.nombre ?? (e.origen === 'plan' ? 'Plan de alimentación' : e.origen === 'cloudbeds' ? 'Otros cargos (Cloudbeds)' : e.descripcion);
    const categoria = prod?.categoria_id ? (catPorId.get(prod.categoria_id) ?? 'Sin categoría') : e.origen === 'plan' ? 'Plan de alimentación' : e.origen === 'cloudbeds' ? 'Otros cargos (Cloudbeds)' : 'Sin categoría';
    const cant = e.producto_id ? Number(e.cantidad) || 1 : 1;
    const l = lineas.get(nombre) ?? { nombre, categoria, cantidad: 0, total: 0 };
    l.cantidad += cant; l.total += monto;
    lineas.set(nombre, l);
    total += monto; unidades += cant; reservas.add(reserva_id);
  }
  return { lineas: [...lineas.values()], total, unidades, reservas: reservas.size };
}


// ── Reservas ────────────────────────────────────────────────────────────────
const dia = (d: Date) => dayjs(d).format('YYYY-MM-DD');

/** Noches de la estadía [llegada, salida) que caen dentro de [inicio, fin]. */
function nochesEn(r: Pick<ReservaHotel, 'llegada' | 'salida'>, inicio: Date, fin: Date) {
  const a = dayjs(r.llegada).isAfter(inicio, 'day') ? dayjs(r.llegada) : dayjs(inicio);
  const topeSalida = dayjs(r.salida);
  const topeFin = dayjs(fin).add(1, 'day');
  const b = topeSalida.isBefore(topeFin, 'day') ? topeSalida : topeFin;
  return Math.max(0, b.startOf('day').diff(a.startOf('day'), 'day'));
}

function resumenReservas(rs: ReservaHotel[], inicio: Date, fin: Date, unidades: number) {
  const vigentes = rs.filter((r) => r.estado !== 'cancelada');
  const llegadas = vigentes.filter((r) => !dayjs(r.llegada).isBefore(inicio, 'day') && !dayjs(r.llegada).isAfter(fin, 'day'));
  const canceladas = rs.filter((r) => r.estado === 'cancelada' && !dayjs(r.llegada).isBefore(inicio, 'day') && !dayjs(r.llegada).isAfter(fin, 'day')).length;
  const noches = vigentes.reduce((a, r) => a + nochesEn(r, inicio, fin), 0);
  const dias = Math.max(1, dayjs(fin).startOf('day').diff(dayjs(inicio).startOf('day'), 'day') + 1);
  const tarifa = llegadas.reduce((a, r) => a + r.total_estadia, 0);
  const nochesLlegadas = llegadas.reduce((a, r) => a + Math.max(1, dayjs(r.salida).diff(dayjs(r.llegada), 'day')), 0);
  return {
    llegadas: llegadas.length, canceladas, noches, tarifa,
    adr: nochesLlegadas > 0 ? tarifa / nochesLlegadas : 0,
    ocupacion: unidades > 0 ? Math.min(100, (noches / (unidades * dias)) * 100) : null,
  };
}

// ── Ventas del hotel (RxDB) ─────────────────────────────────────────────────
// Ventas a crédito del hotel: las creadas en el periodo y la cartera (saldo por cobrar) actual.
function resumenCredito(hotel: ReturnType<typeof calcularVenta>[], inicio: Date, fin: Date) {
  const credito = hotel.filter((c) => c.venta.tipo === 'credito');
  const creadas = credito.filter((c) => { const t = new Date(c.venta.created_at); return t >= inicio && t <= fin; });
  const conSaldo = credito.filter((c) => c.saldo > 0.01);
  const antiguedad = conSaldo.reduce((m, c) => Math.max(m, dayjs().diff(dayjs(c.venta.created_at), 'day')), 0);
  return {
    creditoCantidad: creadas.length,
    creditoMonto: creadas.reduce((a, c) => a + c.montoTotal, 0),
    carteraMonto: conSaldo.reduce((a, c) => a + c.saldo, 0),
    carteraCantidad: conSaldo.length,
    carteraAntiguedad: antiguedad,
    carteraClientes: new Set(conSaldo.map((c) => c.venta.cliente_id || c.venta.cliente_nombre || c.venta.id)).size,
  };
}

function resumenVentas(ventas: any[], inicio: Date, fin: Date) {
  const hotel = ventas.filter((v) => v.origen === 'reserva_hotel').map(calcularVenta).filter((c) => !c.anulado);
  const metodos = new Map<string, number>();
  let cobrado = 0;
  for (const c of hotel) {
    for (const m of c.movimientos) {
      if (m.tipo !== 'pago' || m.anulado) continue;
      const t = new Date(m.fecha);
      if (t < inicio || t > fin) continue;
      const monto = Number(m.monto) || 0;
      cobrado += monto;
      metodos.set(m.metodo_pago || 'otros', (metodos.get(m.metodo_pago || 'otros') || 0) + monto);
    }
  }
  return {
    cobrado,
    metodos: [...metodos.entries()].map(([metodo, total]) => ({ metodo, total })).sort((a, b) => b.total - a.total),
    pendiente: hotel.reduce((a, c) => a + Math.max(0, c.saldo), 0),
    conSaldo: hotel.filter((c) => c.saldo > 0.01).length,
    sinFactura: hotel.filter((c) => !c.facturado && c.montoTotal > 0.01).length,
    ...resumenCredito(hotel, inicio, fin),
  };
}

const ventasChartConfig = {
  monto: { label: 'Reservado ($)', color: 'var(--info)' },
  anterior: { label: 'Periodo anterior ($)', color: 'var(--muted-foreground)' },
} satisfies ChartConfig;

const ocupacionChartConfig = {
  ocupacion: { label: 'Ocupación (%)', color: 'var(--info)' },
} satisfies ChartConfig;

/** Ocupación de cada noche del periodo: reservas vigentes que duermen esa noche entre las habitaciones activas. */
function ocupacionPorDia(rs: ReservaHotel[], inicio: Date, fin: Date, unidades: number) {
  const dias = Math.max(1, dayjs(fin).startOf('day').diff(dayjs(inicio).startOf('day'), 'day') + 1);
  const vigentes = rs.filter((r) => r.estado !== 'cancelada');
  return Array.from({ length: dias }, (_, i) => {
    const d = dayjs(inicio).startOf('day').add(i, 'day');
    const ocupadas = vigentes.filter((r) => !d.isBefore(dayjs(r.llegada), 'day') && d.isBefore(dayjs(r.salida), 'day')).length;
    return { fecha: d.format(dias > 10 ? 'DD/MM' : 'ddd DD'), ocupadas, ocupacion: unidades > 0 ? Math.min(100, Math.round((ocupadas / unidades) * 100)) : 0 };
  });
}

const cobrosChartConfig = {
  monto: { label: 'Cobrado ($)', color: 'var(--success)' },
  anterior: { label: 'Periodo anterior ($)', color: 'var(--muted-foreground)' },
} satisfies ChartConfig;

/** Valor por día (o por hora si el periodo es un solo día), con lo de la misma posición del periodo anterior. */
function serieTemporal(pagos: Array<{ t: Date; monto: number }>, inicio: Date, fin: Date, inicioAnt: Date, finAnt: Date) {
  const dias = Math.max(1, dayjs(fin).startOf('day').diff(dayjs(inicio).startOf('day'), 'day') + 1);
  const enRango = (t: Date, a: Date, b: Date) => t >= a && t <= b;
  if (dias === 1) {
    const act = new Array(24).fill(0), ant = new Array(24).fill(0);
    pagos.forEach(({ t, monto }) => { if (enRango(t, inicio, fin)) act[t.getHours()] += monto; else if (enRango(t, inicioAnt, finAnt)) ant[t.getHours()] += monto; });
    return act.map((monto, h) => ({ fecha: `${String(h).padStart(2, '0')}:00`, monto, anterior: ant[h] }));
  }
  const clave = (d: Date | dayjs.Dayjs) => dayjs(d).format('YYYY-MM-DD');
  const act = new Map<string, number>(), ant = new Map<string, number>();
  for (let i = 0; i < dias; i++) { act.set(clave(dayjs(inicio).add(i, 'day')), 0); ant.set(clave(dayjs(inicioAnt).add(i, 'day')), 0); }
  pagos.forEach(({ t, monto }) => {
    if (enRango(t, inicio, fin)) act.set(clave(t), (act.get(clave(t)) || 0) + monto);
    else if (enRango(t, inicioAnt, finAnt)) ant.set(clave(t), (ant.get(clave(t)) || 0) + monto);
  });
  const clavesAnt = [...ant.keys()];
  return [...act.entries()].map(([fecha, monto], i) => ({ fecha, monto, anterior: ant.get(clavesAnt[i]) || 0 }));
}

/** Pagos registrados en las ventas del hotel (sin anuladas). */
function pagosHotel(ventas: any[]) {
  const r: Array<{ t: Date; monto: number }> = [];
  ventas.filter((v) => v.origen === 'reserva_hotel').map(calcularVenta).filter((c) => !c.anulado).forEach((c) => {
    c.movimientos.forEach((m) => { if (m.tipo === 'pago' && !m.anulado) r.push({ t: new Date(m.fecha), monto: Number(m.monto) || 0 }); });
  });
  return r;
}

const TITULO_METODO: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otros: 'Otros' };

function Tarjeta({ label, description, value, d, icon, invertir }: { label: string; description: string; value: string; d?: number | null; icon: React.ReactNode; invertir?: boolean }) {
  const bueno = d == null ? true : invertir ? d <= 0 : d >= 0;
  return (
    <Card>
      <CardContent className="flex flex-col justify-between gap-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-redonda t-cifra text-foreground">{value}</span>
            <span className="t-etiqueta text-muted-foreground">{label}</span>
            <span className="t-meta text-muted-foreground leading-snug">{description}</span>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-muted text-muted-foreground">{icon}</div>
        </div>
        {d != null && (
          <Badge variant="secondary" className={cn('w-fit t-dato', bueno ? 'bg-success-soft text-success-foreground' : 'bg-destructive-soft text-destructive')}>
            {(d ?? 0) >= 0 ? '↑' : '↓'} {Math.abs(d).toFixed(1)}%
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

/** Tarjeta de detalle: varias cifras secundarias en filas, con su variación si la hay. */
function Detalle({ titulo, icon, filas }: { titulo: string; icon: React.ReactNode; filas: Array<{ label: string; valor: string; d?: number | null; invertir?: boolean }> }) {
  return (
    <Card>
      <CardHeader>
        <h3 className="font-redonda t-titulo text-foreground flex items-center gap-2"><span className="text-muted-foreground">{icon}</span>{titulo}</h3>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {filas.map((f) => {
          const bueno = f.d == null ? true : f.invertir ? f.d <= 0 : f.d >= 0;
          return (
            <div key={f.label} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <span className="t-cuerpo text-muted-foreground">{f.label}</span>
              <span className="flex items-center gap-2 shrink-0">
                {f.d != null && <span className={cn('t-dato tabular-nums', bueno ? 'text-success-foreground' : 'text-destructive')}>{f.d >= 0 ? '↑' : '↓'} {Math.abs(f.d).toFixed(0)}%</span>}
                <span className="t-cuerpo-fuerte text-foreground tabular-nums">{f.valor}</span>
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-redonda t-titulo text-secondary-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

const delta = (a: number, b: number) => b === 0 ? (a === 0 ? null : 100) : ((a - b) / b) * 100;

function Barra({ n, nombre, detalle, valor, pct }: { n: number; nombre: string; detalle: string; valor: string; pct: number }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className={cn('shrink-0 h-6 min-w-8 px-2 rounded-full inline-flex items-center justify-center t-dato tabular-nums', n === 1 ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>#{n}</span>
          <div className="min-w-0 flex-1">
            <p className="t-cuerpo-fuerte text-foreground truncate">{nombre}</p>
            <p className="t-meta text-muted-foreground">{detalle}</p>
          </div>
        </div>
        <span className="t-cuerpo-fuerte text-foreground shrink-0">{valor}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', n === 1 ? 'bg-info' : 'bg-info/50')} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

/** Métricas del hotel: productos y extras añadidos a las reservas (leídos de Supabase, no están en RxDB). */
export function MetricasHotel({ inicio, fin, inicioAnterior, finAnterior, menuItems, categorias, ventas }: Props) {
  const [actual, setActual] = useState<ExtraConReserva[] | null>(null);
  const [anterior, setAnterior] = useState<ExtraConReserva[]>([]);
  const [error, setError] = useState('');
  const [reservas, setReservas] = useState<ReservaHotel[]>([]);
  const [reservasAnt, setReservasAnt] = useState<ReservaHotel[]>([]);
  const [unidades, setUnidades] = useState(0);
  const [comparar, setComparar] = useState(true);
  const [ordenTop, setOrdenTop] = useState<OrdenTop>('monto');
  const [creadas, setCreadas] = useState<Array<{ creada: string; monto: number }>>([]);

  useEffect(() => {
    let vivo = true;
    setActual(null); setError('');
    Promise.all([
      listarExtrasHotel(inicio.toISOString(), fin.toISOString()),
      listarExtrasHotel(inicioAnterior.toISOString(), finAnterior.toISOString()),
      listarReservasHotel(dia(inicio), dia(fin)),
      listarReservasHotel(dia(inicioAnterior), dia(finAnterior)),
      listarHabitaciones(),
      listarReservasCreadasHotel(inicioAnterior.toISOString(), fin.toISOString()),
    ]).then(([a, p, r, rp, hab, cr]) => { if (vivo) { setCreadas(cr); setActual(a); setAnterior(p); setReservas(r); setReservasAnt(rp); setUnidades(hab.filter((h) => h.activo).length); } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron cargar las métricas del hotel'); });
    return () => { vivo = false; };
  }, [inicio, fin, inicioAnterior, finAnterior]);

  const menuPorId = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems]);
  const catPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre as string])), [categorias]);
  const act = useMemo(() => agrupar(actual ?? [], menuPorId, catPorId), [actual, menuPorId, catPorId]);
  const ant = useMemo(() => agrupar(anterior, menuPorId, catPorId), [anterior, menuPorId, catPorId]);

  const topProductos = useMemo(() => [...act.lineas].sort((a, b) => ordenTop === 'monto' ? b.total - a.total || b.cantidad - a.cantidad : b.cantidad - a.cantidad || b.total - a.total).slice(0, 8), [act, ordenTop]);
  const unidadesLineas = act.lineas.reduce((a, l) => a + l.cantidad, 0);
  const porCategoria = useMemo(() => {
    const m = new Map<string, { nombre: string; total: number; cantidad: number }>();
    act.lineas.forEach((l) => { const c = m.get(l.categoria) ?? { nombre: l.categoria, total: 0, cantidad: 0 }; c.total += l.total; c.cantidad += l.cantidad; m.set(l.categoria, c); });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [act]);

  const serie = useMemo(() => serieTemporal(creadas.map((c) => ({ t: new Date(c.creada), monto: c.monto })), inicio, fin, inicioAnterior, finAnterior), [creadas, inicio, fin, inicioAnterior, finAnterior]);
  const serieCobros = useMemo(() => serieTemporal(pagosHotel(ventas), inicio, fin, inicioAnterior, finAnterior), [ventas, inicio, fin, inicioAnterior, finAnterior]);
  const totalReservado = useMemo(() => serie.reduce((a, p) => a + p.monto, 0), [serie]);

  const ocupacionDias = useMemo(() => ocupacionPorDia(reservas, inicio, fin, unidades), [reservas, inicio, fin, unidades]);

  if (error) return <div className="flex-1 flex items-center justify-center t-meta text-destructive p-6">{error}</div>;
  if (actual === null) return <div className="flex-1 flex items-center justify-center t-meta text-muted-foreground p-6">Cargando métricas del hotel…</div>;

  const rAct = resumenReservas(reservas, inicio, fin, unidades);
  const rAnt = resumenReservas(reservasAnt, inicioAnterior, finAnterior, unidades);
  const vAct = resumenVentas(ventas, inicio, fin);
  const vAnt = resumenVentas(ventas, inicioAnterior, finAnterior);
  const picoOcupacion = ocupacionDias.reduce((m, d) => Math.max(m, d.ocupacion), 0);
  const diaPico = ocupacionDias.find((d) => d.ocupacion === picoOcupacion);
  const promedioOcupacion = ocupacionDias.length ? Math.round(ocupacionDias.reduce((a, d) => a + d.ocupacion, 0) / ocupacionDias.length) : 0;
  const totalMetodos = vAct.metodos.reduce((a, m) => a + m.total, 0);

  return (
    <main className="flex-1 overflow-y-auto p-6 w-full flex flex-col gap-6">
      <Seccion titulo="Reservas y ventas">
        {/* Cuatro cifras principales arriba; el resto en tres tarjetas de detalle, para no llenar la pantalla de tarjetas iguales. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Tarjeta label="Ocupación" description={unidades > 0 ? `Sobre ${unidades} habitaciones activas.` : 'Sin habitaciones registradas.'} value={rAct.ocupacion == null ? 'N/D' : `${rAct.ocupacion.toFixed(0)}%`} d={rAct.ocupacion != null && rAnt.ocupacion != null ? delta(rAct.ocupacion, rAnt.ocupacion) : null} icon={<Percent size={20} weight="bold" />} />
          <Tarjeta label="Tarifa por noche" description={`Estadías que llegan: ${money(rAct.tarifa)}.`} value={money(rAct.adr)} d={delta(rAct.adr, rAnt.adr)} icon={<Bed size={20} weight="bold" />} />
          <Tarjeta label="Cobrado" description="Pagos registrados en el periodo." value={money(vAct.cobrado)} d={delta(vAct.cobrado, vAnt.cobrado)} icon={<Wallet size={20} weight="bold" />} />
          <Tarjeta label="Saldo pendiente" description={`${vAct.conSaldo} ${vAct.conSaldo === 1 ? 'venta con saldo' : 'ventas con saldo'}; total actual.`} value={money(vAct.pendiente)} icon={<Warning size={20} weight="bold" />} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Detalle titulo="Reservas" icon={<CalendarCheck size={18} weight="bold" />} filas={[
            { label: 'Llegadas', valor: String(rAct.llegadas), d: delta(rAct.llegadas, rAnt.llegadas) },
            { label: 'Noches vendidas', valor: String(rAct.noches), d: delta(rAct.noches, rAnt.noches) },
            { label: 'Canceladas', valor: String(rAct.canceladas), d: delta(rAct.canceladas, rAnt.canceladas), invertir: true },
          ]} />
          <Detalle titulo="Cobranza" icon={<Receipt size={18} weight="bold" />} filas={[
            { label: 'Ventas con saldo', valor: String(vAct.conSaldo) },
            { label: 'Sin factura', valor: String(vAct.sinFactura) },
          ]} />
          <Detalle titulo="Crédito" icon={<CreditCard size={18} weight="bold" />} filas={[
            { label: `Ventas a crédito (${vAct.creditoCantidad})`, valor: money(vAct.creditoMonto), d: delta(vAct.creditoMonto, vAnt.creditoMonto) },
            { label: `Cartera por cobrar (${vAct.carteraCantidad})`, valor: money(vAct.carteraMonto) },
            { label: 'Crédito más antiguo', valor: vAct.carteraCantidad > 0 ? `${vAct.carteraAntiguedad} d` : '—' },
            { label: 'Clientes con deuda', valor: String(vAct.carteraClientes) },
          ]} />
        </div>
        <Card>
          <CardHeader>
            <h3 className="font-redonda t-titulo text-foreground">Ocupación por día</h3>
            <p className="t-meta text-muted-foreground">Habitaciones ocupadas cada noche sobre las {unidades} activas.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {unidades === 0 || ocupacionDias.every((d) => d.ocupadas === 0) ? (
              <div className="h-[230px] w-full flex items-center justify-center t-meta text-muted-foreground">{unidades === 0 ? 'No hay habitaciones activas registradas.' : 'Sin noches ocupadas en el periodo.'}</div>
            ) : (
              <>
                <ChartContainer config={ocupacionChartConfig} className="h-[230px] w-full">
                  <BarChart data={ocupacionDias}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="fecha" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value, _n, item) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{item?.payload?.ocupadas} de {unidades} hab.</span>
                        <span className="font-mono font-bold text-foreground tabular-nums">{value}%</span>
                      </div>
                    )} />} />
                    <Bar dataKey="ocupacion" fill="var(--color-ocupacion)" radius={4}>
                      {ocupacionDias.map((d) => <Cell key={d.fecha} fillOpacity={d.ocupacion === picoOcupacion ? 1 : 0.5} />)}
                    </Bar>
                  </BarChart>
                </ChartContainer>
                <div className="flex items-center justify-between">
                  <span className="t-cuerpo-fuerte text-foreground">Promedio: {promedioOcupacion}%</span>
                  <span className="t-cuerpo text-muted-foreground">Día más alto: {diaPico?.fecha} · {picoOcupacion}%</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-redonda t-titulo text-foreground">Evolución de ventas</h3>
                <p className="t-meta text-muted-foreground">Valor de las reservas creadas cada día (tarifa de la estadía), por fecha de reserva.</p>
              </div>
              <button type="button" aria-pressed={comparar} onClick={() => setComparar((v) => !v)}
                className={cn('h-8 pointer-coarse:h-11 px-3 rounded-full border t-dato whitespace-nowrap cursor-pointer transition-colors shrink-0',
                  comparar ? 'bg-muted text-foreground border-border' : 'bg-card text-muted-foreground border-border hover:text-foreground')}>
                {comparar ? 'Comparando con periodo anterior' : 'Comparar con periodo anterior'}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {totalReservado === 0 ? (
              <div className="h-[230px] w-full flex items-center justify-center t-meta text-muted-foreground">Sin reservas creadas en el periodo.</div>
            ) : (
              <ChartContainer config={ventasChartConfig} className="h-[230px] w-full">
                <AreaChart data={serie}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="fecha" tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">{name === 'anterior' ? 'Periodo anterior' : 'Este periodo'}</span>
                      <span className="font-mono font-bold text-foreground tabular-nums">{money(Number(value))}</span>
                    </div>
                  )} />} />
                  {comparar && <Area dataKey="anterior" type="monotone" fill="none" stroke="var(--color-anterior)" strokeWidth={2} strokeDasharray="5 4" dot={false} />}
                  <Area dataKey="monto" type="monotone" fill="var(--color-monto)" fillOpacity={0.2} stroke="var(--color-monto)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-redonda t-titulo text-foreground">Evolución de cobros</h3>
                <p className="t-meta text-muted-foreground">Dinero cobrado cada día en las ventas del hotel, por fecha de pago.</p>
              </div>
              <button type="button" aria-pressed={comparar} onClick={() => setComparar((v) => !v)}
                className={cn('h-8 pointer-coarse:h-11 px-3 rounded-full border t-dato whitespace-nowrap cursor-pointer transition-colors shrink-0',
                  comparar ? 'bg-muted text-foreground border-border' : 'bg-card text-muted-foreground border-border hover:text-foreground')}>
                {comparar ? 'Comparando con periodo anterior' : 'Comparar con periodo anterior'}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {vAct.cobrado === 0 ? (
              <div className="h-[230px] w-full flex items-center justify-center t-meta text-muted-foreground">Sin cobros del hotel en el periodo.</div>
            ) : (
              <ChartContainer config={cobrosChartConfig} className="h-[230px] w-full">
                <AreaChart data={serieCobros}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="fecha" tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">{name === 'anterior' ? 'Periodo anterior' : 'Este periodo'}</span>
                      <span className="font-mono font-bold text-foreground tabular-nums">{money(Number(value))}</span>
                    </div>
                  )} />} />
                  {comparar && <Area dataKey="anterior" type="monotone" fill="none" stroke="var(--color-anterior)" strokeWidth={2} strokeDasharray="5 4" dot={false} />}
                  <Area dataKey="monto" type="monotone" fill="var(--color-monto)" fillOpacity={0.2} stroke="var(--color-monto)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        {vAct.metodos.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="font-redonda t-titulo text-foreground">Cobrado por método</h3>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {vAct.metodos.map((m, i) => (
                <Barra key={m.metodo} n={i + 1} nombre={TITULO_METODO[m.metodo] ?? m.metodo} detalle={`${totalMetodos > 0 ? ((m.total / totalMetodos) * 100).toFixed(0) : 0}% de lo cobrado`} valor={money(m.total)} pct={totalMetodos > 0 ? (m.total / totalMetodos) * 100 : 0} />
              ))}
            </CardContent>
          </Card>
        )}
      </Seccion>

      <Seccion titulo="Productos y extras">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Tarjeta label="Extras vendidos" description="Productos y cargos añadidos a reservas." value={money(act.total)} d={delta(act.total, ant.total)} icon={<Coin size={20} weight="bold" />} />
          <Tarjeta label="Unidades" description="Productos y cargos en el periodo." value={String(act.unidades)} d={delta(act.unidades, ant.unidades)} icon={<Package size={20} weight="bold" />} />
          <Tarjeta label="Reservas con extras" description="Reservas con al menos un extra." value={String(act.reservas)} d={delta(act.reservas, ant.reservas)} icon={<Bed size={20} weight="bold" />} />
          <Tarjeta label="Extra por reserva" description="Promedio de extras por reserva." value={money(act.reservas ? act.total / act.reservas : 0)} d={delta(act.reservas ? act.total / act.reservas : 0, ant.reservas ? ant.total / ant.reservas : 0)} icon={<Receipt size={20} weight="bold" />} />
        </div>

      {act.lineas.length === 0 ? (
        <p className="t-meta text-muted-foreground text-center py-12">Sin extras añadidos a reservas en el periodo.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h3 className="font-redonda t-titulo text-foreground">Top productos y extras</h3>
              <p className="t-meta text-muted-foreground">{ordenTop === 'monto' ? 'Lo que más dinero deja en reservas.' : 'Lo más añadido a reservas, por unidades.'}</p>
              <OrdenTopToggle valor={ordenTop} onChange={setOrdenTop} className="mt-2 w-fit" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {topProductos.map((l, i) => ordenTop === 'monto'
                ? <Barra key={l.nombre} n={i + 1} nombre={l.nombre} detalle={`${l.cantidad} ${l.cantidad === 1 ? 'unidad' : 'unidades'} · ${l.categoria}`} valor={money(l.total)} pct={act.total > 0 ? (l.total / act.total) * 100 : 0} />
                : <Barra key={l.nombre} n={i + 1} nombre={l.nombre} detalle={`${money(l.total)} · ${l.categoria}`} valor={`${l.cantidad} u.`} pct={unidadesLineas > 0 ? (l.cantidad / unidadesLineas) * 100 : 0} />)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h3 className="font-redonda t-titulo text-foreground">Por categoría</h3>
              <p className="t-meta text-muted-foreground">Cómo se reparten los extras del hotel.</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {porCategoria.map((c, i) => (
                <Barra key={c.nombre} n={i + 1} nombre={c.nombre} detalle={`${c.cantidad} ${c.cantidad === 1 ? 'unidad' : 'unidades'}`} valor={money(c.total)} pct={act.total > 0 ? (c.total / act.total) * 100 : 0} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
      </Seccion>
    </main>
  );
}
