import { Printer, FileText } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from'@/components/ui/dialog';
import { Button } from'@/components/ui/button';

interface PrintableItem {
 nombre: string;
 precio: number;
 cantidad: number;
 item_id?: string;
 modificadores?: string[];
 nota?: string;
}

export interface A4ReportPreviewModalProps {
 opened: boolean;
 onClose: () => void;
 mesasData: Array<{ mesaNombre: string; habitacionNombre?: string; items: PrintableItem[] }>;
}

export function A4ReportPreviewModal({
 opened,
 onClose,
 mesasData,
}: A4ReportPreviewModalProps) {
 const handlePrintSubmit = () => {
 window.print();
 showToast.success('Imprimiendo','Enviado a la impresora A4.');
 onClose();
 };

 return (
 <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
 <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-4 p-6">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <FileText size={18} className="text-primary"/> Vista Previa (Formato A4)
 </DialogTitle>
 <DialogDescription className="sr-only">Vista previa del reporte de cocina consolidado en formato A4</DialogDescription>
 </DialogHeader>

 <div className="flex-1 overflow-y-auto p-6 bg-muted border border-border rounded-xl flex flex-col gap-6 font-sans">
 <h2 className="font-black text-xl text-foreground">REPORTE COCINA CONSOLIDADO</h2>
 <div className="grid grid-cols-2 gap-4">
 {mesasData.map((m, idx) => (
 <div key={idx} className="p-4 bg-card rounded-xl border border-border flex flex-col gap-2">
 <span className="font-black text-sm text-foreground">--- {m.mesaNombre.toUpperCase()} ---</span>
 {m.items.map((item, i) => (
 <div key={i} className="flex items-center justify-between text-xs font-bold">
 <span>{item.nombre}</span>
 <span className="px-2 py-0.5 rounded bg-muted text-foreground font-black">x{item.cantidad}</span>
 </div>
 ))}
 </div>
 ))}
 </div>
 </div>

 <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
 <Button type="button"variant="outline"onClick={onClose} className="font-bold text-xs">
 Cerrar
 </Button>
 <Button
 type="button"onClick={handlePrintSubmit}
 className="bg-emerald-600 text-white font-extrabold text-xs gap-1.5">
 <Printer size={16} /> Imprimir A4
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 );
}
