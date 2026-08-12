import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';

interface SidebarPagosModalProps {
  opened: boolean;
  onClose: () => void;
  pagos: any[];
  totalPagado: number;
}

export function SidebarPagosModal({ opened, onClose, pagos, totalPagado }: SidebarPagosModalProps) {
  return (
    <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-6 gap-4 border border-border shadow-2xl">
        <DialogHeader className="border-b border-border pb-3 text-left">
          <DialogTitle className="font-extrabold text-base text-foreground">
            Historial de Pagos
          </DialogTitle>
          <DialogDescription className="sr-only">
            Listado de pagos realizados para la comanda actual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
          {pagos.length === 0 ? (
            <span className="text-xs text-muted-foreground font-semibold text-center py-6">
              No hay pagos registrados todavía.
            </span>
          ) : (
            pagos.map((pago) => (
              <div key={pago.id} className="p-3 rounded-xl bg-muted border border-border flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-extrabold text-xs text-foreground">
                    {pago.tipo_division ? pago.tipo_division.replace('Dividido - ', '') : 'Pago Registrado'}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    {new Date(pago.fecha).toLocaleString()}
                  </span>
                  {pago.factura_nro && (
                    <span className="w-fit px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold text-[9px] mt-1">
                      Factura: {pago.factura_nro}
                    </span>
                  )}
                </div>
                <span className="font-black text-sm text-emerald-600">${pago.monto.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border font-extrabold text-sm">
          <span className="text-foreground">Total Pagado</span>
          <span className="text-emerald-600 text-base font-black">${totalPagado.toFixed(2)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
