import { ArrowLeft, Gift, Check, Minus, Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { folioLabel } from '../../../../lib/folio';

// Motivos frecuentes de cortesía: un toque llena el campo (se puede editar).
export const MOTIVOS_CORTESIA = ['Cortesía de la casa', 'Error de servicio', 'Cumpleaños / evento', 'Producto en mal estado'];

// Cambios pendientes de cortesía por ítem, en memoria hasta confirmar el cobro.
export interface CortesiaDraft {
  cantidad: number;
  motivo: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;

interface CheckoutComandaDetalleProps {
  comanda: any;
  items: any[];
  drafts: Record<string, CortesiaDraft>;
  onDraft: (itemId: string, patch: Partial<CortesiaDraft>) => void;
  /** Total de la comanda ya sin las cortesías. */
  totalNeto: number;
  onBack: () => void;
}

/**
 * Detalle de una comanda dentro del checkout de habitación: aquí solo se decide
 * qué ítems NO se cobran (cortesía). Es una pantalla aparte para que la lista de
 * precuentas siga siendo solo "qué se cobra". Lista plana, sin tarjetas anidadas.
 */
export function CheckoutComandaDetalle({ comanda, items, drafts, onDraft, totalNeto, onBack }: CheckoutComandaDetalleProps) {
  // Los ítems anulados ya no se cobran: no tiene sentido aplicarles cortesía.
  const visibles = items.filter(i => !i.anulado);
  const total = comanda.total || 0;
  const descuento = Math.max(0, total - totalNeto);
  const faltaMotivo = visibles.some(i => (drafts[i.id]?.cantidad ?? 0) > 0 && !(drafts[i.id]?.motivo ?? '').trim());

  return (
    <div className="h-full w-full bg-card flex flex-col overflow-hidden shadow-xl">
      <header className="p-4 border-b border-border flex items-center gap-3 shrink-0 shadow-xs">
        <Button type="button" variant="ghost" size="icon-lg" aria-label="Volver" onClick={onBack}
          className="rounded-xl bg-muted text-muted-foreground shrink-0">
          <ArrowLeft size={18} weight="bold" />
        </Button>
        <div className="flex flex-col min-w-0">
          <h3 className="font-extrabold text-base text-foreground leading-tight">Comanda #{folioLabel(comanda)}</h3>
          <span className="text-[10px] font-bold uppercase text-muted-foreground truncate">
            Elige qué ítems no se cobran
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {visibles.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">Esta comanda no tiene ítems.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {visibles.map((item) => {
              const draft = drafts[item.id] ?? { cantidad: 0, motivo: '' };
              const enCortesia = draft.cantidad > 0;
              return (
                <li key={item.id} className={cn('px-4 py-3.5 flex flex-col gap-3', enCortesia && 'bg-warning-soft/40')}>
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-muted text-foreground font-black text-sm flex items-center justify-center shrink-0 tabular-nums">
                      {item.cantidad}
                    </span>
                    <span className={cn('flex-1 min-w-0 text-sm truncate', enCortesia ? 'font-medium line-through text-muted-foreground' : 'font-bold text-foreground')}>
                      {item.nombre}
                    </span>
                    <span className={cn('text-sm shrink-0 tabular-nums', enCortesia ? 'font-medium line-through text-muted-foreground' : 'font-black text-foreground')}>
                      {money(item.precio * item.cantidad)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pl-11">
                    <Button
                      type="button" size="sm"
                      variant={enCortesia ? 'warningSoft' : 'secondary'}
                      onClick={() => onDraft(item.id, { cantidad: enCortesia ? 0 : item.cantidad })}
                      className="h-9 px-3 font-bold gap-1.5"
                    >
                      <Gift size={15} weight="bold" /> {enCortesia ? 'No se cobra' : 'No cobrar'}
                    </Button>

                    {enCortesia && item.cantidad > 1 && (
                      <div className="flex items-center h-9 rounded-xl border border-border bg-card overflow-hidden">
                        <button type="button" aria-label="Menos" disabled={draft.cantidad <= 1}
                          onClick={() => onDraft(item.id, { cantidad: Math.max(1, draft.cantidad - 1) })}
                          className="h-full w-9 flex items-center justify-center cursor-pointer active:bg-muted disabled:opacity-30">
                          <Minus size={14} weight="bold" />
                        </button>
                        <span className="min-w-14 text-center text-xs font-black tabular-nums">{draft.cantidad} / {item.cantidad}</span>
                        <button type="button" aria-label="Más" disabled={draft.cantidad >= item.cantidad}
                          onClick={() => onDraft(item.id, { cantidad: Math.min(item.cantidad, draft.cantidad + 1) })}
                          className="h-full w-9 flex items-center justify-center cursor-pointer active:bg-muted disabled:opacity-30">
                          <Plus size={14} weight="bold" />
                        </button>
                      </div>
                    )}
                  </div>

                  {enCortesia && (
                    <div className="pl-11 flex flex-col gap-2">
                      <Input
                        type="text" placeholder="Motivo de la cortesía" aria-label="Motivo de la cortesía"
                        value={draft.motivo}
                        onChange={(e) => onDraft(item.id, { motivo: e.target.value })}
                        className="h-10 text-sm font-semibold"
                      />
                      {!draft.motivo.trim() && (
                        <span className="text-[11px] font-semibold text-warning-foreground">Requerido para poder cobrar.</span>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {MOTIVOS_CORTESIA.map(motivo => (
                          <button
                            key={motivo} type="button"
                            onClick={() => onDraft(item.id, { motivo })}
                            className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer',
                              draft.motivo === motivo ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
                          >
                            {motivo}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <footer className="p-4 border-t border-border bg-muted/40 flex flex-col gap-3 shrink-0">
        <div className="flex flex-col gap-1 px-2 text-sm font-semibold text-muted-foreground">
          <div className="flex items-center justify-between"><span>Total de la comanda</span><span className="font-bold text-foreground">{money(total)}</span></div>
          {descuento > 0.005 && (
            <div className="flex items-center justify-between text-warning-foreground"><span>Cortesías</span><span className="font-bold">−{money(descuento)}</span></div>
          )}
          <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-dashed border-border">
            <span className="text-base font-black text-foreground">A cobrar</span>
            <span className="text-xl font-black text-foreground">{money(totalNeto)}</span>
          </div>
        </div>
        <Button type="button" className="w-full h-12 font-bold gap-2" onClick={onBack}>
          <Check size={18} weight="bold" /> {faltaMotivo ? 'Volver (falta un motivo)' : 'Listo'}
        </Button>
      </footer>
    </div>
  );
}
