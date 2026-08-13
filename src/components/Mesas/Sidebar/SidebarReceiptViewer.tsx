import { useEffect, useState, useMemo } from'react';
import { X, Printer, User, Bed, ForkKnife } from'@phosphor-icons/react';
import { type Mesa } from'../../../db/database';
import { useIvaActivo } from'../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { SidebarPagosModal } from'./SidebarPagosModal';
import { generarTicketPago, generarPrecuenta } from'../../../services/printTemplateEngine';
import { queueReceiptPrint, queueReprintTicket } from'../../../lib/printServerClient';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';
import { initVerticalRxDb } from'../../../db/rxdb';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import { cn } from'@/lib/utils';
import { Button } from'@/components/ui/button';

interface SidebarReceiptViewerProps {
 selectedMesa: Mesa;
 activeComanda: any;
 comandaItems: any[];
 onClose: () => void;
 onAction: (mesa: Mesa, action: string) => void;
}

export function SidebarReceiptViewer({
 selectedMesa,
 activeComanda,
 comandaItems = [],
 onClose,
 onAction: _onAction,
}: SidebarReceiptViewerProps) {
 const [showPagosModal, setShowPagosModal] = useState(false);
 const [previewOpened, setPreviewOpened] = useState(false);
 const [previewTitle, setPreviewTitle] = useState('');
 const [previewContent, setPreviewContent] = useState('');
 const [previewOnPrint, setPreviewOnPrint] = useState<(() => void) | null>(null);
 const [pagos, setPagos] = useState<any[]>([]);
 const [habitacionCuenta, setHabitacionCuenta] = useState<any | null>(null);
 const [habitacionMesa, setHabitacionMesa] = useState<any | null>(null);

 useEffect(() => {
 let alive = true;
 if (activeComanda?.habitacion_cuenta_id) {
 initVerticalRxDb().then(async rxDb => {
 const doc = await rxDb.habitacion_cuentas.findOne(activeComanda.habitacion_cuenta_id).exec();
 if (alive && doc) {
 const cuentaData = doc.toJSON();
 setHabitacionCuenta(cuentaData);
 if (cuentaData.mesa_id) {
 const mDoc = await rxDb.mesas.findOne(cuentaData.mesa_id).exec();
 if (alive && mDoc) {
 setHabitacionMesa(mDoc.toJSON());
 }
 }
 }
 });
 } else {
 setHabitacionCuenta(null);
 setHabitacionMesa(null);
 }
 return () => {
 alive = false;
 };
 }, [activeComanda?.habitacion_cuenta_id]);

 useEffect(() => {
 let alive = true;
 let sub: { unsubscribe: () => void } | null = null;

 (async () => {
 if (!activeComanda?.id) {
 if (alive) setPagos([]);
 return;
 }
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const query = rxDb.pagos.find({
 selector: { comanda_id: activeComanda.id }
 });
 sub = query.$.subscribe((docs: any[]) => {
 if (!alive) return;
 setPagos(docs.map((doc: any) => doc.toJSON()));
 });
 })().catch(() => {});

 return () => {
 alive = false;
 sub?.unsubscribe();
 };
 }, [activeComanda?.id]);

 const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
 const { menuItems } = useRxMenuCatalog();

 const totales = useMemo(
 () => calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva),
 [comandaItems, menuItems, ivaPorcentaje, preciosConIva]
 );
 const subtotal = totales.subtotalNeto;
 const ivaCalculado = totales.ivaTotal;

 const totalPagado = useMemo(() => pagos.reduce((acc, p) => acc + p.monto, 0), [pagos]);

 const isFacturado = activeComanda?.estado ==='facturado';
 const isAnulada = activeComanda?.estado ==='anulada';
 const esComandaEnHabitacionActiva = !!activeComanda?.habitacion_cuenta_id &&
 activeComanda.estado !=='cerrado'&&
 activeComanda.estado !=='facturado'&&
 activeComanda.estado !=='anulada';

 // Badge circular del header: solo el número de mesa/habitación, nunca el
 // nombre completo (que puede incluir el tipo entre paréntesis, ej.
 //"Hab. 1 (Cabaña Jacuzzi)"), o desborda el círculo.
 const badgeNum = selectedMesa?.nombre?.match(/Hab\.\s*(\d+)/)?.[1]
 || selectedMesa?.nombre?.match(/Mesa\s*(\d+)/)?.[1]
 || selectedMesa?.nombre?.replace(/\D/g,'')
 || selectedMesa?.nombre
 ||'—';

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 {/* Header — mismo lenguaje que SidebarDetails: badge circular con el
 número de la mesa/habitación, título + subtítulo, fondo temático en
 desktop según el estado de la comanda. */}
 <header className={cn("p-4 flex items-center justify-between shrink-0 shadow-xs bg-card text-foreground",
 esComandaEnHabitacionActiva ?"md:bg-teal-600 md:text-white": isAnulada ?"md:bg-red-600 md:text-white":"md:bg-primary md:text-primary-foreground")}>
 <div className="flex items-center gap-3">
 <div className={cn("w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0",
 esComandaEnHabitacionActiva ?"bg-teal-600 text-white md:bg-white/15": isAnulada ?"bg-red-600 text-white md:bg-white/15":"bg-primary text-primary-foreground md:bg-primary-foreground/15")}>
 {badgeNum}
 </div>
 <div className="flex flex-col min-w-0">
 <h3 className={cn("font-extrabold text-base leading-tight truncate",
 esComandaEnHabitacionActiva || isAnulada ?"md:text-white":"md:text-primary-foreground")}>
 Comanda #{activeComanda?.folio}
 </h3>
 <div className="flex items-center gap-1.5">
 {activeComanda?.created_at && (
 <span className={cn("text-[10px] font-bold text-muted-foreground",
 esComandaEnHabitacionActiva || isAnulada ?"md:text-white/70":"md:text-primary-foreground/70")}>
 {new Date(activeComanda.created_at).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric'})}
 {' · '}
 {new Date(activeComanda.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit'})}
 </span>
 )}
 {isFacturado && (
 <span className="text-xs font-bold text-primary">
 Factura: {activeComanda.factura_nro ||'Sin número'}
 </span>
 )}
 </div>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <span className={cn("px-3 py-1 rounded-full font-black text-xs uppercase shrink-0",
 esComandaEnHabitacionActiva
 ?"bg-white/20 text-white": isFacturado
 ?"bg-primary/10 text-primary": isAnulada
 ?"bg-white/20 text-white":"bg-emerald-100 text-emerald-800")}>
 {esComandaEnHabitacionActiva ?'En Habitación': isFacturado ?'Conciliada': isAnulada ?'Anulada':'Cobrada'}
 </span>
 <Button
 variant="ghost"size="icon-lg"onClick={onClose}
 className={cn("rounded-xl text-muted-foreground",
 esComandaEnHabitacionActiva || isAnulada ?"md:text-white":"md:text-primary-foreground")}
 >
 <X size={18} weight="bold"/>
 </Button>
 </div>
 </header>

 {/* Datos del cliente / ubicación, mismo bloque que el resto de sidebars */}
 <div className="px-4 py-2.5 border-b border-border shrink-0 flex flex-col gap-1.5">
 <div className="flex items-center gap-2 text-foreground">
 <User size={14} className="text-primary shrink-0"/>
 <span className="font-semibold text-xs truncate">{activeComanda?.cliente || habitacionCuenta?.huesped ||'Consumidor Final'}</span>
 </div>
 <div className="flex items-center gap-2 text-foreground">
 {activeComanda?.habitacion_cuenta_id ? <Bed size={14} className="text-primary shrink-0"/> : <ForkKnife size={14} className="text-primary shrink-0"/>}
 <span className="font-semibold text-xs">
 {(() => {
 if (activeComanda?.habitacion_cuenta_id) {
 const roomName = habitacionMesa?.nombre || activeComanda?.mesa_nombre ||'Habitación';
 const prefix = roomName.toLowerCase().startsWith('hab') || roomName.toLowerCase().startsWith('cuart') || roomName.toLowerCase().startsWith('room') ?'':'Habitación';
 return`${prefix}${roomName}`;
 }
 const name = selectedMesa?.nombre || activeComanda?.mesa_nombre ||'Desconocida';
 const prefix = name.toLowerCase().startsWith('mesa') || name.toLowerCase().startsWith('hab') ?'':'Mesa';
 return`${prefix}${name}`;
 })()}
 </span>
 </div>
 </div>

 {/* Lista de Ítems — mismo patrón que ComandaItemRow: badge cuadrado + zebra */}
 <main className="flex-1 overflow-y-auto">
 {comandaItems.map((item, index) => {
 const isOdd = index % 2 === 1;
 return (
 <div key={item.id} className={cn("flex items-center gap-3 w-full px-4 py-3", isOdd &&"bg-muted/70")}>
 <div className="w-7 h-7 rounded-md font-bold text-xs flex items-center justify-center border shrink-0 bg-muted border-border text-foreground">
 {item.cantidad}
 </div>
 <div className="flex flex-col flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <span className="font-bold text-sm text-foreground truncate">{item.nombre}</span>
 <span className="font-black text-sm text-foreground shrink-0">
 ${(item.precio * item.cantidad).toFixed(2)}
 </span>
 </div>
 {item.modificadores && item.modificadores.length > 0 && (
 <div className="flex items-center gap-1 flex-wrap mt-0.5">
 {item.modificadores.map((mod: string, i: number) => (
 <span key={`${mod}-${i}`} className="px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground font-medium text-[10px]">
 {mod}
 </span>
 ))}
 </div>
 )}
 </div>
 </div>
 );
 })}
 </main>

 {/* Totales y Acciones — mismo bloque que SidebarDetails */}
 <footer className="p-4 border-t border-border bg-card flex flex-col gap-3 shrink-0">
 <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-muted/60 text-sm font-semibold text-muted-foreground">
 <div className="flex items-center justify-between">
 <span>Subtotal</span>
 <span className="font-bold text-foreground">${subtotal.toFixed(2)}</span>
 </div>
 <div className="flex items-center justify-between">
 <span>IVA ({ivaPorcentaje}%)</span>
 <span className="font-bold text-foreground">${ivaCalculado.toFixed(2)}</span>
 </div>
 <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
 <span className="text-base font-black text-foreground">Total Pagado</span>
 <span className="text-xl font-black text-emerald-600">${totalPagado.toFixed(2)}</span>
 </div>
 </div>

 <div className={cn("grid gap-2", esComandaEnHabitacionActiva ?"grid-cols-1":"grid-cols-2")}>
 <Button
 variant="secondary"className="w-full font-bold text-primary bg-primary/10"
 onClick={() => {
 const content = esComandaEnHabitacionActiva
 ? generarPrecuenta(activeComanda, comandaItems, selectedMesa.nombre, ivaPorcentaje, [], habitacionMesa?.nombre)
 : generarTicketPago(
 activeComanda,
 comandaItems,
 pagos,
 selectedMesa.nombre,
 ivaPorcentaje,
 undefined,
 habitacionMesa?.nombre
 );
 setPreviewContent(content);
 setPreviewTitle(esComandaEnHabitacionActiva ?`Imprimir Precuenta - ${selectedMesa.nombre}`:`Reimprimir Recibo - ${selectedMesa.nombre}`);
 setPreviewOnPrint(() => () => {
 if (esComandaEnHabitacionActiva) {
 queueReceiptPrint({
 comanda: activeComanda,
 items: comandaItems,
 mesaNombre: selectedMesa.nombre,
 ivaPorcentaje,
 habitacionNombre: habitacionMesa?.nombre,
 }).catch(err => console.warn('print server offline', err));
 } else {
 queueReprintTicket({
 rawText: content,
 mesaNombre: selectedMesa.nombre,
 comanda: activeComanda,
 }).catch(err => console.warn('print server offline', err));
 }
 });
 setPreviewOpened(true);
 }}
 >
 <Printer size={18} weight="bold"className="mr-1.5"/> {esComandaEnHabitacionActiva ?'Imprimir Precuenta':'Reimprimir'}
 </Button>

 {!esComandaEnHabitacionActiva && (
 <Button
 variant="secondary"className="w-full font-bold"
 onClick={() => setShowPagosModal(true)}
 >
 Ver Pagos
 </Button>
 )}
 </div>
 </footer>

 <SidebarPagosModal
 opened={showPagosModal}
 onClose={() => setShowPagosModal(false)}
 pagos={pagos}
 totalPagado={totalPagado}
 />

 <TicketPreviewModal
 opened={previewOpened}
 onClose={() => setPreviewOpened(false)}
 title={previewTitle}
 content={previewContent}
 onPrint={previewOnPrint ?? undefined}
 />
 </div>
 );
}
