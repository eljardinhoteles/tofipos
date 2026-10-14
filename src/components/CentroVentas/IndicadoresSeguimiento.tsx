import { CurrencyDollar, Paperclip, Receipt } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { VentaConMovimientos } from '../../hooks/useVentasConMovimientos';
import { seguimientoVenta, type EstadoSeguimiento } from '../../lib/seguimientoVenta';

// Tres indicadores por venta (cobro, comprobante y factura) que se leen por forma y color, sin texto: relleno =
// completo, contorno naranja = parcial, contorno gris vacío = falta, casi invisible = no aplica. Los colores son los
// de cada acción en el detalle (pago = verde, comprobante = azul, factura = morado).
const COLOR: Record<'cobro' | 'comprobante' | 'factura', { lleno: string; icono: typeof Receipt }> = {
  cobro: { lleno: 'bg-success border-success text-white', icono: CurrencyDollar },
  comprobante: { lleno: 'bg-info border-info text-white', icono: Paperclip },
  factura: { lleno: 'bg-special border-special text-white', icono: Receipt },
};

const ESTADO: Record<Exclude<EstadoSeguimiento, 'completo'>, string> = {
  parcial: 'bg-warning-soft border-warning-foreground text-warning-foreground',
  falta: 'bg-card border-border text-muted-foreground/60',
  na: 'border-transparent text-muted-foreground/30',
};

function Indicador({ tipo, estado, titulo }: { tipo: keyof typeof COLOR; estado: EstadoSeguimiento; titulo: string }) {
  const { lleno, icono: Icono } = COLOR[tipo];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span aria-label={titulo} className={cn('size-6 rounded-full border flex items-center justify-center shrink-0', estado === 'completo' ? lleno : ESTADO[estado])}>
          <Icono size={13} weight="bold" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{titulo}</TooltipContent>
    </Tooltip>
  );
}

export function IndicadoresSeguimiento({ item }: { item: VentaConMovimientos }) {
  const s = seguimientoVenta(item);
  const cobro = s.cobro === 'completo' ? 'Cobrada completa'
    : s.cobro === 'parcial' ? `Cobro parcial · saldo $${item.saldo.toFixed(2)}`
      : 'Sin cobro registrado';
  const comprobante = s.comprobante === 'completo' ? 'Todos los pagos tienen comprobante'
    : s.comprobante === 'na' ? 'No requiere comprobante (efectivo o voucher del terminal)'
      : s.comprobante === 'parcial' ? `Comprobantes: ${s.pagosConComprobante} de ${s.pagosSinEfectivo} pagos`
        : s.pagosSinEfectivo > 0 ? 'Pagos sin comprobante' : 'Sin pagos que respaldar';
  const factura = s.factura === 'completo' ? `Facturada${item.numeroFactura ? ` · ${item.numeroFactura}` : ''}`
    : s.factura === 'parcial' ? 'Hay pagos posteriores a la última factura'
      : 'Sin factura';
  return (
    <div className="flex items-center gap-1.5">
      <Indicador tipo="cobro" estado={s.cobro} titulo={cobro} />
      <Indicador tipo="comprobante" estado={s.comprobante} titulo={comprobante} />
      <Indicador tipo="factura" estado={s.factura} titulo={factura} />
    </div>
  );
}
