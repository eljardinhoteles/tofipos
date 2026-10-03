import { Printer, CircleNotch } from'@phosphor-icons/react';
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
 /** Lo que falta por cobrar de la cuenta, sin descontar el anticipo. */
 saldoPendiente: number;
 /** Anticipo de la mesa disponible (0 = no hay, no se ofrece). */
 anticipo?: number;
 /** Cuánto del anticipo se aplica a esta cuenta (0 hasta min(anticipo, saldo)). */
 anticipoUsar?: number;
 onAnticipoUsarChange?: (monto: number) => void;
 closePayerName: string;
 setClosePayerName: (val: string) => void;
 onConfirm: () => void;
 // Cierre en curso: bloquea el botón y el cierre del modal (evita dobles clics).
 procesando?: boolean;
}

export function SidebarCloseCuentaModal({
 opened,
 onClose,
 saldoPendiente,
 anticipo = 0,
 anticipoUsar = 0,
 onAnticipoUsarChange,
 closePayerName,
 setClosePayerName,
 onConfirm,
 procesando = false
}: SidebarCloseCuentaModalProps) {
 const hayAnticipo = anticipo > 0.001;
 const maxUsar = Math.min(anticipo, saldoPendiente);
 const cobrarAhora = Math.max(0, saldoPendiente - anticipoUsar);
 return (
 <Dialog open={opened} onOpenChange={(open) => !open && !procesando && onClose()}>
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
 <span className="font-black text-3xl text-emerald-600 dark:text-emerald-400">${cobrarAhora.toFixed(2)}</span>
 </div>

 {hayAnticipo && (
 <div className="flex flex-col gap-2 p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
 <div className="flex items-center justify-between">
 <Label className="font-semibold text-xs text-sky-800">Anticipo disponible</Label>
 <span className="font-black text-sm text-sky-700">${anticipo.toFixed(2)}</span>
 </div>
 <div className="flex items-center gap-2">
 <Input
 type="number" step="0.01" min={0} max={maxUsar} value={anticipoUsar || ''} placeholder="0.00"
 onChange={(e) => onAnticipoUsarChange?.(Math.min(maxUsar, Math.max(0, parseFloat(e.target.value) || 0)))}
 className="h-10 font-bold bg-card"
 />
 <Button type="button" variant="outline" className="h-10 font-bold shrink-0 bg-card" onClick={() => onAnticipoUsarChange?.(maxUsar)}>Todo</Button>
 <Button type="button" variant="outline" className="h-10 font-bold shrink-0 bg-card" onClick={() => onAnticipoUsarChange?.(0)}>Nada</Button>
 </div>
 <p className="text-[11px] text-sky-800/80">
 {anticipo > maxUsar + 0.005
 ? `Se usa hasta cubrir la cuenta. Quedan $${(anticipo - anticipoUsar).toFixed(2)} de anticipo sin usar.`
 : 'Se descuenta de lo que se cobra ahora.'}
 </p>
 </div>
 )}

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
 type="button"onClick={onConfirm}disabled={procesando}
 className="gap-1.5 bg-emerald-600 text-white font-bold h-11 text-sm shadow-md">
 {procesando ? (<><CircleNotch size={18} className="animate-spin"/> Cerrando…</>) : (<><Printer size={18} /> Cerrar e Imprimir</>)}
 </Button>

 <Button
 type="button"variant="ghost"disabled={procesando}onClick={onClose}
 className="w-full text-muted-foreground">
 Cancelar
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 );
}
