import { useMemo } from 'react';
import {
  CurrencyDollar,
  CreditCard,
  Receipt,
  WarningCircle,
  ChartBar,
  Money,
  Bank,
  ArrowRight,
  Wallet,
  DotsThreeCircle,
  TrendUp,
  ArrowCounterClockwise,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { VentaConMovimientos } from '../../hooks/useVentasConMovimientos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DashboardControlDiaProps {
  date: string;
  items: VentaConMovimientos[];
  onSelectVenta: (id: string) => void;
}

// Fila de dato con etiqueta a la izquierda y valor a la derecha — patrón
// repetido en los desgloses (métodos de pago, detalle operativo).
function FilaDato({ icon: Icon, label, value, valueClassName }: {
  icon?: typeof Money;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {Icon && <Icon size={16} />} {label}
      </span>
      <span className={cn("text-sm font-bold text-foreground", valueClassName)}>{value}</span>
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
    <Card className="shadow-xs">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">{label}</span>
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", toneClasses[tone])}>
            <Icon size={14} weight="bold" />
          </div>
        </div>
        <span className="text-2xl font-black text-foreground tracking-tight">{value}</span>
        {sub && <span className="text-xs font-medium text-muted-foreground">{sub}</span>}
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

      // Analizar los movimientos para desglosar pagos
      for (const m of item.movimientos) {
        if (m.tipo === 'pago' && !m.anulado && m.monto) {
          if (m.metodo_pago === 'efectivo') pagos.efectivo += m.monto;
          else if (m.metodo_pago === 'tarjeta') pagos.tarjeta += m.monto;
          else if (m.metodo_pago === 'transferencia') pagos.transferencia += m.monto;
          else pagos.otros += m.monto;
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
    };
  }, [items]);

  const cobradoPorcentaje = metrics.montoTotal > 0 ? (metrics.totalCobrado / metrics.montoTotal) * 100 : 0;
  const pendientePorcentaje = metrics.montoTotal > 0 ? (metrics.saldoPendiente / metrics.montoTotal) * 100 : 0;
  const pendientesOcultas = Math.max(0, metrics.ventasPendientes.length - MAX_PENDIENTES_VISIBLES);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background/50">
      <div className="p-6 border-b border-border bg-card shrink-0">
        <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
          <ChartBar size={28} className="text-primary" />
          Resumen del Día
        </h2>
        <p className="text-sm font-semibold text-muted-foreground mt-1">
          {date} • {metrics.ventasValidas} ventas válidas {metrics.anuladas > 0 && `(${metrics.anuladas} anuladas)`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 hide-scrollbar">
        {/* KPI Cards — mismo peso visual, color según significado */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        <Card className="shadow-xs">
          <CardHeader className="p-5">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>Progreso de Cobros</span>
              <span className="text-muted-foreground">{cobradoPorcentaje.toFixed(1)}% cobrado</span>
            </CardTitle>
            <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex mt-2">
              <div style={{ width: `${Math.min(cobradoPorcentaje, 100)}%` }} className="bg-emerald-500 h-full transition-all" />
              <div style={{ width: `${Math.min(pendientePorcentaje, 100)}%` }} className="bg-amber-400 h-full transition-all" />
            </div>
            <div className="flex gap-4 mt-3 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Cobrado</span>
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Pendiente</span>
            </div>
          </CardHeader>
        </Card>

        {/* Breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pagos por Método */}
          <Card className="shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-bold">Cobros por Método</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4">
              <FilaDato icon={Money} label="Efectivo" value={`$${metrics.pagos.efectivo.toFixed(2)}`} />
              <FilaDato icon={CreditCard} label="Tarjeta" value={`$${metrics.pagos.tarjeta.toFixed(2)}`} />
              <FilaDato icon={Bank} label="Transferencia" value={`$${metrics.pagos.transferencia.toFixed(2)}`} />
              {metrics.pagos.otros > 0 && (
                <FilaDato icon={DotsThreeCircle} label="Otros" value={`$${metrics.pagos.otros.toFixed(2)}`} />
              )}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-sm font-bold">Total</span>
                <span className="text-sm font-black text-blue-700">${metrics.totalCobrado.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Estadísticas de Ventas */}
          <Card className="shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-bold">Detalle Operativo</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4">
              <FilaDato
                icon={Wallet}
                label="Ventas a Crédito"
                value={String(metrics.ventasCredito)}
                valueClassName={metrics.ventasCredito > 0 ? "text-rose-700" : undefined}
              />
              <FilaDato label="Ventas Directas" value={String(metrics.ventasValidas - metrics.ventasCredito)} />
              <div className="w-full h-px bg-border my-2" />
              <FilaDato
                icon={Receipt}
                label="Facturadas"
                value={String(metrics.ventasFacturadas)}
                valueClassName="text-emerald-600"
              />
              <FilaDato label="Sin Facturar" value={String(metrics.ventasValidas - metrics.ventasFacturadas)} />
            </CardContent>
          </Card>
        </div>

        {/* Ventas Pendientes (Alertas) */}
        {metrics.ventasPendientes.length > 0 && (
          <Card className="shadow-xs border-amber-200 dark:border-amber-900/50">
            <CardHeader className="p-5 border-b border-amber-100 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20">
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
