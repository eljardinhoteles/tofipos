import { useMemo } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import {
  CurrencyDollar,
  CreditCard,
  Receipt,
  WarningCircle,
  Money,
  Bank,
  ArrowRight,
  Wallet,
  DotsThreeCircle,
  TrendUp,
  ArrowCounterClockwise,
  Table as TableIcon,
  ForkKnife,
  BedIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { VentaConMovimientos } from '../../hooks/useVentasConMovimientos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface DashboardControlDiaProps {
  date: string;
  items: VentaConMovimientos[];
  onSelectVenta: (id: string) => void;
}

// Fila de dato con etiqueta, línea punteada de relleno y valor — patrón de
// recibo/factura: la línea punteada conecta visualmente el label con su
// valor en vez de dejar un vacío horizontal enorme cuando la card es ancha
// y los textos son cortos (ambos quedarían pegados a extremos opuestos).
function FilaDato({ icon: Icon, label, value, valueClassName, indent, muted }: {
  icon?: typeof Money;
  label: string;
  value: string;
  valueClassName?: string;
  indent?: boolean;
  muted?: boolean;
}) {
  return (
    <TableRow className="border-none">
      <TableCell className={cn("p-0 py-1 w-0 whitespace-nowrap text-xs font-semibold text-muted-foreground", indent && "pl-6")}>
        <span className="flex items-center gap-1.5">
          {Icon && <Icon size={14} className={muted ? "opacity-70" : undefined} />}
          <span className={muted ? "text-[11px] font-medium" : undefined}>{label}</span>
        </span>
      </TableCell>
      <TableCell className="p-0 py-1">
        <div className="border-b border-dotted border-border mx-2 mb-[3px]" />
      </TableCell>
      <TableCell className={cn("p-0 py-1 w-0 whitespace-nowrap text-xs font-bold text-foreground text-right", muted && "text-[11px]")}>
        <span className={valueClassName}>{value}</span>
      </TableCell>
    </TableRow>
  );
}

interface GrupoOrigenMetrics {
  total: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  otros: number;
  redes: Record<string, number>;
  bancos: Record<string, number>;
}

// Sección de un origen dentro de la card unificada "Cobros por Origen":
// título + total arriba, y debajo cada método usado con sus redes/bancos
// anidados (indentados) cuando aplica — nunca lista un método en $0.
function SeccionOrigen({ icon: Icon, titulo, grupo }: {
  icon: typeof TableIcon;
  titulo: string;
  grupo: GrupoOrigenMetrics;
}) {
  return (
    <div className="flex flex-col py-3 first:pt-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="flex items-center gap-1.5 text-xs font-extrabold text-foreground whitespace-nowrap">
          <Icon size={14} className="text-primary" /> {titulo}
        </span>
        <div className="flex-1 border-b border-dotted border-border mb-[3px]" />
        <span className="text-xs font-black text-foreground whitespace-nowrap">${grupo.total.toFixed(2)}</span>
      </div>

      {grupo.total === 0 ? (
        <p className="text-[11px] font-medium text-muted-foreground">Sin cobros hoy.</p>
      ) : (
        <Table>
          <TableBody>
            {grupo.efectivo > 0 && <FilaDato icon={Money} label="Efectivo" value={`$${grupo.efectivo.toFixed(2)}`} />}

            {grupo.tarjeta > 0 && (
              <>
                <FilaDato icon={CreditCard} label="Tarjeta" value={`$${grupo.tarjeta.toFixed(2)}`} />
                {Object.entries(grupo.redes).map(([red, monto]) => (
                  <FilaDato key={red} label={red} value={`$${monto.toFixed(2)}`} indent muted />
                ))}
              </>
            )}

            {grupo.transferencia > 0 && (
              <>
                <FilaDato icon={Bank} label="Transferencia" value={`$${grupo.transferencia.toFixed(2)}`} />
                {Object.entries(grupo.bancos).map(([banco, monto]) => (
                  <FilaDato key={banco} label={banco} value={`$${monto.toFixed(2)}`} indent muted />
                ))}
              </>
            )}

            {grupo.otros > 0 && <FilaDato icon={DotsThreeCircle} label="Otros" value={`$${grupo.otros.toFixed(2)}`} />}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// Stat tile principal — mismo tamaño y forma para los 4 KPIs, el color
// distingue el significado (positivo/neutral/alerta) sin recargar cada card
// con un borde+fondo distinto como antes.
function StatTile({ icon: Icon, label, value, tone = 'neutral', sub }: {
  icon: typeof CurrencyDollar;
  label: string;
  value: string;
  tone?: 'positive' | 'info' | 'warning' | 'neutral';
  sub?: string;
}) {
  const toneClasses: Record<string, string> = {
    positive: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30',
    info: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
    warning: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
    neutral: 'text-muted-foreground bg-muted/50',
  };

  return (
    <Card size="sm" className="shadow-xs">
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">{label}</span>
          <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0", toneClasses[tone])}>
            <Icon size={12} weight="bold" />
          </div>
        </div>
        <span className="text-xl font-black text-foreground tracking-tight">{value}</span>
        {sub && <span className="text-[11px] font-medium text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  );
}

const MAX_PENDIENTES_VISIBLES = 6;

export function DashboardControlDia({ date, items, onSelectVenta }: DashboardControlDiaProps) {
  const metrics = useMemo(() => {
    const validItems = items.filter(i => !i.anulado);
    const anuladas = items.filter(i => i.anulado);

    let montoTotal = 0;
    let totalCobrado = 0;
    let totalReembolsado = 0;
    let saldoPendiente = 0;

    const ventasPendientes: VentaConMovimientos[] = [];
    let ventasCredito = 0;
    let ventasFacturadas = 0;

    const pagos = {
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
      otros: 0,
    };

    // Desglose jerárquico por origen: cada uno de los 4 orígenes reales
    // (mesa, reserva_restaurante, reserva_hotel, habitacion) tiene su total
    // cobrado y, dentro, el desglose por método con redes/bancos anidados.
    const crearGrupoOrigen = () => ({
      total: 0,
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
      otros: 0,
      redes: {} as Record<string, number>,
      bancos: {} as Record<string, number>,
    });
    const cobrosPorOrigen: Record<'mesa' | 'reserva_restaurante' | 'reserva_hotel' | 'habitacion', ReturnType<typeof crearGrupoOrigen>> = {
      mesa: crearGrupoOrigen(),
      reserva_restaurante: crearGrupoOrigen(),
      reserva_hotel: crearGrupoOrigen(),
      habitacion: crearGrupoOrigen(),
    };

    for (const item of validItems) {
      montoTotal += item.montoTotal;
      totalCobrado += item.totalPagado;
      totalReembolsado += item.totalReembolsado;

      if (item.saldo > 0.01) {
        saldoPendiente += item.saldo;
        ventasPendientes.push(item);
      }

      if (item.venta.tipo === 'credito') ventasCredito++;
      if (item.facturado) ventasFacturadas++;

      const grupo = cobrosPorOrigen[item.venta.origen];

      // Analizar los movimientos para desglosar pagos
      for (const m of item.movimientos) {
        if (m.tipo === 'pago' && !m.anulado && m.monto) {
          if (m.metodo_pago === 'efectivo') pagos.efectivo += m.monto;
          else if (m.metodo_pago === 'tarjeta') pagos.tarjeta += m.monto;
          else if (m.metodo_pago === 'transferencia') pagos.transferencia += m.monto;
          else pagos.otros += m.monto;

          grupo.total += m.monto;
          if (m.metodo_pago === 'efectivo') grupo.efectivo += m.monto;
          else if (m.metodo_pago === 'tarjeta') {
            grupo.tarjeta += m.monto;
            if (m.tarjeta_red) grupo.redes[m.tarjeta_red] = (grupo.redes[m.tarjeta_red] || 0) + m.monto;
          } else if (m.metodo_pago === 'transferencia') {
            grupo.transferencia += m.monto;
            if (m.transferencia_banco) grupo.bancos[m.transferencia_banco] = (grupo.bancos[m.transferencia_banco] || 0) + m.monto;
          } else {
            grupo.otros += m.monto;
          }
        }
      }
    }

    // Ventas con más saldo pendiente primero — lo más urgente de cobrar arriba.
    ventasPendientes.sort((a, b) => b.saldo - a.saldo);

    return {
      totalVentas: items.length,
      ventasValidas: validItems.length,
      anuladas: anuladas.length,
      montoTotal,
      totalCobrado,
      totalReembolsado,
      saldoPendiente,
      ventasPendientes,
      ventasCredito,
      ventasFacturadas,
      ticketPromedio: validItems.length > 0 ? montoTotal / validItems.length : 0,
      pagos,
      cobrosPorOrigen,
    };
  }, [items]);

  const cobradoPorcentaje = metrics.montoTotal > 0 ? (metrics.totalCobrado / metrics.montoTotal) * 100 : 0;
  const pendientePorcentaje = metrics.montoTotal > 0 ? (metrics.saldoPendiente / metrics.montoTotal) * 100 : 0;
  const pendientesOcultas = Math.max(0, metrics.ventasPendientes.length - MAX_PENDIENTES_VISIBLES);

  // `date` llega como label de agrupación ('DD MMM YYYY' en inglés, ej.
  // "19 Oct 2026") — se reparsea en locale es para el formato largo pedido.
  const fechaParsed = dayjs(date, 'DD MMM YYYY');
  const fechaFormateada = fechaParsed.isValid()
    ? fechaParsed.locale('es').format('dddd, D [de] MMMM - YYYY')
    : date;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background/50">
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <h2 className="text-lg font-black text-foreground">Resumen del Día</h2>
        <p className="text-xs font-semibold text-muted-foreground mt-0.5 capitalize">
          {fechaFormateada}{metrics.anuladas > 0 && ` · ${metrics.anuladas} anuladas`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 hide-scrollbar">
        {/* KPI Cards — mismo peso visual, color según significado */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            icon={CurrencyDollar}
            label="Total Vendido"
            value={`$${metrics.montoTotal.toFixed(2)}`}
            tone="positive"
            sub={`${metrics.ventasValidas} ${metrics.ventasValidas === 1 ? 'venta' : 'ventas'}`}
          />
          <StatTile
            icon={TrendUp}
            label="Ticket Promedio"
            value={`$${metrics.ticketPromedio.toFixed(2)}`}
            tone="info"
          />
          <StatTile
            icon={WarningCircle}
            label="Saldo Pendiente"
            value={`$${metrics.saldoPendiente.toFixed(2)}`}
            tone={metrics.saldoPendiente > 0 ? 'warning' : 'neutral'}
            sub={metrics.ventasPendientes.length > 0 ? `${metrics.ventasPendientes.length} por cobrar` : undefined}
          />
          <StatTile
            icon={ArrowCounterClockwise}
            label="Reembolsos"
            value={`$${metrics.totalReembolsado.toFixed(2)}`}
            tone="neutral"
          />
        </div>

        {/* Progress Bar of Completion */}
        <Card size="sm" className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-xs font-bold flex items-center justify-between">
              <span>Progreso de Cobros</span>
              <span className="text-muted-foreground">{cobradoPorcentaje.toFixed(1)}% cobrado</span>
            </CardTitle>
            <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex mt-2">
              <div style={{ width: `${Math.min(cobradoPorcentaje, 100)}%` }} className="bg-emerald-500 h-full transition-all" />
              <div style={{ width: `${Math.min(pendientePorcentaje, 100)}%` }} className="bg-amber-400 h-full transition-all" />
            </div>
            <div className="flex gap-4 mt-2 text-[11px] font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Cobrado</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400" /> Pendiente</span>
            </div>
          </CardHeader>
        </Card>

        {/* Cobros por Origen — cada sección con su total y el desglose por
            método (con redes/bancos anidados dentro de tarjeta/transferencia) */}
        <Card size="sm" className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold">Cobros por Origen</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <SeccionOrigen icon={TableIcon} titulo="Mesas" grupo={metrics.cobrosPorOrigen.mesa} />
            <SeccionOrigen icon={ForkKnife} titulo="Reservas" grupo={metrics.cobrosPorOrigen.reserva_restaurante} />
            <SeccionOrigen icon={BedIcon} titulo="Hotel" grupo={metrics.cobrosPorOrigen.reserva_hotel} />
            <SeccionOrigen icon={BedIcon} titulo="Habitaciones" grupo={metrics.cobrosPorOrigen.habitacion} />
          </CardContent>
        </Card>

        {/* Breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Totales por Método */}
          <Card size="sm" className="shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold">Totales por Método</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <FilaDato icon={Money} label="Efectivo" value={`$${metrics.pagos.efectivo.toFixed(2)}`} />
                  <FilaDato icon={CreditCard} label="Tarjeta" value={`$${metrics.pagos.tarjeta.toFixed(2)}`} />
                  <FilaDato icon={Bank} label="Transferencia" value={`$${metrics.pagos.transferencia.toFixed(2)}`} />
                  {metrics.pagos.otros > 0 && (
                    <FilaDato icon={DotsThreeCircle} label="Otros" value={`$${metrics.pagos.otros.toFixed(2)}`} />
                  )}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
                <span className="text-xs font-bold">Total</span>
                <span className="text-xs font-black text-blue-700">${metrics.totalCobrado.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Estadísticas de Ventas */}
          <Card size="sm" className="shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold">Detalle Operativo</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <FilaDato
                    icon={Wallet}
                    label="Ventas a Crédito"
                    value={String(metrics.ventasCredito)}
                    valueClassName={metrics.ventasCredito > 0 ? "text-rose-700" : undefined}
                  />
                  <FilaDato label="Ventas Directas" value={String(metrics.ventasValidas - metrics.ventasCredito)} />
                  <FilaDato
                    icon={Receipt}
                    label="Facturadas"
                    value={String(metrics.ventasFacturadas)}
                    valueClassName="text-emerald-600"
                  />
                  <FilaDato label="Sin Facturar" value={String(metrics.ventasValidas - metrics.ventasFacturadas)} />
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Ventas Pendientes (Alertas) */}
        {metrics.ventasPendientes.length > 0 && (
          <Card size="sm" className="shadow-xs border-amber-200 dark:border-amber-900/50 !gap-0 !py-0">
            <CardHeader className="!px-4 !py-3 border-b border-amber-100 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20 rounded-t-[min(var(--radius-4xl),24px)]">
              <CardTitle className="text-sm font-bold text-amber-800 dark:text-amber-400 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <WarningCircle size={18} />
                  Atención: {metrics.ventasPendientes.length} {metrics.ventasPendientes.length === 1 ? 'venta' : 'ventas'} con saldo pendiente
                </span>
                <Badge variant="outline" className="font-black text-amber-700 border-amber-300 bg-amber-100/50">
                  ${metrics.saldoPendiente.toFixed(2)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col">
                {metrics.ventasPendientes.slice(0, MAX_PENDIENTES_VISIBLES).map(venta => (
                  <button
                    key={venta.venta.id}
                    onClick={() => onSelectVenta(venta.venta.id)}
                    className="flex items-center justify-between p-4 border-b border-border last:border-b-0 hover:bg-muted transition-colors text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground truncate">{venta.venta.cliente_nombre || 'Sin cliente'}</p>
                      <p className="text-xs font-semibold text-muted-foreground mt-0.5 truncate">
                        {venta.venta.referencia || 'Sin referencia'} • Total: ${venta.montoTotal.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-black text-amber-600">
                        ${venta.saldo.toFixed(2)}
                      </span>
                      <ArrowRight size={16} className="text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
              {pendientesOcultas > 0 && (
                <div className="px-4 py-3 text-xs font-semibold text-muted-foreground text-center border-t border-border">
                  +{pendientesOcultas} {pendientesOcultas === 1 ? 'venta más' : 'ventas más'} con saldo pendiente
                </div>
              )}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
