import { useEffect, useMemo, useState } from 'react';
import { Box, Badge, Button, Card, Flex, Grid, Group, Modal, Paper, Progress, Stack, Text, ThemeIcon, Tooltip, UnstyledButton, ActionIcon } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { AreaChart, BarChart } from '@mantine/charts';
import { Calendar, Coin, Receipt, Warning, Tag } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { PageHeader } from '../components/Common/PageHeader';
import { initVerticalRxDb } from '../db/rxdb';
import { useRxClientes } from '../hooks/useRxClientes';
import '@mantine/charts/styles.css';

type DatesRange = [Date | null, Date | null];

type SalePoint = { fecha: string; monto: number };
type HourPoint = { hora: string; ordenes: number; ventas: number };
type TopItemPoint = { nombre: string; cantidad: number; total: number; margen?: number | null };
type CategoryPoint = { nombre: string; monto: number };
type WeekdayPoint = { dia: string; promedio: number; total: number };
type CardMetric = { label: string; value: string; delta?: string; positive?: boolean; icon: React.ReactNode };

function money(value: number) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

function statDelta(current: number, previous: number, prefix = '') {
  if (previous === 0) {
    if (current === 0) return `${prefix}0%`;
    return `${prefix}+100%`;
  }
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${prefix}${sign}${pct.toFixed(1)}%`;
}

export default function Metricas() {
  const [periodo, setPeriodo] = useState<'hoy' | '7d' | '30d' | 'mes' | 'custom'>('7d');
  const [calendarOpened, { open: openCalendar, close: closeCalendar }] = useDisclosure(false);
  const [customRange, setCustomRange] = useState<DatesRange>([null, null]);
  const [chartsReady, setChartsReady] = useState(false);

  const [comandas, setComandas] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [comandaItems, setComandaItems] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const { clientes } = useRxClientes();

  useEffect(() => {
    let alive = true;
    const subs: Array<{ unsubscribe: () => void }> = [];

    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';

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
    })().catch((err) => console.error('Error cargando RxDB en métricas:', err));

    return () => {
      alive = false;
      subs.forEach((sub) => sub.unsubscribe());
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setChartsReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const datesLimit = useMemo(() => {
    const today = new Date();
    let inicio = startOfDay(today);
    let fin = endOfDay(today);

    if (periodo === 'hoy') {
      inicio = startOfDay(today);
      fin = endOfDay(today);
    } else if (periodo === '7d') {
      inicio = startOfDay(shiftDays(today, -6));
    } else if (periodo === '30d') {
      inicio = startOfDay(shiftDays(today, -29));
    } else if (periodo === 'mes') {
      inicio = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
    } else if (periodo === 'custom' && customRange[0]) {
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

  const activeCompletadas = useMemo(() => activeComandas.filter((c) => c.estado === 'cerrado' || c.estado === 'facturado'), [activeComandas]);
  const previousCompletadas = useMemo(() => previousComandas.filter((c) => c.estado === 'cerrado' || c.estado === 'facturado'), [previousComandas]);

  const activeAnuladas = useMemo(() => activeComandas.filter((c) => c.estado === 'anulada'), [activeComandas]);
  const previousAnuladas = useMemo(() => previousComandas.filter((c) => c.estado === 'anulada'), [previousComandas]);

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
      hora: `${String(hora).padStart(2, '0')}:00`,
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
      const categoryId = categoryMap.get(item.item_id) || 'otros';
      const categoryName = categoryNames.get(categoryId) || 'Otros';
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
      return [...leading, { nombre: 'Otros', monto: remainder }];
    }

    return leading.length > 0 ? leading : sorted;
  }, [activeCompletadas, comandaItems, categorias, menuItems, ventasActuales]);

  const chartData = useMemo<SalePoint[]>(() => {
    const map = new Map<string, number>();
    const days = daysBetween(datesLimit.inicio, datesLimit.fin);
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
      return [...leading, { nombre: 'Otros', cantidad: 0, total: remainder, margen: null }];
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
      const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      return {
        dia: labels[(weekday + 6) % 7],
        promedio: bucket.total / countDays,
        total: bucket.total,
      };
    });
  }, [datesLimit, pagos]);
  const diaMasRentable = useMemo(() => {
    return ventasPorDiaSemana.reduce((best, current) => (current.promedio > best.promedio ? current : best), ventasPorDiaSemana[0] || { dia: 'N/D', promedio: 0, total: 0 });
  }, [ventasPorDiaSemana]);

  const cobradasCount = useMemo(
    () => activeComandas.filter((c) => c.estado === 'cobradas').length,
    [activeComandas]
  );
  const conciliadasCount = useMemo(
    () => activeComandas.filter((c) => c.estado === 'conciliadas').length,
    [activeComandas]
  );

  const clientesFidelizacion = useMemo(() => {
    const frecuentes = clientes
      .map((c) => {
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
    { label: 'Ventas totales', value: money(ventasActuales), delta: statDelta(ventasActuales, ventasAnteriores), positive: ventasActuales >= ventasAnteriores, icon: <Coin size={20} weight="fill" /> },
    { label: 'Ticket promedio', value: money(ticketActual), delta: statDelta(ticketActual, ticketAnterior), positive: ticketActual >= ticketAnterior, icon: <Tag size={20} weight="fill" /> },
    { label: 'Órdenes completadas', value: String(activeCompletadas.length), delta: statDelta(activeCompletadas.length, previousCompletadas.length), positive: activeCompletadas.length >= previousCompletadas.length, icon: <Receipt size={20} weight="fill" /> },
    { label: 'Órdenes anuladas', value: String(activeAnuladas.length), delta: statDelta(activeAnuladas.length, previousAnuladas.length), positive: activeAnuladas.length <= previousAnuladas.length, icon: <Warning size={20} weight="fill" /> },
  ];

  const peakHour = topHoras[0]?.hora || 'N/D';
  const peakOrders = topHoras[0]?.ordenes || 0;
  const peakSales = topHoras[0]?.ventas || 0;

  return (
    <Flex h="100%" w="100%" direction="column" bg="var(--pos-bg)">
      <PageHeader>
        <Group gap="xs" wrap="nowrap" align="center">
          {periodo === 'custom' && customRange[0] && (
            <Badge
              variant="light"
              color="myColor"
              size="lg"
              radius="md"
              style={{ height: 36, fontSize: '13px', border: '1px solid var(--ui-primary-soft)', cursor: 'pointer' }}
              onClick={openCalendar}
            >
              {dayjs(customRange[0]).format('DD/MM')}
              {customRange[1] && ` - ${dayjs(customRange[1]).format('DD/MM')}`}
            </Badge>
          )}

          {([
            { value: 'hoy', label: 'Hoy' },
            { value: '7d', label: '7d' },
            { value: '30d', label: '30d' },
            { value: 'mes', label: 'Este Mes' },
            { value: 'custom', label: 'Personalizado' },
          ] as const).map(({ value, label }) => {
            const active = periodo === value;
            return (
              <UnstyledButton
                key={value}
                onClick={() => {
                  setPeriodo(value);
                  if (value === 'custom') openCalendar();
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--mantine-radius-xl)',
                  backgroundColor: active ? 'var(--ui-primary)' : 'var(--pos-bg)',
                  color: active ? 'white' : 'var(--pos-text-sub)',
                  fontWeight: active ? 700 : 600,
                  fontSize: 'var(--mantine-font-size-sm)',
                  whiteSpace: 'nowrap',
                  border: `1px solid ${active ? 'var(--ui-primary)' : 'var(--pos-border)'}`,
                }}
              >
                {label}
              </UnstyledButton>
            );
          })}

          {periodo === 'custom' && (
            <Tooltip label="Cambiar rango de fechas" withArrow radius="md">
              <ActionIcon variant="light" color="myColor" size={36} radius="md" onClick={openCalendar}>
                <Calendar size={18} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </PageHeader>

      <Box flex={1} style={{ overflowY: 'auto' }} p="xl">
        <Stack gap="lg">
          <Grid>
            {baseMetricCards.map((card) => (
              <Grid.Col key={card.label} span={{ base: 12, sm: 6, md: 3 }}>
                <Card withBorder radius="md" p="md" style={{ minHeight: 128, background: 'var(--mantine-color-white)' }}>
                  <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                    <Stack gap={5} style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={900} size="xl" style={{ fontSize: 28, lineHeight: 1, letterSpacing: '-0.03em' }}>
                        {card.value}
                      </Text>
                      <Text size="xs" fw={800} tt="uppercase" c="dimmed" truncate>
                        {card.label}
                      </Text>
                      <Text size="xs" c="dimmed" fw={500} lh={1.35}>
                        {card.label === 'Ventas totales' && 'Facturación acumulada en el periodo.'}
                        {card.label === 'Ticket promedio' && 'Promedio por orden completada.'}
                        {card.label === 'Órdenes completadas' && 'Órdenes cerradas o facturadas.'}
                        {card.label === 'Órdenes anuladas' && 'Órdenes canceladas dentro del periodo.'}
                      </Text>
                      {card.delta && (
                        <Badge variant="light" color={card.positive ? 'teal' : 'red'} radius="sm" size="sm" mt={4}>
                          {card.positive ? '↑' : '↓'} {card.delta.replace(/^[+-]/, '')}
                        </Badge>
                      )}
                    </Stack>
                    <ThemeIcon variant="light" color={card.positive ? 'teal' : 'red'} size="lg" radius="md">
                      {card.icon}
                    </ThemeIcon>
                  </Group>
                </Card>
              </Grid.Col>
            ))}
            <Grid.Col span={{ base: 12 }} style={{ minWidth: 0 }}>
              <Paper withBorder p="lg" radius="md" style={{ minHeight: 340, width: '100%', minWidth: 0 }}>
                <Stack gap="xs" mb="lg">
                  <Text fw={800} size="md">Evolución de ventas</Text>
                  <Text size="xs" c="dimmed">Comparación de facturación diaria dentro del periodo seleccionado.</Text>
                </Stack>
                <Box style={{ width: '100%', height: 230, minWidth: 0 }}>
                  {!chartsReady ? null : (
                  <AreaChart
                    style={{ width: '100%', height: '100%' }}
                    h={230}
                    data={chartData}
                    dataKey="fecha"
                    series={[{ name: 'monto', color: 'blue.6', label: 'Ventas ($)' }]}
                    curveType="monotone"
                    tickLine="none"
                    gridAxis="x"
                    valueFormatter={(value) => money(value)}
                  />
                  )}
                </Box>
              </Paper>
            </Grid.Col>
          </Grid>

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }} style={{ minWidth: 0 }}>
              <Paper withBorder p="lg" radius="md" style={{ minHeight: 340, width: '100%', minWidth: 0 }}>
                <Stack gap="xs" mb="lg">
                  <Text fw={800} size="md">Ventas por hora y horas pico</Text>
                  <Text size="xs" c="dimmed">La franja con más pedidos del día marca la hora pico operativa.</Text>
                </Stack>
                <Box style={{ width: '100%', height: 230, minWidth: 0 }}>
                  {!chartsReady ? null : (
                  <BarChart
                    style={{ width: '100%', height: '100%' }}
                    h={230}
                    data={ventasPorHora}
                    dataKey="hora"
                    series={[{ name: 'ordenes', color: 'indigo.6', label: 'Órdenes' }]}
                    tickLine="none"
                    gridAxis="x"
                    withLegend={false}
                  />
                  )}
                </Box>
                <Group mt="md" justify="space-between">
                  <Text size="sm" fw={700}>Hora pico: {peakHour}</Text>
                  <Text size="sm" c="dimmed">{peakOrders} órdenes, {money(peakSales)}</Text>
                </Group>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }} style={{ minWidth: 0 }}>
              <Paper withBorder p="lg" radius="md" style={{ minHeight: 340, width: '100%', minWidth: 0 }}>
                <Stack gap="xs" mb="lg">
                  <Text fw={800} size="md">Rentabilidad promedio por día de semana</Text>
                  <Text size="xs" c="dimmed">Usa ventas promedio por día para detectar el día más fuerte del periodo.</Text>
                </Stack>
                <Box style={{ width: '100%', height: 230, minWidth: 0 }}>
                  {!chartsReady ? null : (
                  <BarChart
                    style={{ width: '100%', height: '100%' }}
                    h={230}
                    data={ventasPorDiaSemana}
                    dataKey="dia"
                    series={[{ name: 'promedio', color: 'teal.6', label: 'Promedio $' }]}
                    tickLine="none"
                    gridAxis="x"
                    withLegend={false}
                    valueFormatter={(value) => money(value)}
                  />
                  )}
                </Box>
                <Text size="sm" fw={700} ta="center" mt="sm">
                  Día más rentable: {diaMasRentable.dia} - {money(diaMasRentable.promedio)}
                </Text>
              </Paper>
            </Grid.Col>
          </Grid>

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }} style={{ minWidth: 0 }}>
              <Paper withBorder p="lg" radius="md" style={{ minHeight: 340, width: '100%', minWidth: 0 }}>
                <Stack gap="xs" mb="lg">
                  <Text fw={800} size="md">Top productos vendidos</Text>
                  <Text size="xs" c="dimmed">Productos con mayor volumen de venta por unidades.</Text>
                </Stack>
                <Stack gap="md">
                  {topProductsByQty.map((item, index) => {
                    const pct = ventasActuales > 0 ? (item.total / ventasActuales) * 100 : 0;
                    return (
                      <Box key={item.nombre}>
                        <Group justify="space-between" align="flex-start" mb={6} wrap="nowrap">
                          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                            <Badge variant="light" radius="sm" color={index === 0 ? 'teal' : 'gray'}>
                              #{index + 1}
                            </Badge>
                            <Box style={{ minWidth: 0, flex: 1 }}>
                              <Text fw={700} size="sm" truncate>{item.nombre}</Text>
                              <Text size="xs" c="dimmed">{item.cantidad} unidades</Text>
                            </Box>
                          </Group>
                          <Stack gap={0} align="end" style={{ flexShrink: 0 }}>
                            <Text fw={800} size="sm">{money(item.total)}</Text>
                            <Text size="xs" c="dimmed">{pct.toFixed(0)}% de ventas</Text>
                          </Stack>
                        </Group>
                        <Progress value={Math.min(100, pct)} size="sm" radius="xl" color={index === 0 ? 'teal' : 'indigo'} />
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper withBorder p="lg" radius="md" style={{ minHeight: 340 }}>
                <Stack gap="xs" mb="lg">
                  <Text fw={800} size="md">Top categorías</Text>
                  <Text size="xs" c="dimmed">Distribución de facturación por categoría de producto.</Text>
                </Stack>
                <Stack gap="md">
                  {topCategorias.map((c, i) => {
                    const pct = ventasActuales > 0 ? (c.monto / ventasActuales) * 100 : 0;
                    return (
                      <Box key={c.nombre}>
                        <Group justify="space-between" align="flex-start" mb={6} wrap="nowrap">
                          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                            <Badge variant="light" radius="sm" color={i === 0 ? 'teal' : 'gray'}>
                              #{i + 1}
                            </Badge>
                            <Box style={{ minWidth: 0, flex: 1 }}>
                              <Text fw={700} size="sm" truncate>{c.nombre}</Text>
                              <Text size="xs" c="dimmed">{pct.toFixed(0)}% de ventas</Text>
                            </Box>
                          </Group>
                          <Stack gap={0} align="end" style={{ flexShrink: 0 }}>
                            <Text fw={800} size="sm">{money(c.monto)}</Text>
                            <Text size="xs" c="dimmed">{pct.toFixed(0)}% de ventas</Text>
                          </Stack>
                        </Group>
                        <Progress value={pct} size="sm" radius="xl" color={i === 0 ? 'teal' : 'gray'} />
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper withBorder p="lg" radius="md" style={{ minHeight: 340 }}>
                <Stack gap="xs" mb="lg">
                  <Text fw={800} size="md">Clientes más valiosos</Text>
                  <Text size="xs" c="dimmed">Basado en visitas y gasto acumulado.</Text>
                </Stack>
                <Stack gap="sm">
                  {clientesFidelizacion.map((client, index) => {
                    return (
                      <Box
                        key={client.nombre}
                        p="sm"
                        style={{
                          border: '1px solid var(--pos-border)',
                          borderRadius: 'var(--mantine-radius-md)',
                          background: 'var(--mantine-color-white)',
                        }}
                      >
                        <Group justify="space-between" align="flex-start" mb={6} wrap="nowrap">
                          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                            <Badge variant="light" radius="sm" color={index === 0 ? 'teal' : 'gray'}>
                              #{index + 1}
                            </Badge>
                            <Box style={{ minWidth: 0, flex: 1 }}>
                              <Text fw={700} size="sm" truncate>{client.nombre}</Text>
                              <Text size="xs" c="dimmed">{client.visitas} visitas</Text>
                            </Box>
                          </Group>
                          <Text fw={800} size="sm" c="var(--ui-primary)">{money(client.gasto)}</Text>
                        </Group>
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper withBorder p="lg" radius="md" style={{ minHeight: 340 }}>
                <Stack gap="xs" mb="lg">
                  <Text fw={800} size="md">Resumen de fidelización</Text>
                  <Text size="xs" c="dimmed">Clientes, recurrencia y consumo promedio.</Text>
                </Stack>
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text size="sm" fw={700}>Total clientes</Text>
                    <Text size="sm" fw={800}>{clientes.length}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" fw={700}>Clientes con consumo en el periodo</Text>
                    <Text size="sm" fw={800}>{clientesFidelizacion.length}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" fw={700}>Ticket promedio</Text>
                    <Text size="sm" fw={800}>{money(ticketActual)}</Text>
                  </Group>
                  <Box
                    p="sm"
                    style={{
                      border: '1px solid var(--pos-border)',
                      borderRadius: 'var(--mantine-radius-md)',
                      background: 'var(--mantine-color-gray-0)',
                    }}
                  >
                    <Stack gap={4}>
                      <Text size="sm" fw={800}>Órdenes cobradas vs conciliadas</Text>
                      <Group justify="space-between">
                        <Text size="sm" c="dimmed">Cobradas</Text>
                        <Text size="sm" fw={800}>{cobradasCount}</Text>
                      </Group>
                      <Group justify="space-between">
                        <Text size="sm" c="dimmed">Conciliadas</Text>
                        <Text size="sm" fw={800}>{conciliadasCount}</Text>
                      </Group>
                    </Stack>
                  </Box>
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>

        </Stack>
      </Box>

      <Modal
        opened={calendarOpened}
        onClose={closeCalendar}
        title={<Text fw={900} size="lg">Seleccionar rango de fechas</Text>}
        centered
        radius="lg"
        size="auto"
      >
        <Stack align="center" gap="md" p="xs">
          <DatePicker
            type="range"
            value={customRange}
            onChange={(val) => {
              setCustomRange([
                val[0] ? new Date(val[0]) : null,
                val[1] ? new Date(val[1]) : null,
              ]);
              if (val[0] && val[1]) closeCalendar();
            }}
          />
          <Button fullWidth color="myColor" radius="md" onClick={closeCalendar} disabled={!customRange[0]}>
            Aplicar rango
          </Button>
        </Stack>
      </Modal>
    </Flex>
  );
}
