import { useEffect, useRef, useState } from'react';
import { Printer, FileText } from'@phosphor-icons/react';
import { avisarSinImprimir } from'@/lib/imprimir';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from'@/components/ui/dialog';
import { Button } from'@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from'@/components/ui/tabs';

interface TicketPreviewModalProps {
 opened: boolean;
 onClose: () => void;
 title: string;
 content?: string;
 onPrint?: () => void;
 /** Si se pasa, el modal ofrece un segundo documento: el ticket de cocina. */
 kitchenContent?: string;
 onPrintKitchen?: () => void;
 /** Si se cierra sin imprimir, avisa con este nombre (p. ej. "La comanda de cocina") y ofrece imprimir. */
 avisoSinImprimir?: string;
}


export function TicketPreviewModal({
 opened,
 onClose,
 title,
 content,
 onPrint,
 kitchenContent,
 onPrintKitchen,
 avisoSinImprimir,
}: TicketPreviewModalProps) {
 const [documento, setDocumento] = useState<'cliente'|'cocina'>('cliente');
 const tieneCocina = !!kitchenContent;
 const esCocina = tieneCocina && documento === 'cocina';
 const ESC = String.fromCharCode(27);
 const GS = String.fromCharCode(29);

 // Cerrojo: onPrint() se dispara como máximo una vez por apertura (doble tap).
 const firedRef = useRef(false);
 // Documento activo al momento de imprimir.
 const esCocinaRef = useRef(false);
 esCocinaRef.current = esCocina;

 // Cerrar sin haber enviado un ticket que debía salir (la comanda ya quedó marcada
 // como enviada a cocina): se avisa y se ofrece imprimir, para que no se pierda.
 const avisoRef = useRef<{ texto?: string; imprimir?: () => void }>({});
 avisoRef.current = { texto: avisoSinImprimir, imprimir: onPrint };
 const avisarSiNoSeImprimio = () => {
 const { texto, imprimir } = avisoRef.current;
 if (texto && imprimir && !firedRef.current) {
 avisarSinImprimir(texto, imprimir);
 }
 };
 const cerrar = () => {
 avisarSiNoSeImprimio();
 firedRef.current = true; // evita un segundo aviso al desmontar
 onClose();
 };

 // Si el modal se cierra o cambia de documento mientras cuenta, cancelamos
 // silenciosamente: no queremos imprimir algo que el usuario ya no ve.
 // Si el componente desaparece con la vista previa abierta (se cerró el sidebar), también avisa.
 useEffect(() => () => { if (openedRef.current) avisarSiNoSeImprimio(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
 const openedRef = useRef(opened);
 openedRef.current = opened;

 useEffect(() => {
 if (opened) firedRef.current = false;
 else setDocumento('cliente');
 }, [opened]);

 const stripEscPos = (text: string) =>
 text
 .replace(new RegExp(`${ESC}[@Eae!]\\x00?`,'g'),'')
 .replace(new RegExp(`${GS}[Vv][ABab]\\x05?`,'g'),'')
 .replace(new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`,'g'),'');

 const imprimirAhora = () => {
 if (firedRef.current) return;
 firedRef.current = true;
 if (esCocinaRef.current) onPrintKitchen?.(); else onPrint?.();
 onClose();
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

 return (
 <Dialog open={opened} onOpenChange={(open) => !open && cerrar()}>
 <DialogContent showCloseButton={false} className="flex flex-col gap-4 p-6 max-w-md max-h-[90dvh] max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-screen max-sm:h-dvh max-sm:max-w-none max-sm:max-h-none max-sm:rounded-none max-sm:p-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <FileText size={18} className="text-muted-foreground"/> {title}
 </DialogTitle>
 <DialogDescription className="sr-only">Vista previa del documento a imprimir</DialogDescription>
 </DialogHeader>

 {tieneCocina && (
 <Tabs value={documento} onValueChange={(v) => { setDocumento(v as 'cliente'|'cocina'); }}>
 <TabsList aria-label="Documento a imprimir">
 <TabsTrigger value="cliente">Precuenta cliente</TabsTrigger>
 <TabsTrigger value="cocina">Comanda cocina</TabsTrigger>
 </TabsList>
 </Tabs>
 )}

 <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 bg-card border border-border rounded-xl">
 {renderFormattedContent(esCocina ? kitchenContent : content)}
 </div>

 <div className="grid grid-cols-2 gap-2 pt-1 shrink-0">
 <Button type="button"variant="outline"onClick={cerrar} className="h-12 font-bold text-sm">
 Cerrar
 </Button>
 <Button
 type="button"onClick={imprimirAhora}
 className="h-12 bg-primary text-white font-extrabold text-sm gap-1.5">
 <Printer size={16} /> {esCocina ? 'Imprimir cocina' : 'Imprimir'}
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 );
}
