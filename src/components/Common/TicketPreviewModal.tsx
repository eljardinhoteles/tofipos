import { useEffect, useRef, useState } from'react';
import { Printer, FileText, X } from'@phosphor-icons/react';
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

const COUNTDOWN_SECONDS = 3;

export function TicketPreviewModal({
 opened,
 onClose,
 title,
 content,
 onPrint,
}: TicketPreviewModalProps) {
 const ESC = String.fromCharCode(27);
 const GS = String.fromCharCode(29);

 // null = sin cuenta regresiva activa; number = segundos restantes.
 const [countdown, setCountdown] = useState<number | null>(null);
 const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
 // Cerrojo aparte del timer: garantiza que onPrint() se dispare como máximo
 // una vez por cuenta regresiva, sin importar si el interval tuvo algún
 // tick de más antes de que clearInterval surtiera efecto.
 const firedRef = useRef(false);

 const clearTimer = () => {
 if (timerRef.current) {
 clearInterval(timerRef.current);
 timerRef.current = null;
 }
 };

 // Si el modal se cierra o cambia de documento mientras cuenta, cancelamos
 // silenciosamente: no queremos imprimir algo que el usuario ya no ve.
 useEffect(() => {
 if (!opened) {
 clearTimer();
 setCountdown(null);
 firedRef.current = false;
 }
 return clearTimer;
 }, [opened]);

 const stripEscPos = (text: string) =>
 text
 .replace(new RegExp(`${ESC}[@Eae!]\\x00?`,'g'),'')
 .replace(new RegExp(`${GS}[Vv][ABab]\\x05?`,'g'),'')
 .replace(new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`,'g'),'');

 const startCountdown = () => {
 // Guardia contra doble-click/doble-tap: si ya hay una cuenta regresiva
 // corriendo, un segundo click no debe arrancar un setInterval extra —
 // eso duplicaría el envío a imprimir cuando ambos lleguen a 0.
 if (timerRef.current) return;
 firedRef.current = false;
 setCountdown(COUNTDOWN_SECONDS);
 timerRef.current = setInterval(() => {
 setCountdown(prev => {
 if (prev === null) return null;
 if (prev <= 1) {
 clearTimer();
 if (!firedRef.current) {
 firedRef.current = true;
 showToast.success('Enviado a Impresora','El documento se envió a la cola de impresión local (80mm).');
 if (onPrint) onPrint();
 }
 onClose();
 return null;
 }
 return prev - 1;
 });
 }, 1000);
 };

 const cancelCountdown = () => {
 clearTimer();
 setCountdown(null);
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

 const isCounting = countdown !== null;

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

 {isCounting ? (
 <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
 <Button type="button"variant="outline"onClick={cancelCountdown} className="font-bold text-xs gap-1.5">
 <X size={16} /> Cancelar
 </Button>
 <span className="flex-1 text-center font-black text-sm text-emerald-600 tabular-nums">
 Imprimiendo en {countdown}…
 </span>
 </div>
 ) : (
 <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
 <Button type="button"variant="outline"onClick={onClose} className="font-bold text-xs">
 Cerrar
 </Button>
 <Button
 type="button"onClick={startCountdown}
 className="bg-emerald-600 text-white font-extrabold text-xs gap-1.5">
 <Printer size={16} /> Imprimir
 </Button>
 </div>
 )}
 </DialogContent>
 </Dialog>
 );
}
