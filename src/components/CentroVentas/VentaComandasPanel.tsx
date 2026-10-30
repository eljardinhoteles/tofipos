import { folioLabel } from '../../lib/folio';
import { CaretRight, ForkKnife } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';
import { useUI } from '../../context/UIContext';
import { useRxReservas } from '../../hooks/useRxReservas';
import type { Reserva } from '../../db/database';
import { showToast } from '@/lib/toast';

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
  /** Comandas de la venta (las calcula el detalle una sola vez con useComandasDeVenta: la pestaña también muestra su cantidad). */
  relacionadas: any[];
}

export function VentaComandasPanel({ relacionadas }: VentaComandasPanelProps) {
  const { setCheckoutView, setConfigView, setReservaView, setSelectedReservaId, setSelectedMesaId, setViewingComandaId } = useUI();

  const { reservas } = useRxReservas();

  // Una reserva de restaurante lleva su pedido en una comanda propia que solo pasa a una mesa real al iniciar el servicio. Mientras
  // la reserva no esté completada, esa comanda se ve dentro de la reserva (su sidebar); completada, se abre la comanda como cualquier otra.
  const reservaDe = (c: { id: string }): Reserva | undefined => {
    const r = (reservas as Reserva[]).find((x) => x.comanda_id === c.id);
    return r && r.estado !== 'completada' ? r : undefined;
  };

  // Abre la reserva (si la comanda aún es de una reserva sin completar) o la comanda en el sidebar de solo lectura (el mismo de Órdenes).
  const abrirComanda = (c: any) => {
    const reserva = reservaDe(c);
    if (reserva) {
      setCheckoutView(false);
      setConfigView('none');
      setSelectedMesaId(null);
      setViewingComandaId(null);
      setSelectedReservaId(reserva.id);
      setReservaView('detalle');
      return;
    }
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
    return <p className="t-meta text-muted-foreground py-2">Esta venta no tiene comandas vinculadas.</p>;
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
            title={reservaDe(c) ? 'Abrir la reserva' : 'Abrir la comanda'}
            className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-2xl bg-card shadow-2xs cursor-pointer text-left hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="t-cuerpo-fuerte text-foreground tabular-nums">#{folioLabel(c)}</span>
              <div className="flex flex-col min-w-0">
                <span className="t-dato text-foreground truncate flex items-center gap-1">
                  <ForkKnife size={11} weight="bold" className="shrink-0" />
                  {c.subcomanda_nombre || c.cliente || c.mesa_nombre || 'Comanda'}
                </span>
                <span className="t-meta text-muted-foreground truncate">
                  {c.mesa_nombre || 'Mesa'} · {dayjs(c.created_at).format('DD MMM HH:mm')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('px-2 py-0.5 rounded-md t-dato', est.cls)}>{est.label}</span>
              <span className="t-cuerpo-fuerte text-foreground">{money(c.total ?? 0)}</span>
              <CaretRight size={14} weight="bold" className="text-muted-foreground" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
