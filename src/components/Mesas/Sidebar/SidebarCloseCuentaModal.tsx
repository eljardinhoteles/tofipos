import { Printer } from'@phosphor-icons/react';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';
import { Button } from'@/components/ui/button';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription
} from'@/components/ui/dialog';

interface SidebarCloseCuentaModalProps {
 opened: boolean;
 onClose: () => void;
 saldoPendiente: number;
 closePayerName: string;
 setClosePayerName: (val: string) => void;
 onConfirm: () => void;
}

export function SidebarCloseCuentaModal({
 opened,
 onClose,
 saldoPendiente,
 closePayerName,
 setClosePayerName,
 onConfirm
}: SidebarCloseCuentaModalProps) {
 return (
 <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
 <DialogContent className="max-w-md p-6 gap-4 border border-border shadow-2xl">
 <DialogHeader className="border-b border-border pb-3 text-left">
 <DialogTitle className="font-extrabold text-lg text-foreground">
 Confirmar Cierre de Cuenta
 </DialogTitle>
 <DialogDescription className="sr-only">
 Formulario para confirmar el cobro total e impresión del ticket de cierre.
 </DialogDescription>
 </DialogHeader>

 <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 flex flex-col">
 <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">Total a Cobrar</span>
 <span className="font-black text-3xl text-emerald-600 dark:text-emerald-400">${saldoPendiente.toFixed(2)}</span>
 </div>

 <div className="flex flex-col gap-1.5">
 <Label className="font-semibold text-xs text-muted-foreground">Nombre de quien paga</Label>
 <Input
 type="text"placeholder="Ej: Juan Pérez"value={closePayerName}
 onChange={(e) => setClosePayerName(e.target.value)}
 className="font-semibold"autoFocus
 />
 </div>

 <p className="text-xs text-muted-foreground">
 Se registrará el pago total de la cuenta en el sistema local y se liberará la mesa.
 </p>

 <div className="flex flex-col gap-2 pt-2 border-t border-border">
 <Button
 type="button"onClick={onConfirm}
 className="gap-1.5 bg-emerald-600 text-white font-bold h-11 text-sm shadow-md">
 <Printer size={18} /> Cerrar e Imprimir
 </Button>

 <Button
 type="button"variant="ghost"onClick={onClose}
 className="w-full text-muted-foreground">
 Cancelar
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 );
}
