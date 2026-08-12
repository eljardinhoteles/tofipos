import { useState, useMemo, useEffect } from 'react';
import { X, Receipt, CreditCard } from '@phosphor-icons/react';
import { type Mesa, type HabitacionCuenta } from '../../../../db/database';
import { initVerticalRxDb } from '../../../../db/rxdb';
import { TicketPreviewModal } from '../../../Common/TicketPreviewModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CuentaView({
  cuenta,
  selectedMesa,
  onClose,
  onCheckout,
  onOpenComanda,
}: {
  cuenta: HabitacionCuenta;
  selectedMesa: Mesa;
  onClose: () => void;
  onCheckout: (data: any) => void;
  onOpenComanda?: (comandaId: string) => void;
}) {
  const roomType = selectedMesa.nombre.match(/\(([^)]+)\)/)?.[1] || selectedMesa.piso || 'Sin tipo';
  const roomNum = selectedMesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || selectedMesa.nombre.replace(/\D/g, '') || selectedMesa.nombre;
  const [comandas, setComandas] = useState<any[]>([]);
  const [previewTicketText, setPreviewTicketText] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rxDb = await initVerticalRxDb();
      const docs = await rxDb.comandas.find({ selector: { habitacion_cuenta_id: cuenta.id, _deleted: { $ne: true } } }).exec();
      if (!alive) return;
      setComandas(docs.map((d: any) => d.toJSON()));
    })();
    return () => { alive = false; };
  }, [cuenta.id]);

  const totalConIva = useMemo(() => {
    return comandas.reduce((acc, c) => acc + (c.total || 0), 0);
  }, [comandas]);

  return (
    <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
      {/* Header — mismo lenguaje que SidebarDetails: badge circular con el
          número de la unidad, título + subtítulo, fondo temático en desktop. */}
      <header className="p-4 flex items-center justify-between shrink-0 shadow-xs bg-card text-foreground md:bg-primary md:text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0 bg-primary text-primary-foreground md:bg-primary-foreground/15">
            {roomNum}
          </div>
          <div className="flex flex-col">
            <h3 className="font-extrabold text-base leading-tight md:text-primary-foreground">
              {cuenta.huesped}
            </h3>
            <span className="text-[10px] font-bold text-muted-foreground md:text-primary-foreground/70">
              {roomType} · {selectedMesa.nombre}
            </span>
          </div>
        </div>

        <Button variant="ghost" size="icon-lg" onClick={onClose} className="rounded-xl text-muted-foreground md:text-primary-foreground">
          <X size={18} weight="bold" />
        </Button>
      </header>

      {/* Lista de comandas cargadas — mismo patrón zebra + badge que ComandaItemRow */}
      <main className="flex-1 overflow-y-auto">
        {comandas.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
            <Receipt size={48} className="text-muted-foreground/40" />
            <span className="font-bold text-xs text-foreground">Sin consumos aún</span>
            <span className="text-[11px] text-muted-foreground">Las comandas cargadas a esta habitación aparecerán aquí.</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {comandas.map((c, index) => {
              const isOdd = index % 2 === 1;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenComanda?.(c.id)}
                  disabled={!onOpenComanda}
                  className={cn("w-full text-left flex items-center gap-3 px-4 py-3 transition-colors focus:outline-none focus-visible:bg-primary/10 border-l-4 border-l-transparent",
                    isOdd && "bg-muted/70", onOpenComanda && "enabled:cursor-pointer enabled:hover:border-l-primary")}
                >
                  <div className="w-7 h-7 rounded-md font-bold text-xs flex items-center justify-center border shrink-0 bg-muted border-border text-foreground">
                    <Receipt size={14} />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-foreground truncate">Comanda #{c.folio}</span>
                      <span className="font-black text-sm text-foreground shrink-0">
                        ${c.total?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {new Date(c.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })} · {new Date(c.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer y Acciones — mismo bloque de total y grid de botones que SidebarDetails */}
      <footer className="p-4 bg-card border-t border-border flex flex-col gap-3 shrink-0">
        <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-muted/60 text-sm font-semibold text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="text-base font-black text-foreground">Total de Consumos</span>
            <span className="text-xl font-black text-primary">${totalConIva.toFixed(2)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary" className="w-full font-bold text-emerald-600 bg-emerald-50"
            onClick={() => onCheckout({ extras: [], incluidos: [] })}
          >
            <CreditCard size={18} weight="bold" className="mr-1.5" /> Checkout
          </Button>
          <Button
            variant="ghost" className="w-full font-bold text-destructive"
            onClick={onClose}
          >
            Anular
          </Button>
        </div>
      </footer>

      <TicketPreviewModal
        opened={previewTicketText !== null}
        onClose={() => setPreviewTicketText(null)}
        title="Precuenta de Habitación"
        content={previewTicketText || ''}
      />
    </div>
  );
}
