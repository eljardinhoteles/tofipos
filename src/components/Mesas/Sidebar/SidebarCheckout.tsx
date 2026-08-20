import { useEffect, useState, useMemo } from'react';
import { Printer, ArrowLeft, Door, Check } from'@phosphor-icons/react';
import type { Mesa } from'../../../db/database';
import { showToast } from'@/lib/toast';
import { SidebarEnviarHabitacion } from'./SidebarEnviarHabitacion';
import { useComandaIva } from'../../../hooks/useComandaIva';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { generarPrecuenta, generarTicketPago } from'../../../services/printTemplateEngine';
import { queueReceiptPrint, queueReprintTicket } from'../../../lib/printServerClient';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';
import { initVerticalRxDb, createRxVenta, updateRxComanda, updateRxMesa } from'../../../db/rxdb';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import { Button } from'@/components/ui/button';

interface SidebarCheckoutProps {
 selectedMesa: Mesa;
 activeComanda: any;
 comandaItems: any[];
 onBack: () => void;
 onSuccess: () => void;
 initialType?:'directo'|'dividido';
 startInEnviarHabitacion?: boolean;
}

/**
 * Cierre de cuenta en Mesas: solo pide cobrar el total y cerrar — sin elegir
 * método de pago. El pago se registra "pendiente de definir" (metodo_pago
 * null, metodo_definido=false); el método real (efectivo/tarjeta/
 * transferencia/otros) y su detalle de comprobante se asignan después en
 * Centro de Ventas, al anclar la transacción. Esto mantiene "cobrar y
 * cerrar" siempre rápido en el punto de venta.
 */
export function SidebarCheckout({ selectedMesa, activeComanda, comandaItems, onBack, onSuccess, startInEnviarHabitacion = false }: SidebarCheckoutProps) {
 const [isProcessing, setIsProcessing] = useState(false);
 const [showEnviarHabitacion, setShowEnviarHabitacion] = useState(startInEnviarHabitacion);
 const [previewOpened, setPreviewOpened] = useState(false);
 const [previewTitle, setPreviewTitle] = useState('');
 const [previewContent, setPreviewContent] = useState('');
 const [previewOnPrint, setPreviewOnPrint] = useState<(() => void) | null>(null);
 const [onCloseCallback, setOnCloseCallback] = useState<(() => void) | null>(null);

 const { porcentaje: ivaPorcentaje, preciosConIva } = useComandaIva(activeComanda);
 const { menuItems } = useRxMenuCatalog();
 const [cuentasActivas, setCuentasActivas] = useState(0);
 const [pagos, setPagos] = useState<any[]>([]);
 const [habitacionNombre, setHabitacionNombre] = useState<string | undefined>(undefined);

 useEffect(() => {
 let alive = true;
 const run = async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const activeCount = await rxDb.habitacion_cuentas.find({
 selector: { estado:'activa', _deleted: false }
 }).exec();
 if (alive) setCuentasActivas(activeCount.length);

 if (activeComanda?.habitacion_cuenta_id) {
 const hc = await rxDb.habitacion_cuentas.findOne(activeComanda.habitacion_cuenta_id).exec();
 if (!alive || !hc) return;
 const mesa = await rxDb.mesas.findOne(hc.toJSON().mesa_id).exec();
 if (alive) setHabitacionNombre(mesa ? mesa.toJSON().nombre : undefined);
 }
 };
 run().catch(console.error);
 return () => { alive = false; };
 }, [activeComanda?.habitacion_cuenta_id]);

 useEffect(() => {
 if (!activeComanda?.id) {
 setPagos([]);
 return;
 }
 let alive = true;
 let unsub: (() => void) | null = null;
 const run = async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const query = rxDb.pagos.find({ selector: { comanda_id: activeComanda.id, _deleted: false } });
 const docs = await query.exec();
 if (!alive) return;
 setPagos(docs.map((doc: any) => doc.toJSON()));
 unsub = query.$.subscribe((docs: any[]) => {
 setPagos(docs.map((doc: any) => doc.toJSON()));
 }) as any;
 if (!alive && unsub) unsub();
 };
 run().catch(console.error);
 return () => {
 alive = false;
 if (unsub) unsub();
 };
 }, [activeComanda?.id]);

 const totales = useMemo(() => {
 return calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);
 }, [comandaItems, menuItems, ivaPorcentaje, preciosConIva]);

 const total = totales.total;
 const totalPagado = useMemo(() => pagos.reduce((acc, p) => acc + p.monto, 0), [pagos]);
 const saldoPendiente = Math.max(0, total - totalPagado);

 const canFinalize = saldoPendiente > 0.001;

 const handleFinalize = async () => {
 if (!activeComanda) return;
 setIsProcessing(true);
 try {
 const fecha = new Date().toISOString();
 const pObj = {
 id: crypto.randomUUID(),
 comanda_id: activeComanda.id,
 monto: saldoPendiente,
 fecha,
 organization_id: localStorage.getItem('pos_active_org_id') ||''};
 await createRxVenta({
 id: crypto.randomUUID(),
 origen:'mesa',
 tipo:'directa',
 cliente_id: activeComanda.cliente_id || undefined,
 cliente_nombre: activeComanda.cliente || undefined,
 referencia: `Mesa ${activeComanda.mesa_nombre || selectedMesa.nombre} · #${activeComanda.folio}`,
 comanda_id: activeComanda.id,
 organization_id: pObj.organization_id,
 }, saldoPendiente);

 await updateRxComanda(activeComanda.id, {
 estado:'cerrado',
 mesa_nombre: activeComanda.mesa_nombre || selectedMesa.nombre,
 });
 await updateRxMesa(selectedMesa.id, { estado:'libre'});

 showToast.success('Venta Finalizada',`La mesa ${selectedMesa.nombre} ha sido cobrada exitosamente.`);

 const content = generarTicketPago(
 activeComanda,
 comandaItems,
 [...pagos, pObj],
 selectedMesa.nombre,
 ivaPorcentaje,
 undefined,
 habitacionNombre
 );
 setPreviewContent(content);
 setPreviewTitle(`Recibo de Pago - ${selectedMesa.nombre}`);
 setPreviewOnPrint(() => () => {
 queueReprintTicket({
 rawText: content,
 mesaNombre: selectedMesa.nombre,
 comanda: activeComanda,
 }).catch(err => console.warn('print server offline', err));
 });
 setOnCloseCallback(() => () => onSuccess());
 setPreviewOpened(true);

 } catch (error) {
 showToast.error('Error al procesar el cobro');
 } finally {
 setIsProcessing(false);
 }
 };

 const handleShowPrecuentaPreview = () => {
 if (!activeComanda) return;
 const content = generarPrecuenta(
 activeComanda,
 comandaItems,
 selectedMesa.nombre,
 ivaPorcentaje,
 pagos,
 habitacionNombre
 );
 setPreviewContent(content);
 setPreviewTitle(`Precuenta - ${selectedMesa.nombre}`);
 setPreviewOnPrint(() => () => {
 queueReceiptPrint({
 comanda: activeComanda,
 items: comandaItems,
 mesaNombre: selectedMesa.nombre,
 ivaPorcentaje,
 pagos,
 habitacionNombre,
 }).catch(err => console.warn('print server offline', err));
 });
 setOnCloseCallback(null);
 setPreviewOpened(true);
 };

 if (showEnviarHabitacion && activeComanda) {
 return (
 <SidebarEnviarHabitacion
 activeComanda={activeComanda}
 onBack={() => {
 if (startInEnviarHabitacion) {
 onBack();
 return;
 }
 setShowEnviarHabitacion(false);
 }}
 onSuccess={onSuccess}
 />
 );
 }

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 {/* Header */}
 <header className="p-4 border-b border-border flex items-center justify-between shrink-0 shadow-xs">
 <div className="flex items-center gap-3">
 <button
 type="button"onClick={onBack}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <ArrowLeft size={18} weight="bold"/>
 </button>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground leading-tight">Pago Total</h3>
 <span className="text-[10px] font-bold text-muted-foreground">
 {selectedMesa.nombre.replace('Mesa','Mesa #')} - Cuenta #{activeComanda?.folio}
 </span>
 </div>
 </div>

 <button
 type="button"onClick={handleShowPrecuentaPreview}
 title="Previsualizar Precuenta"className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center cursor-pointer transition-colors">
 <Printer size={18} />
 </button>
 </header>

 {/* Main */}
 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
 <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
 <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total a cobrar</span>
 <span className="text-4xl font-black text-foreground">${saldoPendiente.toFixed(2)}</span>
 <p className="text-xs text-muted-foreground max-w-[220px]">
 El método de pago (efectivo, tarjeta, transferencia) se asigna después en Centro de Ventas.
 </p>
 </div>

 {/* Resumen */}
 <div className="p-4 rounded-xl bg-foreground text-background flex flex-col gap-2 shadow-xs">
 <div className="flex items-center justify-between text-xs">
 <span className="text-background/60 font-bold uppercase">Total de la cuenta</span>
 <span className="font-black text-base text-background">${total.toFixed(2)}</span>
 </div>
 {totalPagado > 0 && (
 <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
 <span>Pagado previamente</span>
 <span>-${totalPagado.toFixed(2)}</span>
 </div>
 )}
 <div className="w-full h-[1px] bg-background/20 my-1"/>
 <div className="flex items-center justify-between text-sm font-black">
 <span>RESTANTE</span>
 <span className="text-primary">${saldoPendiente.toFixed(2)}</span>
 </div>
 </div>
 </main>

 {/* Footer */}
 <footer className="p-4 border-t border-border bg-card flex flex-col gap-2 shrink-0">
 <Button
 type="button"disabled={!canFinalize || isProcessing}
 onClick={handleFinalize}
 className="w-full py-3.5 h-auto rounded-xl bg-emerald-600 text-white font-black text-sm shadow-xs">
 <Check size={20} weight="bold"/> Cobrar y Cerrar
 </Button>

 {cuentasActivas > 0 && (
 <button
 type="button"onClick={() => setShowEnviarHabitacion(true)}
 className="w-full py-2.5 rounded-xl bg-primary/10 text-primary font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
 <Door size={18} weight="bold"/> Enviar a Habitación
 </button>
 )}
 </footer>

 <TicketPreviewModal
 opened={previewOpened}
 onClose={() => {
 setPreviewOpened(false);
 if (onCloseCallback) {
 onCloseCallback();
 }
 }}
 title={previewTitle}
 content={previewContent}
 onPrint={previewOnPrint ?? undefined}
 />
 </div>
 );
}
