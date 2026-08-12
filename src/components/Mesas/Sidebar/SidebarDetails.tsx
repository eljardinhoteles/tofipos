import { useState, useEffect, useMemo } from'react';
import { X, Plus, Printer, Trash, Minus, Check, Bed, Basket, CaretDown, Phone, EnvelopeSimple, MapPin, IdentificationCard, NotePencil, PencilSimple, Scissors, Buildings, User } from'@phosphor-icons/react';
import { type Mesa } from'../../../db/database';
import { showToast } from'@/lib/toast';
import { ComandaItemRow } from'./ComandaItemRow';
import { useIvaActivo } from'../../../hooks/useIvaActivo';
import { useRxClientes } from'../../../hooks/useRxClientes';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { SidebarPagosModal } from'./SidebarPagosModal';
import { SidebarCloseCuentaModal } from'./SidebarCloseCuentaModal';
import { generarComandaCocina } from'../../../services/printTemplateEngine';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';
import { ProductModifiersModal } from'../../Products/ProductModifiersModal';
import { createRxVenta, updateRxComanda, updateRxComandaItem, updateRxMesa } from'../../../db/rxdb';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import { useUI } from'../../../context/UIContext';
import { initVerticalRxDb } from'../../../db/rxdb';
import { queueKitchenPrint, queueReceiptPrint } from'../../../lib/printServerClient';
import { generarPrecuenta } from'../../../services/printTemplateEngine';
import { cn } from'@/lib/utils';
import { Button } from'@/components/ui/button';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
} from'@/components/ui/dialog';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from'@/components/ui/collapsible';
import { Input } from'@/components/ui/input';
import { ArrowCounterClockwise } from'@phosphor-icons/react';

const TIPO_CLIENTE_LABEL: Record<string, string> = {
 persona_natural:'Persona natural',
 juridico:'Jurídico',
 extranjero:'Extranjero',
 agencia:'Agencia',
};

interface SidebarDetailsProps {
 selectedMesa: Mesa;
 activeComanda: any;
 comandaItems: any[];
 onClose: () => void;
 onAddProduct: () => void;
 onAction: (mesa: Mesa, action: string) => void;
}

export function SidebarDetails({
 selectedMesa,
 activeComanda: activeComandaProp,
 comandaItems = [],
 onClose,
 onAddProduct,
 onAction,
}: SidebarDetailsProps) {
 const [previewOpened, setPreviewOpened] = useState(false);
 const [previewTitle, setPreviewTitle] = useState('');
 const [previewContent, setPreviewContent] = useState('');
 const [editingItem, setEditingItem] = useState<any | null>(null);
 const [showPagosModal, setShowPagosModal] = useState(false);

 const [closeCuentaModalOpen, setCloseCuentaModalOpen] = useState(false);
 const [closePayerName, setClosePayerName] = useState('');

 const [showRoomChargeModal, setShowRoomChargeModal] = useState(false);
 const [selectedRoomChargeId, setSelectedRoomChargeId] = useState<string | null>(null);
 const [activeRoomAccounts, setActiveRoomAccounts] = useState<any[]>([]);
 const [allMesas, setAllMesas] = useState<any[]>([]);
 const [clienteInfoOpen, setClienteInfoOpen] = useState(false);
 const [changeClienteModal, setChangeClienteModal] = useState(false);
 const [changeClienteName, setChangeClienteName] = useState('');
 const [changeClienteAutocomplete, setChangeClienteAutocomplete] = useState(false);
 const { clientes } = useRxClientes();

 const [editCantidad, setEditCantidad] = useState(1);
 const [editPrecio, setEditPrecio] = useState(0);

 const [liveComanda, setLiveComanda] = useState<any | null>(activeComandaProp || null);
 const [pagos, setPagos] = useState<any[]>([]);
 const [, setLinkedHabitacionCuenta] = useState<any | null>(null);
 const [linkedMesa, setLinkedMesa] = useState<any | null>(null);

 const { mesaView, setMesaView } = useUI();

 useEffect(() => {
 let alive = true;
 let subs: Array<{ unsubscribe: () => void }> = [];
 (async () => {
 const rxDb = await initVerticalRxDb();
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 const refresh = async () => {
 if (!activeComandaProp?.id) return;
 const c = await rxDb.comandas.findOne(activeComandaProp.id).exec();
 if (!alive) return;
 setLiveComanda(c ? c.toJSON() : activeComandaProp);
 const p = await rxDb.pagos.find({ selector: { comanda_id: activeComandaProp.id, _deleted: { $ne: true } } }).exec();
 if (!alive) return;
 setPagos(p.map((d: any) => d.toJSON()));
 const hc = activeComandaProp.habitacion_cuenta_id
 ? await rxDb.habitacion_cuentas.findOne(activeComandaProp.habitacion_cuenta_id).exec()
 : null;
 if (!alive) return;
 const hcJson = hc ? hc.toJSON() : null;
 setLinkedHabitacionCuenta(hcJson);
 if (!hcJson) {
 setLinkedMesa(null);
 } else {
 const roomMesa = await rxDb.mesas.findOne(hcJson.mesa_id).exec();
 if (!alive) return;
 setLinkedMesa(roomMesa ? roomMesa.toJSON() : null);
 }
 const rac = await rxDb.habitacion_cuentas.find({ selector: { organization_id: orgId, estado:'activa', _deleted: { $ne: true } } }).exec();
 if (!alive) return;
 setActiveRoomAccounts(rac.map((d: any) => d.toJSON()));
 const ms = await rxDb.mesas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).exec();
 if (!alive) return;
 setAllMesas(ms.map((d: any) => d.toJSON()));
 };
 await refresh();
 if (activeComandaProp?.id) {
 subs.push(rxDb.comandas.findOne(activeComandaProp.id).$.subscribe(() => refresh()));
 subs.push(rxDb.pagos.find({ selector: { comanda_id: activeComandaProp.id, _deleted: { $ne: true } } }).$.subscribe(() => refresh()));
 }
 })().catch(() => {});
 return () => {
 alive = false;
 subs.forEach(s => s.unsubscribe());
 };
 }, [activeComandaProp?.id, activeComandaProp?.habitacion_cuenta_id]);

 useEffect(() => {
 if (closeCuentaModalOpen && activeComandaProp) {
 setClosePayerName(activeComandaProp.cliente ||'Consumidor Final');
 }
 }, [closeCuentaModalOpen, activeComandaProp]);

 const activeComanda = liveComanda || activeComandaProp;

 // El cliente de la comanda se guarda solo como texto (nombre); si coincide
 // con un cliente registrado, mostramos su ficha completa en la subsección.
 const clienteVinculado = useMemo(() => {
 const nombre = activeComanda?.cliente?.trim();
 if (!nombre) return null;
 return clientes.find(c => c.nombre?.trim().toLowerCase() === nombre.toLowerCase()) || null;
 }, [activeComanda?.cliente, clientes]);

 useEffect(() => {
 if (editingItem) {
 setEditCantidad(editingItem.cantidad);
 setEditPrecio(editingItem.precio);
 }
 }, [editingItem]);

 const handleUpdateItem = async () => {
 if (!editingItem) return;
 if (editingItem.pagado_cantidad && editingItem.pagado_cantidad > 0) {
 showToast.error('Error','No se puede modificar un producto con unidades pagadas.');
 setEditingItem(null);
 return;
 }
 await updateRxComandaItem(editingItem.id, {
 cantidad: editCantidad,
 precio: editPrecio
 });

 if (activeComanda?.confirmada) {
 await updateRxComanda(activeComanda.id, { confirmada: false });
 }

 setEditingItem(null);
 };

 const handleDeleteItem = async () => {
 if (!editingItem) return;
 if (editingItem.pagado_cantidad && editingItem.pagado_cantidad > 0) {
 showToast.error('Error','No se puede eliminar un producto con unidades pagadas.');
 setEditingItem(null);
 return;
 }
 await updateRxComandaItem(editingItem.id, { _deleted: true });

 if (activeComanda?.confirmada) {
 await updateRxComanda(activeComanda.id, { confirmada: false });
 }

 setEditingItem(null);
 };

 const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
 const { menuItems } = useRxMenuCatalog();

 const [editingModifiers, setEditingModifiers] = useState(false);
 const editingMenuItem = useMemo(
 () => editingItem ? menuItems.find(m => m.id === editingItem.item_id) : null,
 [editingItem, menuItems]
 );

 const handleUpdateModifiers = async (selected: string[]) => {
 if (!editingItem) return;
 await updateRxComandaItem(editingItem.id, { modificadores: selected });
 if (activeComanda?.confirmada) {
 await updateRxComanda(activeComanda.id, { confirmada: false });
 }
 setEditingModifiers(false);
 setEditingItem(null);
 };

 const withBebida = (items: any[]) =>
 items.map(item => ({
 ...item,
 es_bebida: menuItems.find(m => m.id === item.item_id)?.es_bebida || false,
 }));

 // Clientes únicos para autocompletar en el flujo de cambio de cliente
 const uniqueClientNames = useMemo(
 () => Array.from(new Set(clientes.map(c => c.nombre).filter(Boolean))),
 [clientes]
 );
 const filteredChangeClientes = uniqueClientNames
 .filter(nombre => nombre.toLowerCase().includes(changeClienteName.toLowerCase()) && nombre !== changeClienteName)
 .slice(0, 5);

 const handleOpenChangeCliente = () => {
 setChangeClienteName(activeComanda?.cliente ||'');
 setChangeClienteModal(true);
 };

 const handleConfirmChangeCliente = async () => {
 if (!activeComanda) return;
 await updateRxComanda(activeComanda.id, { cliente: changeClienteName.trim() || undefined });
 setChangeClienteModal(false);
 };

 const totales = useMemo(
 () => calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva),
 [comandaItems, menuItems, ivaPorcentaje, preciosConIva]
 );
 const subtotal = totales.subtotalNeto;
 const ivaCalculado = totales.ivaTotal;
 const total = totales.total;
 const totalItems = useMemo(
 () => comandaItems.reduce((acc, item) => acc + (item.cantidad || 0), 0),
 [comandaItems]
 );
 const totalPagado = useMemo(() => pagos.reduce((acc, p) => acc + p.monto, 0), [pagos]);
 const saldoPendiente = Math.max(0, total - totalPagado);

 const cantidadesSnapshot = useMemo(() => {
 try {
 return activeComanda?.cantidades_snapshot
 ? JSON.parse(activeComanda.cantidades_snapshot)
 : {};
 } catch { return {}; }
 }, [activeComanda?.cantidades_snapshot]);

 const itemsRealmenteNuevos = useMemo(() => activeComanda?.confirmada_at
 ? comandaItems.filter(item =>
 item.created_at && item.created_at > activeComanda.confirmada_at
 )
 : [], [activeComanda?.confirmada_at, comandaItems]);

 const itemsConCantidadExtra = useMemo(() => activeComanda?.confirmada_at
 ? comandaItems
 .filter(item => {
 const cantConfirmada = cantidadesSnapshot[item.id];
 return cantConfirmada !== undefined && item.cantidad > cantConfirmada;
 })
 .map(item => ({
 ...item,
 cantidad: item.cantidad - cantidadesSnapshot[item.id],
 }))
 : [], [activeComanda?.confirmada_at, comandaItems, cantidadesSnapshot]);

 const itemsNuevos = useMemo(() => [...itemsRealmenteNuevos, ...itemsConCantidadExtra], [itemsRealmenteNuevos, itemsConCantidadExtra]);
 const hayItemsNuevos = itemsNuevos.length > 0;

 const handlePrintPrecuenta = () => {
 const content = generarPrecuenta(
 activeComanda,
 comandaItems,
 selectedMesa.nombre,
 linkedMesa?.nombre
 );
 setPreviewContent(content);
 setPreviewTitle(`Pre-cuenta - ${selectedMesa.nombre}`);
 setPreviewOpened(true);
 queueReceiptPrint({
 comanda: activeComanda,
 items: comandaItems,
 mesaNombre: selectedMesa.nombre,
 ivaPorcentaje,
 habitacionNombre: linkedMesa?.nombre,
 }).catch(err => console.warn('print server offline', err));
 };

 const handleConfirmOrder = async () => {
 if (!activeComanda?.confirmada) {
 const ahora = new Date().toISOString();
 const snapshot = Object.fromEntries(
 comandaItems.map(item => [item.id, item.cantidad])
 );
 await updateRxComanda(activeComanda.id, {
 confirmada: true,
 confirmada_at: ahora,
 cantidades_snapshot: JSON.stringify(snapshot)
 });
 queueKitchenPrint({
 comanda: activeComanda,
 items: withBebida(comandaItems),
 mesaNombre: selectedMesa.nombre,
 esAdicional: false,
 habitacionNombre: linkedMesa?.nombre,
 }).catch(err => console.warn('print server offline', err));
 showToast.success('Orden Confirmada','La comanda fue enviada a cocina.');
 } else if (hayItemsNuevos) {
 const content = generarComandaCocina(
 activeComanda,
 withBebida(itemsNuevos),
 selectedMesa.nombre,
 true,
 linkedMesa?.nombre
 );
 setPreviewContent(content);
 setPreviewTitle(`Adicional Cocina - ${selectedMesa.nombre}`);
 setPreviewOpened(true);
 const nuevoSnapshot = Object.fromEntries(
 comandaItems.map(item => [item.id, item.cantidad])
 );
 await updateRxComanda(activeComanda.id, {
 confirmada_at: new Date().toISOString(),
 cantidades_snapshot: JSON.stringify(nuevoSnapshot)
 });
 queueKitchenPrint({
 comanda: activeComanda,
 items: withBebida(itemsNuevos),
 mesaNombre: selectedMesa.nombre,
 esAdicional: true,
 habitacionNombre: linkedMesa?.nombre,
 }).catch(err => console.warn('print server offline', err));
 } else {
 const content = generarComandaCocina(
 activeComanda,
 withBebida(comandaItems),
 selectedMesa.nombre,
 false,
 linkedMesa?.nombre
 );
 setPreviewContent(content);
 setPreviewTitle(`Orden de Cocina - ${selectedMesa.nombre}`);
 setPreviewOpened(true);
 queueKitchenPrint({
 comanda: activeComanda,
 items: withBebida(comandaItems),
 mesaNombre: selectedMesa.nombre,
 esAdicional: false,
 habitacionNombre: linkedMesa?.nombre,
 }).catch(err => console.warn('print server offline', err));
 }
 };

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 {/* Header — en desktop el fondo completo toma el color de estado (verde/naranja);
 en móvil el fondo queda neutro y solo el badge de mesa lleva el color, ya que
 un header sólido se veía mal dentro del bottom-sheet redondeado. */}
 <header className={cn("p-4 flex items-center justify-between shrink-0 shadow-xs bg-card text-foreground",
 activeComanda?.estado ==='cuenta'?"md:bg-orange-600 md:text-white":"md:bg-primary md:text-primary-foreground")}>
 <div className="flex items-center gap-3">
 <div className={cn("w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0",
 activeComanda?.estado ==='cuenta'?"bg-orange-600 text-white md:bg-white/15":"bg-primary text-primary-foreground md:bg-primary-foreground/15")}>
 {selectedMesa.nombre.replace(/^Mesa\s*/i,'')}
 </div>
 <div className="flex flex-col">
 <h3 className={cn("font-extrabold text-base leading-tight", activeComanda?.estado ==='cuenta'?"md:text-white":"md:text-primary-foreground")}>
 {activeComanda?.cliente ||'Público General'}
 </h3>
 <div className="flex items-center gap-1.5">
 <span className={cn("text-[10px] font-bold text-muted-foreground", activeComanda?.estado ==='cuenta'?"md:text-white/70":"md:text-primary-foreground/70")}>
 ORDEN #{activeComanda?.folio} · {selectedMesa.nombre}
 </span>
 {linkedMesa && (
 <span className={cn("flex items-center gap-1 w-fit px-1.5 py-0.5 rounded-md text-[10px] font-extrabold",
 activeComanda?.estado ==='cuenta'?"bg-orange-600/10 text-orange-600 md:bg-white/20 md:text-white":"bg-primary/10 text-primary md:bg-primary-foreground/20 md:text-primary-foreground")}>
 <Bed size={11} weight="fill"/>
 Hab. {linkedMesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || linkedMesa.nombre}
 </span>
 )}
 </div>
 </div>
 </div>

 <Button
 variant="ghost"size="icon-lg"onClick={onClose}
 className={cn("rounded-xl text-muted-foreground",
 activeComanda?.estado ==='cuenta'?"md:text-white":"md:text-primary-foreground")}
 >
 <X size={18} weight="bold"/>
 </Button>
 </header>

 {/* Datos del cliente, colapsable — siempre visible para poder cambiar el cliente */}
 <Collapsible open={clienteInfoOpen} onOpenChange={setClienteInfoOpen} className="shrink-0 border-b border-border">
 <div className="w-full flex items-center justify-between px-4 py-2.5 transition-colors">
 <CollapsibleTrigger className="flex-1 flex items-center gap-2 cursor-pointer">
 <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
 <IdentificationCard size={14} />
 Datos del Cliente
 </span>
 <CaretDown
 size={14}
 className={cn("text-muted-foreground transition-transform", clienteInfoOpen &&"rotate-180")}
 />
 </CollapsibleTrigger>
 <Button
 variant="ghost"size="icon-sm"onClick={handleOpenChangeCliente}
 title="Cambiar cliente"className="text-muted-foreground shrink-0">
 <PencilSimple size={14} />
 </Button>
 </div>
 <CollapsibleContent>
 <div className="px-4 pb-3 flex flex-col gap-2 text-xs">
 {linkedMesa && (
 <div className="flex items-center gap-2 text-foreground">
 <Bed size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">
 Habitación {linkedMesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || linkedMesa.nombre}
 </span>
 </div>
 )}
 {clienteVinculado ? (
 <>
 {clienteVinculado.tipo_cliente && (
 <div className="flex items-center gap-2 text-foreground">
 <User size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">
 {TIPO_CLIENTE_LABEL[clienteVinculado.tipo_cliente] ?? clienteVinculado.tipo_cliente}
 </span>
 </div>
 )}
 {clienteVinculado.telefono && (
 <div className="flex items-center gap-2 text-foreground">
 <Phone size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.telefono}</span>
 </div>
 )}
 {clienteVinculado.email && (
 <div className="flex items-center gap-2 text-foreground">
 <EnvelopeSimple size={14} className="text-primary shrink-0"/>
 <span className="font-semibold truncate select-text cursor-text">{clienteVinculado.email}</span>
 </div>
 )}
 {clienteVinculado.direccion && (
 <div className="flex items-center gap-2 text-foreground">
 <MapPin size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.direccion}</span>
 </div>
 )}
 {clienteVinculado.dni && (
 <div className="flex items-center gap-2 text-foreground">
 <IdentificationCard size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.dni}</span>
 </div>
 )}
 {clienteVinculado.notas && (
 <div className="flex items-start gap-2 text-muted-foreground">
 <NotePencil size={14} className="text-primary shrink-0 mt-0.5"/>
 <span className="italic select-text cursor-text">{clienteVinculado.notas}</span>
 </div>
 )}
 {!clienteVinculado.telefono && !clienteVinculado.email && !clienteVinculado.direccion && !clienteVinculado.dni && !clienteVinculado.notas && (
 <span className="text-muted-foreground">Sin datos adicionales registrados.</span>
 )}

 {(clienteVinculado.nombre_factura || clienteVinculado.numero_doc || clienteVinculado.direccion_fiscal || clienteVinculado.email_factura) && (
 <div className="flex flex-col gap-2 pt-2 mt-1 border-t border-border/60">
 <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
 <Buildings size={12} /> Facturación
 </span>
 {clienteVinculado.nombre_factura && (
 <div className="flex items-center gap-2 text-foreground">
 <User size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.nombre_factura}</span>
 </div>
 )}
 {clienteVinculado.numero_doc && (
 <div className="flex items-center gap-2 text-foreground">
 <IdentificationCard size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">
 {clienteVinculado.tipo_doc ?`${clienteVinculado.tipo_doc.toUpperCase()}: ${clienteVinculado.numero_doc}`: clienteVinculado.numero_doc}
 </span>
 </div>
 )}
 {clienteVinculado.direccion_fiscal && (
 <div className="flex items-center gap-2 text-foreground">
 <MapPin size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.direccion_fiscal}</span>
 </div>
 )}
 {clienteVinculado.email_factura && (
 <div className="flex items-center gap-2 text-foreground">
 <EnvelopeSimple size={14} className="text-primary shrink-0"/>
 <span className="font-semibold truncate select-text cursor-text">{clienteVinculado.email_factura}</span>
 </div>
 )}
 </div>
 )}
 </>
 ) : (
 <span className="text-muted-foreground">
 {activeComanda?.cliente ?'Cliente no registrado en la base de datos.':'Sin cliente asignado — Público General.'}
 </span>
 )}
 </div>
 </CollapsibleContent>
 </Collapsible>

 {/* Lista de productos */}
 <main className="flex-1 overflow-y-auto">
 {comandaItems.length === 0 ? (
 <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
 <Basket size={48} className="text-muted-foreground/40"/>
 <span className="font-bold text-xs text-foreground">Comanda vacía</span>
 <span className="text-[11px] text-muted-foreground">Añade productos usando el menú.</span>
 </div>
 ) : (
 <div className="flex flex-col">
 {comandaItems.map((item, index) => (
 <ComandaItemRow
 key={item.id}
 item={item}
 index={index}
 isSelected={editingItem?.id === item.id}
 onClick={() => setEditingItem(item)}
 />
 ))}
 </div>
 )}
 </main>

 {!editingItem && activeComanda?.estado !=='cuenta'&& (
 <Button
 className="w-full h-8 rounded-none border-0 font-bold text-xs bg-primary text-primary-foreground shrink-0"onClick={mesaView ==='productos'? () => setMesaView('mapa') : onAddProduct}
 >
 <Basket size={14} weight="bold"className="mr-1.5"/>
 Añadir Productos {totalItems > 0 &&`· Total Items: ${totalItems}`}
 </Button>
 )}

 {/* Footer y Acciones */}
 <footer className={cn("p-4 bg-card flex flex-col gap-3 shrink-0",
 (editingItem || activeComanda?.estado ==='cuenta') &&"border-t border-border")}>
 {!editingItem ? (
 <>
 <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-muted/60 text-sm font-semibold text-muted-foreground">
 <div className="flex items-center justify-between">
 <span>Subtotal</span>
 <span className="font-bold text-foreground">${subtotal.toFixed(2)}</span>
 </div>
 <div className="flex items-center justify-between">
 <span>IVA {ivaPorcentaje}%</span>
 <span className="font-bold text-foreground">${ivaCalculado.toFixed(2)}</span>
 </div>
 <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
 <span className="text-base font-black text-foreground">Total</span>
 <span className="text-xl font-black text-primary">${total.toFixed(2)}</span>
 </div>
 {/* Cuenta dividida (SidebarSplit) registra pagos parciales por
 persona/ítem antes del cierre — sin esto no había forma de ver
 cuánto ya se cobró sin abrir el modal de pagos aparte. */}
 {totalPagado > 0 && (
 <>
 <div className="flex items-center justify-between pt-2 mt-1 border-t border-border text-emerald-600">
 <span className="font-bold">Ya cobrado</span>
 <span className="font-black">${totalPagado.toFixed(2)}</span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-base font-black text-foreground">Restante</span>
 <span className="text-xl font-black text-orange-600">${saldoPendiente.toFixed(2)}</span>
 </div>
 </>
 )}
 </div>

 {activeComanda?.estado !=='cuenta'? (
 <div className="grid grid-cols-2 gap-2">
 <Button
 variant={!activeComanda?.confirmada ?"default":"secondary"}
 className={cn("w-full font-bold", !activeComanda?.confirmada ?"":"bg-muted text-foreground")}
 onClick={handleConfirmOrder}
 disabled={comandaItems.length === 0}
 >
 {!activeComanda?.confirmada ? (
 <Check size={18} weight="bold"className="mr-1.5"/>
 ) : (
 <Printer size={18} weight="bold"className="mr-1.5"/>
 )}
 {!activeComanda?.confirmada
 ?'Confirmar': hayItemsNuevos
 ?`Adicional (${itemsNuevos.length})`:'Reimprimir'}
 </Button>
 <Button
 variant="secondary"className="w-full font-bold text-primary bg-primary/10"onClick={() => onAction(selectedMesa,'cuenta')}
 disabled={total === 0}
 >
 <Check size={18} weight="bold"className="mr-1.5"/>
 Pedir Cuenta
 </Button>

 <Button
 variant="secondary"className="w-full font-bold text-blue-600 bg-blue-50"onClick={() => {
 if (activeRoomAccounts.length === 0) {
 showToast.error('Aviso','No hay habitaciones activas para cargar.');
 return;
 }
 setShowRoomChargeModal(true);
 }}
 disabled={comandaItems.length === 0}
 >
 <Bed size={18} weight="bold"className="mr-1.5"/> Cargar Hab.
 </Button>
 <Button
 variant="ghost"className="w-full font-bold text-destructive"onClick={() => onAction(selectedMesa,'cancelar')}
 >
 Anular
 </Button>
 </div>
 ) : (
 <div className="grid grid-cols-2 gap-2">
 <Button
 variant="secondary"className="w-full font-bold text-amber-600 bg-amber-50"onClick={handlePrintPrecuenta}
 >
 <Printer size={18} weight="bold"className="mr-1.5"/> Pre-cuenta
 </Button>
 <Button
 className="w-full font-bold bg-primary text-primary-foreground"onClick={() => setCloseCuentaModalOpen(true)}
 disabled={total === 0}
 >
 <Check size={18} weight="bold"className="mr-1.5"/> Cobrar Cuenta
 </Button>

 <Button
 variant="secondary"className="w-full font-bold text-violet-600 bg-violet-50"onClick={() => onAction(selectedMesa,'dividido')}
 disabled={total === 0}
 >
 <Scissors size={18} weight="bold"className="mr-1.5"/> Dividir Cuenta
 </Button>
 <Button
 variant="secondary"className="w-full font-bold text-muted-foreground bg-muted"onClick={() => onAction(selectedMesa,'reabrir')}
 >
 <ArrowCounterClockwise size={18} weight="bold"className="mr-1.5"/> Reabrir
 </Button>
 </div>
 )}
 </>
 ) : (
 <div className="flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <span className="font-extrabold text-xs text-foreground">Editando Producto</span>
 <Button variant="ghost"size="icon"className="h-6 w-6"onClick={() => setEditingItem(null)}>
 <X size={14} />
 </Button>
 </div>

 <div className="flex items-center justify-center gap-4">
 <Button
 variant="outline"size="icon"className="h-8 w-8 rounded-full"onClick={() => setEditCantidad(Math.max(1, editCantidad - 1))}
 >
 <Minus size={14} />
 </Button>
 <span className="font-black text-lg text-foreground w-6 text-center">{editCantidad}</span>
 <Button
 variant="outline"size="icon"className="h-8 w-8 rounded-full"onClick={() => setEditCantidad(editCantidad + 1)}
 >
 <Plus size={14} />
 </Button>
 </div>

 {editingMenuItem?.modificadores && editingMenuItem.modificadores.length > 0 && (
 <Button
 type="button"variant="secondary"className="w-full font-bold text-primary bg-primary/10"onClick={() => setEditingModifiers(true)}
 >
 Editar opciones
 </Button>
 )}

 <div className="grid grid-cols-2 gap-2">
 <Button
 variant="destructive"className="w-full bg-destructive/10 text-destructive"onClick={handleDeleteItem}
 >
 <Trash size={14} className="mr-1"/> Eliminar
 </Button>
 <Button
 className="w-full"onClick={handleUpdateItem}
 >
 Guardar
 </Button>
 </div>
 </div>
 )}
 </footer>

 <SidebarPagosModal
 opened={showPagosModal}
 onClose={() => setShowPagosModal(false)}
 pagos={pagos}
 totalPagado={totalPagado}
 />

 <SidebarCloseCuentaModal
 opened={closeCuentaModalOpen}
 onClose={() => setCloseCuentaModalOpen(false)}
 saldoPendiente={saldoPendiente}
 closePayerName={closePayerName}
 setClosePayerName={setClosePayerName}
 onConfirm={async () => {
 if (!activeComanda) return;
 try {
 if (saldoPendiente > 0.01) {
 await updateRxComanda(activeComanda.id, {
 total: total,
 updated_at: new Date().toISOString(),
 confirmada: true,
 estado: activeComanda.estado ==='cuenta'?'cuenta': activeComanda.estado,
 _modified: new Date().toISOString(),
 });
 // Sin método: se define después al anclar en Centro de Ventas.
 await createRxVenta({
 id: crypto.randomUUID(),
 origen:'mesa',
 tipo:'directa',
 cliente_id: activeComanda.cliente_id || undefined,
 cliente_nombre: closePayerName?.trim() || activeComanda.cliente || undefined,
 referencia: `Mesa ${activeComanda.mesa_nombre || selectedMesa.nombre} · #${activeComanda.folio}`,
 comanda_id: activeComanda.id,
 organization_id: activeComanda.organization_id || localStorage.getItem('pos_active_org_id') ||'',
 }, saldoPendiente);
 }

 showToast.success('Ticket de Cierre',`Imprimiendo precuenta de ${selectedMesa.nombre}...`);

 await updateRxComanda(activeComanda.id, {
 estado:'cerrado',
 mesa_nombre: activeComanda.mesa_nombre || selectedMesa.nombre,
 });

 setCloseCuentaModalOpen(false);
 onClose();
 } catch (error) {
 console.error(error);
 showToast.error('Error','Hubo un error al cerrar la cuenta.');
 }
 }}
 />

 <Dialog open={showRoomChargeModal} onOpenChange={setShowRoomChargeModal}>
 <DialogContent className="max-w-md p-6 gap-4 border border-border shadow-2xl">
 <DialogHeader className="border-b border-border pb-3 text-left">
 <DialogTitle className="font-extrabold text-base text-foreground">
 Cargar a habitación abierta
 </DialogTitle>
 <DialogDescription className="text-xs text-muted-foreground">
 Selecciona una habitación activa para transferir la comanda #{activeComanda?.folio}.
 </DialogDescription>
 </DialogHeader>

 <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
 {activeRoomAccounts.map((cuenta) => {
 const roomMesa = allMesas.find((m) => m.id === cuenta.mesa_id);
 const fullName = roomMesa?.nombre || cuenta.mesa_id;
 const roomNum = fullName.match(/Hab\.\s*(\d+)/)?.[1] || fullName.split('')[0];
 const roomType = fullName.match(/\(([^)]+)\)/)?.[1] ||'';
 const isSelected = selectedRoomChargeId === cuenta.id;

 return (
 <button
 key={cuenta.id}
 type="button"onClick={() => setSelectedRoomChargeId(cuenta.id)}
 className={cn("flex items-center justify-between p-3 rounded-2xl border-2 transition-all cursor-pointer text-left select-none",
 isSelected
 ?"border-primary bg-primary/10 shadow-sm":"border-border bg-card")}
 >
 <div className="flex items-center gap-3 min-w-0">
 <div className={cn("w-10 h-10 rounded-xl flex flex-col items-center justify-center font-black text-sm shrink-0 leading-none",
 isSelected ?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground")}>
 <span className="text-[9px] uppercase font-extrabold opacity-70">HAB</span>
 <span>{roomNum}</span>
 </div>
 <div className="flex flex-col min-w-0">
 <span className="font-extrabold text-sm text-foreground truncate">{cuenta.huesped}</span>
 {roomType && <span className="text-xs font-semibold text-muted-foreground truncate">{roomType}</span>}
 </div>
 </div>
 {isSelected && (
 <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
 <Check size={14} weight="bold"/>
 </div>
 )}
 </button>
 );
 })}
 </div>

 <div className="flex flex-col gap-2 pt-3 border-t border-border">
 <Button
 type="button"onClick={async () => {
 if (!selectedRoomChargeId || !activeComanda) return;
 await updateRxComanda(activeComanda.id, {
 habitacion_cuenta_id: selectedRoomChargeId,
 total,
 confirmada: true,
 sincronizado: true,
 });
 await updateRxMesa(activeComanda.mesa_id, { estado:'libre'});
 setShowRoomChargeModal(false);
 showToast.success('Transferencia exitosa','La comanda fue asignada a la habitación.');
 onClose();
 }}
 disabled={!selectedRoomChargeId}
 className="w-full bg-primary text-primary-foreground font-bold h-11 text-sm shadow-md">
 Transferir a Habitación
 </Button>
 <Button
 type="button"variant="ghost"onClick={() => setShowRoomChargeModal(false)}
 className="w-full text-muted-foreground">
 Cancelar
 </Button>
 </div>
 </DialogContent>
 </Dialog>

 <Dialog open={changeClienteModal} onOpenChange={setChangeClienteModal}>
 <DialogContent className="max-w-sm">
 <DialogHeader>
 <DialogTitle>Cambiar Cliente</DialogTitle>
 <DialogDescription>
 Escribe el nombre del cliente para esta comanda. Puedes elegir uno registrado o escribir uno nuevo.
 </DialogDescription>
 </DialogHeader>
 <div className="relative">
 <Input
 type="text"autoFocus
 placeholder="Consumidor Final (Defecto)"value={changeClienteName}
 onChange={(e) => {
 setChangeClienteName(e.target.value);
 setChangeClienteAutocomplete(true);
 }}
 onFocus={() => setChangeClienteAutocomplete(true)}
 onBlur={() => setTimeout(() => setChangeClienteAutocomplete(false), 200)}
 className="w-full"/>
 {changeClienteAutocomplete && filteredChangeClientes.length > 0 && (
 <div className="absolute top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden z-10 flex flex-col">
 {filteredChangeClientes.map((nombre, idx) => (
 <button
 key={idx}
 type="button"onClick={() => {
 setChangeClienteName(nombre);
 setChangeClienteAutocomplete(false);
 }}
 className="w-full text-left px-3 py-2 text-sm font-medium transition-colors">
 {nombre}
 </button>
 ))}
 </div>
 )}
 </div>
 <div className="flex items-center justify-end gap-2 pt-2">
 <Button variant="outline"onClick={() => setChangeClienteModal(false)}>
 Cancelar
 </Button>
 <Button onClick={handleConfirmChangeCliente}>
 Guardar
 </Button>
 </div>
 </DialogContent>
 </Dialog>

 <TicketPreviewModal
 opened={previewOpened}
 onClose={() => setPreviewOpened(false)}
 title={previewTitle}
 content={previewContent}
 />

 <ProductModifiersModal
 key={editingItem?.id}
 opened={editingModifiers}
 onClose={() => setEditingModifiers(false)}
 product={editingMenuItem}
 onConfirm={handleUpdateModifiers}
 />
 </div>
 );
}
