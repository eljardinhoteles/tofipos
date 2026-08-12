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

interface TicketPreviewModalProps {
 opened: boolean;
 onClose: () => void;
 title: string;
 content?: string;
 onPrint?: () => void;
}

export function TicketPreviewModal({
 opened,
 onClose,
 title,
 content,
 onPrint,
}: TicketPreviewModalProps) {
 const ESC = String.fromCharCode(27);
 const GS = String.fromCharCode(29);

 const stripEscPos = (text: string) =>
 text
 .replace(new RegExp(`${ESC}[@Eae!]\\x00?`,'g'),'')
 .replace(new RegExp(`${GS}[Vv][ABab]\\x05?`,'g'),'')
 .replace(new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`,'g'),'');

 const handlePrintSubmit = () => {
 showToast.success('Enviado a Impresora','El documento se envió a la cola de impresión local (80mm).');
 if (onPrint) onPrint();
 onClose();
 };

 const renderFormattedContent = (text?: string) => {
 const safeText = stripEscPos(text ??'');
 const lines = safeText.split('\n');
 return (
 <div className="w-full text-foreground bg-card font-mono text-xs leading-snug whitespace-pre">
 {lines.map((line, idx) => (
 <div key={idx}>{line}</div>
 ))}
 </div>
 );
 };

 return (
 <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
 <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-4 p-6">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <FileText size={18} className="text-primary"/> {title}
 </DialogTitle>
 <DialogDescription className="sr-only">Vista previa del documento a imprimir</DialogDescription>
 </DialogHeader>

 <div className="flex-1 overflow-y-auto p-4 bg-muted border border-border rounded-xl shadow-inner">
 {renderFormattedContent(content)}
 </div>

 <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
 <Button type="button"variant="outline"onClick={onClose} className="font-bold text-xs">
 Cerrar
 </Button>
 <Button
 type="button"onClick={handlePrintSubmit}
 className="bg-emerald-600 text-white font-extrabold text-xs gap-1.5">
 <Printer size={16} /> Imprimir
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 );
}
