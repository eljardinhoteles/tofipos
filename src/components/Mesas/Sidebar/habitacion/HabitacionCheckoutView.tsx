import { useState, useMemo, useEffect } from'react';
import { X, CaretDown, Gift, Receipt, CreditCard } from'@phosphor-icons/react';
import { type Mesa, type HabitacionCuenta } from'../../../../db/database';
import { showToast } from'@/lib/toast';
import { initVerticalRxDb, updateRxComanda, updateRxComandaItem, updateRxHabitacionCuenta, updateRxMesa } from'../../../../db/rxdb';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';
import { Button } from'@/components/ui/button';
import { Checkbox } from'@/components/ui/checkbox';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from'@/components/ui/collapsible';
import { cn } from'@/lib/utils';

// Cambios pendientes de cortesía por item, mantenidos en memoria hasta que se
// confirma el cobro — así el cajero puede ajustar varios items sin disparar
// un write por cada tecla.
interface CortesiaDraft {
  cantidad: number;
  motivo: string;
}

export function HabitacionCheckoutView({
  cuenta,
  selectedMesa,
  onBack,
  onSuccess,
}: {
  cuenta: HabitacionCuenta;
  selectedMesa: Mesa;
  checkoutData?: any;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [payerName, setPayerName] = useState(cuenta.huesped ||'');

  const [comandas, setComandas] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [itemsByComanda, setItemsByComanda] = useState<Record<string, any[]>>({});
  const [expandedComandaId, setExpandedComandaId] = useState<string | null>(null);
  const [cortesiaDrafts, setCortesiaDrafts] = useState<Record<string, CortesiaDraft>>({});

  const roomNum = selectedMesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || selectedMesa.nombre.replace(/\D/g,'') || selectedMesa.nombre;

  useEffect(() => {
    let alive = true;
    (async () => {
      const rxDb = await initVerticalRxDb();
      const docs = await rxDb.comandas.find({ selector: { habitacion_cuenta_id: cuenta.id, _deleted: { $ne: true } } }).exec();
      if (!alive) return;
      const list = docs.map((d: any) => d.toJSON());
      setComandas(list);
      // Por defecto se seleccionan todas las precuentas, como antes; el
      // usuario puede desmarcar las que no quiere pagar en este cobro.
      setSelectedIds(new Set(list.map((c: any) => c.id)));

      const itemsDocs = await rxDb.comanda_items.find({
        selector: { comanda_id: { $in: list.map((c: any) => c.id) }, _deleted: { $ne: true } }
      }).exec();
      if (!alive) return;
      const grouped: Record<string, any[]> = {};
      for (const doc of itemsDocs) {
        const item = (doc as any).toJSON();
        (grouped[item.comanda_id] ||= []).push(item);
      }
      setItemsByComanda(grouped);

      // Prellenar drafts con la cortesía ya guardada de cada item.
      const drafts: Record<string, CortesiaDraft> = {};
      for (const item of itemsDocs.map((d: any) => d.toJSON())) {
        drafts[item.id] = {
          cantidad: item.cortesia_cantidad || 0,
          motivo: item.cortesia_motivo ||'',
        };
      }
      setCortesiaDrafts(drafts);
    })();
    return () => { alive = false; };
  }, [cuenta.id]);

  const comandasSeleccionadas = useMemo(
    () => comandas.filter(c => selectedIds.has(c.id)),
    [comandas, selectedIds]
  );

  // Total neto a cobrar por comanda: se resta, por cada item, el monto
  // correspondiente a la cantidad marcada en cortesía.
  const totalNetoPorComanda = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of comandas) {
      const items = itemsByComanda[c.id] || [];
      const totalCortesia = items.reduce((acc, item) => {
        const draft = cortesiaDrafts[item.id];
        const cantidadCortesia = draft ? draft.cantidad : (item.cortesia_cantidad || 0);
        return acc + cantidadCortesia * item.precio;
      }, 0);
      map.set(c.id, Math.max(0, (c.total || 0) - totalCortesia));
    }
    return map;
  }, [comandas, itemsByComanda, cortesiaDrafts]);

  const total = useMemo(
    () => comandasSeleccionadas.reduce((acc, c) => acc + (totalNetoPorComanda.get(c.id) ?? c.total ?? 0), 0),
    [comandasSeleccionadas, totalNetoPorComanda]
  );

  const toggleSeleccion = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setDraft = (itemId: string, patch: Partial<CortesiaDraft>) => {
    setCortesiaDrafts(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { cantidad: 0, motivo:''}), ...patch },
    }));
  };

  const handleFinalizar = async () => {
    if (comandasSeleccionadas.length === 0) return;

    // Toda cortesía marcada (cantidad > 0) requiere motivo, para no perder
    // trazabilidad de por qué no se cobró ese item.
    for (const c of comandasSeleccionadas) {
      const items = itemsByComanda[c.id] || [];
      for (const item of items) {
        const draft = cortesiaDrafts[item.id];
        if (draft && draft.cantidad > 0 && !draft.motivo.trim()) {
          showToast.error('Falta motivo','Indica el motivo de la cortesía en'+` "${item.nombre}".`);
          return;
        }
      }
    }

    setIsProcessing(true);
    try {
      const now = new Date().toISOString();

      for (const c of comandasSeleccionadas) {
        const items = itemsByComanda[c.id] || [];
        for (const item of items) {
          const draft = cortesiaDrafts[item.id];
          if (!draft) continue;
          const cantidadPrevia = item.cortesia_cantidad || 0;
          const motivoPrevio = item.cortesia_motivo ||'';
          if (draft.cantidad !== cantidadPrevia || draft.motivo.trim() !== motivoPrevio) {
            await updateRxComandaItem(item.id, {
              cortesia_cantidad: draft.cantidad,
              cortesia_motivo: draft.cantidad > 0 ? draft.motivo.trim() : null,
            });
          }
        }
        await updateRxComanda(c.id, {
          estado:'cerrado',
          total: totalNetoPorComanda.get(c.id) ?? c.total,
        });
      }

      // La cuenta de la habitación solo se cierra y la mesa se libera si no
      // quedan precuentas pendientes de pago; si el usuario dejó comandas sin
      // marcar, la habitación sigue activa con el resto del saldo.
      const quedanPendientes = comandas.some(c => !selectedIds.has(c.id));
      if (!quedanPendientes) {
        await updateRxHabitacionCuenta(cuenta.id, { estado:'cerrada', check_out: now.split('T')[0] });
        await updateRxMesa(selectedMesa.id, { estado:'libre'});
      }

      showToast.success('Checkout completado');
      onSuccess();
    } catch {
      showToast.error('Error al procesar checkout');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
      {/* Header — mismo lenguaje que SidebarDetails/CuentaView */}
      <header className="p-4 flex items-center justify-between shrink-0 shadow-xs bg-card text-foreground md:bg-primary md:text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0 bg-primary text-primary-foreground md:bg-primary-foreground/15">
            {roomNum}
          </div>
          <div className="flex flex-col">
            <h3 className="font-extrabold text-base leading-tight md:text-primary-foreground">Checkout</h3>
            <span className="text-[10px] font-bold text-muted-foreground md:text-primary-foreground/70">
              {cuenta.huesped} · {selectedMesa.nombre}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon-lg" onClick={onBack} className="rounded-xl text-muted-foreground md:text-primary-foreground">
          <X size={18} weight="bold" />
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label>Nombre de quien paga</Label>
          <Input
            type="text" value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-0.5">
            <Receipt size={14} /> Precuentas a cobrar
          </span>
          <div className="flex flex-col rounded-xl border border-border overflow-hidden">
            {comandas.map((c, index) => {
              const isSelected = selectedIds.has(c.id);
              const isExpanded = expandedComandaId === c.id;
              const isOdd = index % 2 === 1;
              const items = itemsByComanda[c.id] || [];
              const totalNeto = totalNetoPorComanda.get(c.id) ?? c.total ?? 0;
              const tieneCortesia = totalNeto < (c.total || 0) - 0.001;

              return (
                <Collapsible
                  key={c.id}
                  open={isExpanded}
                  onOpenChange={(open) => setExpandedComandaId(open ? c.id : null)}
                  className={cn("border-b border-border last:border-b-0", isOdd &&"bg-muted/70")}
                >
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => toggleSeleccion(c.id)}
                      className="flex-1 px-4 py-3 flex items-center gap-3 text-left cursor-pointer"
                    >
                      <Checkbox checked={isSelected} className="pointer-events-none shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-sm text-foreground truncate">Comanda #{c.folio}</span>
                        <span className="text-[10px] text-muted-foreground font-semibold">
                          {new Date(c.created_at).toLocaleDateString('es', { day:'2-digit', month:'short'})} · {new Date(c.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                    </button>

                    <CollapsibleTrigger
                      className="pl-2 pr-4 flex items-center gap-1.5 text-muted-foreground cursor-pointer shrink-0"
                      title="Ver items / aplicar cortesía"
                    >
                      <div className="flex flex-col items-end">
                        {tieneCortesia && (
                          <span className="text-[10px] font-bold text-muted-foreground line-through">
                            ${c.total?.toFixed(2) ||'0.00'}
                          </span>
                        )}
                        <span className="font-black text-sm text-foreground">${totalNeto.toFixed(2)}</span>
                      </div>
                      <CaretDown size={14} className={cn("transition-transform", isExpanded &&"rotate-180")} />
                    </CollapsibleTrigger>
                  </div>

                  <CollapsibleContent>
                    <div className="px-4 pb-3 flex flex-col gap-2 border-t border-border/60 pt-3">
                      {items.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">Sin items.</span>
                      ) : items.map((item) => {
                        const draft = cortesiaDrafts[item.id] || { cantidad: 0, motivo:''};
                        const enCortesia = draft.cantidad > 0;
                        return (
                          <div key={item.id} className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-card border border-border">
                            <div className="flex items-center gap-3">
                              <div className={cn("w-7 h-7 rounded-md font-bold text-xs flex items-center justify-center border shrink-0",
                                enCortesia ?"bg-amber-100 border-amber-300 text-amber-800":"bg-muted border-border text-foreground")}>
                                {item.cantidad}
                              </div>
                              <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                                <span className={cn("text-sm text-foreground truncate", enCortesia ?"font-medium line-through text-muted-foreground":"font-bold")}>
                                  {item.nombre}
                                </span>
                                <span className="font-black text-sm text-foreground shrink-0">
                                  ${(item.precio * item.cantidad).toFixed(2)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pl-10">
                              <Button
                                type="button"
                                size="xs"
                                variant={enCortesia ?"default":"secondary"}
                                onClick={() => setDraft(item.id, { cantidad: enCortesia ? 0 : item.cantidad })}
                                className={cn("shrink-0", enCortesia &&"bg-amber-100 text-amber-800 hover:bg-amber-100")}
                              >
                                <Gift size={12} weight="bold" /> {enCortesia ?`Cortesía (${draft.cantidad}/${item.cantidad})`:'No cobrar'}
                              </Button>

                              {enCortesia && item.cantidad > 1 && (
                                <Input
                                  type="number" min={1} max={item.cantidad}
                                  value={draft.cantidad}
                                  onChange={(e) => {
                                    const val = Math.max(1, Math.min(item.cantidad, Number(e.target.value) || 1));
                                    setDraft(item.id, { cantidad: val });
                                  }}
                                  className="h-7 w-16 text-center text-xs shrink-0"
                                />
                              )}
                            </div>

                            {enCortesia && (
                              <Input
                                type="text" placeholder="Motivo de la cortesía (obligatorio)"
                                value={draft.motivo}
                                onChange={(e) => setDraft(item.id, { motivo: e.target.value })}
                                className="h-8 text-xs ml-10"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer — mismo bloque de total que SidebarDetails/CuentaView */}
      <footer className="p-4 bg-card border-t border-border flex flex-col gap-3 shrink-0">
        <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-muted/60 text-sm font-semibold text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="text-base font-black text-foreground">
              Total a Cobrar ({comandasSeleccionadas.length}/{comandas.length})
            </span>
            <span className="text-xl font-black text-primary">${total.toFixed(2)}</span>
          </div>
        </div>

        <Button
          type="button" disabled={isProcessing || comandasSeleccionadas.length === 0}
          onClick={handleFinalizar}
          className="w-full font-bold"
        >
          <CreditCard size={18} weight="bold" className="mr-1.5" /> Cobrar
        </Button>
      </footer>
    </div>
  );
}
