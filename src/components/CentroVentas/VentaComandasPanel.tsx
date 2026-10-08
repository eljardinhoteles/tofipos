import { useMemo } from 'react';
import { folioLabel } from '../../lib/folio';
import { CaretRight, ForkKnife } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';
import { useRxComandas } from '../../hooks/useRxComandas';
import { useUI } from '../../context/UIContext';
import { showToast } from '@/lib/toast';
import type { RxVenta, RxVentaMovimiento } from '../../db/rxdb';

const ESTADO: Record<string, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-primary/10 text-primary' },
  en_cocina: { label: 'En cocina', cls: 'bg-warning-foreground/10 text-warning-foreground' },
  listo: { label: 'Listo', cls: 'bg-primary/10 text-primary' },
  cuenta: { label: 'Cuenta', cls: 'bg-warning-foreground/10 text-warning-foreground' },
  cerrado: { label: 'Cerrada', cls: 'bg-primary/10 text-primary' },
  facturado: { label: 'Facturada', cls: 'bg-primary/10 text-primary' },
  anulada: { label: 'Anulada', cls: 'bg-destructive/10 text-destructive' },
};

const money = (n: number) => `$${n.toFixed(2)}`;

interface VentaComandasPanelProps {
  venta: RxVenta;
  movimientos: RxVentaMovimiento[];
}

// Comandas ligadas a una venta: la comanda de la venta y las que se cerraron
// contra ella (checkout de habitación con varias, subcomandas que usaron el
// anticipo). Antes solo se veían como números sueltos en el título.
export function VentaComandasPanel({ venta, movimientos }: VentaComandasPanelProps) {
  const { comandas } = useRxComandas() as { comandas: any[] };

  // Folios mencionados en la referencia ("Mesa 3 · #12", "Comandas #12, #13") y en
  // las marcas de anticipo / cuenta cerrada de los movimientos.
  const folios = useMemo(() => {
    const set = new Set<string>();
    const leer = (texto?: string | null) => {
      for (const m of (texto ?? '').matchAll(/#(\d+(?:-\d+)?)/g)) set.add(m[1]);
    };
    leer(venta.referencia);
    for (const m of movimientos) if (m.tipo === 'comentario') leer(m.motivo);
    return set;
  }, [venta.referencia, movimientos]);

  const relacionadas = useMemo(
    () => comandas
      .filter(c => c.id === venta.comanda_id || folios.has(folioLabel(c)))
      .sort((a, b) => Number(a.folio) - Number(b.folio)),
    [comandas, folios, venta.comanda_id]
  );

  const { setCheckoutView, setConfigView, setReservaView, setSelectedReservaId, setSelectedMesaId, setViewingComandaId } = useUI();

  // Abre la comanda en el sidebar de solo lectura (el mismo de Órdenes).
  const abrirComanda = (c: any) => {
    if (!c.mesa_id) {
      showToast.warning('No se puede abrir la comanda', `La comanda #${folioLabel(c)} no tiene mesa asociada.`);
      return;
    }
    setCheckoutView(false);
    setConfigView('none');
    setReservaView('none');
    setSelectedReservaId(null);
    setSelectedMesaId(c.mesa_id);
    setViewingComandaId(c.id);
  };

  if (relacionadas.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Esta venta no tiene comandas vinculadas.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {relacionadas.map(c => {
        const est = ESTADO[c.estado] ?? ESTADO.pendiente;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => abrirComanda(c)}
            title="Abrir la comanda"
            className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl border border-border bg-card cursor-pointer text-left hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-black text-sm text-foreground tabular-nums">#{folioLabel(c)}</span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-foreground truncate flex items-center gap-1">
                  <ForkKnife size={11} weight="bold" className="shrink-0" />
                  {c.subcomanda_nombre || c.cliente || c.mesa_nombre || 'Comanda'}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {c.mesa_nombre || 'Mesa'} · {dayjs(c.created_at).format('DD MMM HH:mm')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold', est.cls)}>{est.label}</span>
              <span className="font-black text-sm text-foreground">{money(c.total ?? 0)}</span>
              <CaretRight size={14} weight="bold" className="text-muted-foreground" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
