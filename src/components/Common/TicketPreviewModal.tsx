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
 // Valor vigente de la cuenta regresiva: el interval lo lee de aquí en vez de
 // usar un updater de setState con efectos secundarios (toast, onPrint, onClose).
 const countdownRef = useRef<number | null>(null);
 const updateCountdown = (value: number | null) => {
 countdownRef.current = value;
 setCountdown(value);
 };

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
 updateCountdown(null);
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
 updateCountdown(COUNTDOWN_SECONDS);
 timerRef.current = setInterval(() => {
 const prev = countdownRef.current;
 if (prev === null) return;
 if (prev > 1) {
 updateCountdown(prev - 1);
 return;
 }
 clearTimer();
 updateCountdown(null);
 if (!firedRef.current) {
 firedRef.current = true;
 showToast.success('Enviado a Impresora','El documento se envió a la cola de impresión local (80mm).');
 if (onPrint) onPrint();
 }
 onClose();
 }, 1000);
 };

 const cancelCountdown = () => {
 clearTimer();
 updateCountdown(null);
 };

 const renderFormattedContent = (text?: string) => {
 const safeText = stripEscPos(text ??'');
 const lines = safeText.split('\n');
 return (
 <div className="w-max min-w-full text-foreground font-mono text-[11px] sm:text-xs leading-snug whitespace-pre">
 {lines.map((line, idx) => (
 <div key={idx}>{line}</div>
 ))}
 </div>
 );
 };

 const isCounting = countdown !== null;

 return (
 <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
 <DialogContent showCloseButton={false} className="flex flex-col gap-4 p-6 max-w-md max-h-[90dvh] max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-screen max-sm:h-dvh max-sm:max-w-none max-sm:max-h-none max-sm:rounded-none max-sm:p-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <FileText size={18} className="text-muted-foreground"/> {title}
 </DialogTitle>
 <DialogDescription className="sr-only">Vista previa del documento a imprimir</DialogDescription>
 </DialogHeader>

 <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 bg-card border border-border rounded-xl">
 {renderFormattedContent(content)}
 </div>

 {isCounting ? (
 <div className="grid grid-cols-2 items-center gap-2 pt-1 shrink-0">
 <Button type="button"variant="outline"onClick={cancelCountdown} className="h-12 font-bold text-sm gap-1.5">
 <X size={16} /> Cancelar
 </Button>
 <span className="text-center font-black text-sm text-primary tabular-nums">
 Imprimiendo en {countdown}…
 </span>
 </div>
 ) : (
 <div className="grid grid-cols-2 gap-2 pt-1 shrink-0">
 <Button type="button"variant="outline"onClick={onClose} className="h-12 font-bold text-sm">
 Cerrar
 </Button>
 <Button
 type="button"onClick={startCountdown}
 className="h-12 bg-primary text-white font-extrabold text-sm gap-1.5">
 <Printer size={16} /> Imprimir
 </Button>
 </div>
 )}
 </DialogContent>
 </Dialog>
 );
}
