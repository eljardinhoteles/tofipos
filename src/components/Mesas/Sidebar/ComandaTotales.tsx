import { Eye, PencilSimple } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface ComandaTotalesProps {
  subtotal: number;
  iva: number;
  ivaPorcentaje: number;
  ivaEsOverride?: boolean;
  total: number;
  totalPagado?: number;
  saldoPendiente?: number;
  /** Anticipo de la mesa disponible para esta cuenta (0 = no se muestra). */
  anticipo?: number;
  /** false = solo el total (p. ej. móvil mientras se toma el pedido). */
  detallado?: boolean;
  /** Si se pasa, la fila de IVA es editable. */
  onEditarIva?: () => void;
  /** Si se pasa, "Ya cobrado" abre el detalle de los cobros. */
  onVerPagos?: () => void;
  /** Si se pasa, la fila de anticipo abre su detalle (movimientos de la venta). */
  onVerAnticipo?: () => void;
  /** Texto de la fila principal (por defecto "Total"). */
  etiquetaTotal?: string;
  /** Color del importe principal: azul de marca o verde de "pagado". */
  tono?: 'primary' | 'success';
  /** Presenta el resumen como tarjeta gris (comprobantes) en vez de integrado al footer. */
  tarjeta?: boolean;
}

const money = (n: number) => `$${n.toFixed(2)}`;

// Resumen de importes de una comanda: subtotal, IVA, total y, si ya hubo
// cobros parciales, lo cobrado y el restante.
export function ComandaTotales({ subtotal, iva, ivaPorcentaje, ivaEsOverride, total, totalPagado = 0, saldoPendiente = 0, anticipo = 0, detallado = true, onEditarIva, onVerPagos, onVerAnticipo, etiquetaTotal = 'Total', tono = 'primary', tarjeta = false }: ComandaTotalesProps) {
  return (
    <div className={cn('flex flex-col gap-1.5 text-sm font-semibold text-muted-foreground',
      tarjeta ? 'p-3.5 rounded-xl bg-muted/60' : 'px-2 py-1')}>
      {detallado && (
        <>
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span className="font-bold text-foreground">{money(subtotal)}</span>
          </div>
          {onEditarIva ? (
            <button
              type="button"
              onClick={onEditarIva}
              title="Cambiar el IVA de esta comanda"
              className="flex items-center justify-between cursor-pointer hover:text-foreground transition-colors -mx-1 px-1 rounded-md"
            >
              <span className="flex items-center gap-1">
                IVA {ivaPorcentaje}%{ivaEsOverride ? ' (fijo)' : ''}
                <PencilSimple size={12} className="opacity-60" />
              </span>
              <span className="font-bold text-foreground">{money(iva)}</span>
            </button>
          ) : (
            <div className="flex items-center justify-between">
              <span>IVA {ivaPorcentaje}%{ivaEsOverride ? ' (fijo)' : ''}</span>
              <span className="font-bold text-foreground">{money(iva)}</span>
            </div>
          )}
        </>
      )}
      <div className={cn('flex items-center justify-between',
        detallado && (tarjeta ? 'pt-2 mt-1 border-t border-border' : 'pt-2 mt-1 border-t border-dashed border-border'))}>
        <span className="text-base font-black text-foreground">{etiquetaTotal}</span>
        <span className={cn('text-xl font-black', tono === 'success' ? 'text-foreground' : 'text-foreground')}>{money(total)}</span>
      </div>
      {totalPagado > 0 && detallado && (
        // Cuenta dividida registra cobros parciales antes del cierre.
        onVerPagos ? (
          <button
            type="button"
            onClick={onVerPagos}
            title="Ver detalle de los cobros"
            className="flex items-center justify-between px-3 py-2 mt-1 rounded-xl bg-primary/10 text-primary cursor-pointer hover:bg-primary/15 hover:text-primary transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold">
              Ya cobrado
              <Eye size={14} weight="bold" className="opacity-70" />
            </span>
            <span className="font-black">{money(totalPagado)}</span>
          </button>
        ) : (
          <div className="flex items-center justify-between px-3 py-2 mt-1 rounded-xl bg-primary/10 text-primary">
            <span className="font-bold">Ya cobrado</span>
            <span className="font-black">{money(totalPagado)}</span>
          </div>
        )
      )}
      {anticipo > 0.001 && detallado && (
        // Solo informa cuánto hay a favor de la mesa; cuánto se usa se decide al cobrar.
        onVerAnticipo ? (
          <button
            type="button"
            onClick={onVerAnticipo}
            title="Ver el detalle del anticipo"
            className="flex items-center justify-between px-3 py-2 mt-1 rounded-xl bg-info/10 text-info-foreground cursor-pointer hover:bg-info/15 transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold">
              Anticipo disponible
              <Eye size={14} weight="bold" className="opacity-70" />
            </span>
            <span className="font-black">{money(anticipo)}</span>
          </button>
        ) : (
          <div className="flex items-center justify-between px-3 py-2 mt-1 rounded-xl bg-info/10 text-info-foreground">
            <span className="font-bold">Anticipo disponible</span>
            <span className="font-black">{money(anticipo)}</span>
          </div>
        )
      )}
      {totalPagado > 0 && detallado && (
        <div className="flex items-center justify-between">
          <span className="text-base font-black text-foreground">Restante</span>
          <span className="text-xl font-black text-warning-foreground">{money(saldoPendiente)}</span>
        </div>
      )}
    </div>
  );
}
