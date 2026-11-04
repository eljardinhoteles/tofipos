import { CheckCircle, Circle, CircleDashed } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { VentaConMovimientos } from '../../hooks/useVentasConMovimientos';
import { seguimientoVenta, type EstadoSeguimiento } from '../../lib/seguimientoVenta';

// Seguimiento en la barra de acciones (misma definición que los indicadores de la lista). Con la venta completa es una sola
// línea tranquila; si falta algo, solo se muestran los pendientes, cada uno como una píldora con lo que hay que hacer.
export function SeguimientoPasos({ item }: { item: VentaConMovimientos }) {
  if (item.anulado) return null;
  const s = seguimientoVenta(item);
  const n = s.pagosSinEfectivo - s.pagosConComprobante;
  const pasos: Array<{ texto: string; estado: EstadoSeguimiento }> = [
    { estado: s.cobro, texto: s.cobro === 'parcial' ? `Cobro parcial · saldo $${item.saldo.toFixed(2)}` : 'Falta registrar el pago' },
    { estado: s.comprobante, texto: `Falta comprobante en ${n > 0 ? n : 'el'} pago${n === 1 ? '' : 's'} (adjúntalo en el historial)` },
    { estado: s.factura, texto: s.factura === 'parcial' ? 'Factura desactualizada' : 'Falta la factura' },
  ];
  const pendientes = pasos.filter(p => p.estado === 'falta' || p.estado === 'parcial');

  if (pendientes.length === 0) {
    return (
      <p className="flex items-center justify-center gap-1.5 t-dato text-muted-foreground">
        <CheckCircle size={18} weight="fill" className="text-success shrink-0" aria-hidden="true" />
        Venta completa{item.numeroFactura ? ` · ${item.numeroFactura}` : ''}
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap items-center justify-center gap-2">
      {pendientes.map(p => {
        const Icono = p.estado === 'parcial' ? CircleDashed : Circle;
        return (
          <li key={p.texto} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 t-dato bg-warning-soft text-warning-foreground')}>
            <Icono size={16} weight="bold" aria-hidden="true" className="shrink-0" />
            {p.texto}
          </li>
        );
      })}
    </ul>
  );
}
