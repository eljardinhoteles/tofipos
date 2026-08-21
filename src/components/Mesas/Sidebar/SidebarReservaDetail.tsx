import { useEffect, useState, useMemo } from'react';
import {
 ArrowLeft, X, Plus, CreditCard, PencilSimple, Prohibit, CaretDown, CaretUp,
 DownloadSimple, Printer, Paperclip, Phone, WhatsappLogo, EnvelopeSimple,
 MapPin, IdentificationCard, NotePencil, User, Buildings,
} from'@phosphor-icons/react';
import { ComandaItemRow } from'./ComandaItemRow';
import { SidebarReservaAbonoModal } from'./SidebarReservaAbonoModal';
import { useUI } from'../../../context/UIContext';
import { useAuth } from'../../../context/AuthContext';
import { useComandaIva } from'../../../hooks/useComandaIva';
import { useRxClientes } from'../../../hooks/useRxClientes';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { showToast } from'@/lib/toast';
import {
 initVerticalRxDb, updateRxComandaItem, createRxComanda, updateRxReserva,
 createRxVenta, agregarVentaMovimiento,
} from'../../../db/rxdb';
import { Button } from'@/components/ui/button';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';
import { generarTicketReserva } from'../../../services/printTemplateEngine';
import { queueReprintTicket } from'../../../lib/printServerClient';
import { downloadTicketReservaAsImage } from'../../../lib/ticketImage';
import { getOrgCache } from'../../../lib/orgCache';
import { subirComprobante, resolverComprobanteUrlAsync } from'@/lib/comprobantes';

/** Mismo criterio que ClientesV2: limpia el número y arma el deep link de WhatsApp. */
function getWhatsAppLink(telefono: string): string | null {
 const cleanNumber = telefono.replace(/\D/g, '');
 return cleanNumber ?`https://wa.me/${cleanNumber}`: null;
}

const TIPO_CLIENTE_LABEL: Record<string, string> = {
 persona_natural:'Persona natural',
 juridico:'Jurídico',
 extranjero:'Extranjero',
 agencia:'Agencia',
};

/** Link al comprobante adjunto de un abono — resuelve la URL (R2 o blob local offline) al montar. */
function PagoComprobanteLink({ url }: { url: string }) {
 const [href, setHref] = useState('');
 useEffect(() => {
 let alive = true;
 resolverComprobanteUrlAsync(url).then((resolved) => { if (alive) setHref(resolved); });
 return () => { alive = false; };
 }, [url]);

 if (!href) return null;
 return (
 <a
 href={href} target="_blank" rel="noreferrer"title="Ver comprobante"
 className="shrink-0 w-6 h-6 rounded-md bg-card border border-border flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
 >
 <Paperclip size={12} weight="bold" />
 </a>
 );
}

interface SidebarReservaDetailProps {
 reservaId: string;
 onBack: () => void;
 onClose: () => void;
}

export function SidebarReservaDetail({ reservaId, onBack, onClose: onCloseSidebar }: SidebarReservaDetailProps) {
 const { setReservaProductosComandaId, setReservaView, openConfirm } = useUI();
 const { currentMesero } = useAuth();
 const { clientes } = useRxClientes();
 const [previewOpened, setPreviewOpened] = useState(false);
 const [previewTitle, setPreviewTitle] = useState('');
 const [previewContent, setPreviewContent] = useState('');
 const [isCreatingComanda, setIsCreatingComanda] = useState(false);
 const [abonoModalOpen, setAbonoModalOpen] = useState(false);
 const [showAbonos, setShowAbonos] = useState(false);
 const [showContacto, setShowContacto] = useState(false);
 const [isDownloadingImage, setIsDownloadingImage] = useState(false);

 const [reserva, setReserva] = useState<any | null>(null);
 const [comandaItems, setComandaItems] = useState<any[]>([]);
 // Venta vinculada a la comanda de la reserva (Centro de Ventas) — es la
 // fuente de verdad de los abonos, no la colección legacy `pagos`.
 const [venta, setVenta] = useState<any | null>(null);
 const [comanda, setComanda] = useState<any | null>(null);
 const [zonas, setZonas] = useState<any[]>([]);
 const [, setMesas] = useState<any[]>([]);

 const [editingItem, setEditingItem] = useState<any | null>(null);
 const [editCantidad, setEditCantidad] = useState(1);
 const [editPrecio, setEditPrecio] = useState(0);

 const { porcentaje: ivaPorcentaje, preciosConIva } = useComandaIva(comanda);
 const { menuItems } = useRxMenuCatalog();

 useEffect(() => {
 let alive = true;
 let subs: Array<{ unsubscribe: () => void }> = [];
 // Suscripciones a comanda_items/pagos dependen de comanda_id, que solo se
 // conoce tras leer la reserva. Se re-crean cuando ese id cambia y se
 // liberan explícitamente (no forman parte de `subs`, que se limpia solo
 // al desmontar) para no ir apilando suscripciones huérfanas.
 let itemsSub: { unsubscribe: () => void } | null = null;
 let ventaSub: { unsubscribe: () => void } | null = null;
 let comandaSub: { unsubscribe: () => void } | null = null;
 let lastComandaId: string | undefined;

 (async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const orgId = localStorage.getItem('pos_active_org_id') ||'';

 subs.push(
 rxDb.pisos.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
 if (alive) setZonas(docs.map((d: any) => d.toJSON()));
 }),
 rxDb.mesas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
 if (alive) setMesas(docs.map((d: any) => d.toJSON()));
 }),
 rxDb.reservas.findOne(reservaId).$.subscribe((reservaDoc: any) => {
 if (!alive) return;
 const r = reservaDoc ? reservaDoc.toJSON() : null;
 setReserva(r);

 if (r?.comanda_id !== lastComandaId) {
 lastComandaId = r?.comanda_id;
 itemsSub?.unsubscribe();
 ventaSub?.unsubscribe();
 comandaSub?.unsubscribe();
 itemsSub = null;
 ventaSub = null;
 comandaSub = null;

 if (r?.comanda_id) {
 itemsSub = rxDb.comanda_items.find({ selector: { comanda_id: r.comanda_id, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
 if (alive) setComandaItems(docs.map((d: any) => d.toJSON()));
 });
 ventaSub = rxDb.ventas.find({ selector: { comanda_id: r.comanda_id, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
 if (alive) setVenta(docs.length > 0 ? docs[0].toJSON() : null);
 });
 comandaSub = rxDb.comandas.findOne(r.comanda_id).$.subscribe((doc: any) => {
 if (alive) setComanda(doc ? doc.toJSON() : null);
 });
 } else {
 setComandaItems([]);
 setVenta(null);
 setComanda(null);
 }
 }
 })
 );
 })().catch(() => {});

 return () => {
 alive = false;
 subs.forEach(s => s.unsubscribe());
 itemsSub?.unsubscribe();
 ventaSub?.unsubscribe();
 comandaSub?.unsubscribe();
 };
 }, [reservaId]);

 useEffect(() => {
 if (editingItem) {
 setEditCantidad(editingItem.cantidad);
 setEditPrecio(editingItem.precio);
 }
 }, [editingItem]);

 const totales = useMemo(
 () => calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva),
 [comandaItems, menuItems, ivaPorcentaje, preciosConIva]
 );
 // Mismo cálculo que useVentasConMovimientos: suma de movimientos 'pago'
 // menos 'reembolso', ignorando los anulados.
 const totalAbonado = useMemo(() => {
 if (!venta?.movimientos) return 0;
 return venta.movimientos.reduce((acc: number, m: any) => {
 if (m.anulado) return acc;
 if (m.tipo === 'pago') return acc + (m.monto ?? 0);
 if (m.tipo === 'reembolso') return acc - (m.monto ?? 0);
 return acc;
 }, 0);
 }, [venta]);
 // Historial de movimientos de pago/reembolso, para el desglose del balance.
 const pagos = useMemo(() => {
 if (!venta?.movimientos) return [];
 return venta.movimientos
 .filter((m: any) => !m.anulado && (m.tipo === 'pago' || m.tipo === 'reembolso'))
 .sort((a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''));
 }, [venta]);

 const zonaNombre = useMemo(
 () => zonas.find((z: any) => z.id === reserva?.zona_id)?.nombre || '',
 [zonas, reserva?.zona_id]
 );

 // La reserva no guarda cliente_id (solo copia nombre/telefono/email al
 // crearse) — se enlaza por nombre exacto, igual que TableSidebar hace al
 // abrir mesa manualmente, para traer el resto de su ficha si existe.
 const clienteVinculado = useMemo(
 () => clientes.find((c: any) => c.nombre.trim().toLowerCase() === (reserva?.nombre || '').trim().toLowerCase()),
 [clientes, reserva?.nombre]
 );

 if (!reserva) return null;

 const isReadOnly = reserva.estado ==='completada'|| reserva.estado ==='cancelada';
 const total = totales.total;
 const saldoPendiente = Math.max(0, total - totalAbonado);

 const handleUpdateItem = async () => {
 if (!editingItem) return;
 await updateRxComandaItem(editingItem.id, { cantidad: editCantidad, precio: editPrecio });
 setEditingItem(null);
 };

 const handleDeleteItem = async () => {
 if (!editingItem) return;
 await updateRxComandaItem(editingItem.id, { _deleted: true });
 setEditingItem(null);
 };

 const handleAddProductos = async () => {
 if (isReadOnly) return;
 let comandaId = reserva.comanda_id;
 if (!comandaId) {
 // Reserva legacy sin comanda asociada (o borrada): crearla ahora.
 setIsCreatingComanda(true);
 try {
 const orgId = localStorage.getItem('pos_active_org_id') || '';
 const now = new Date().toISOString();
 const rxDb = await initVerticalRxDb();
 const nextFolio = (await rxDb.comandas.find().exec()).length + 1;
 const nueva = await createRxComanda({
 id: crypto.randomUUID(),
 folio: nextFolio,
 mesa_id: 'reserva_' + reserva.id,
 mesa_nombre: 'Reserva',
 mesero: 'Sistema',
 cliente: reserva.nombre,
 estado: 'pendiente',
 // Nace sin confirmar — se envía a cocina recién cuando el mesero la
 // confirma al asignar mesa (ver SidebarReservaNew).
 confirmada: false,
 organization_id: orgId,
 created_at: now,
 updated_at: now,
 });
 comandaId = nueva.id;
 await updateRxReserva(reserva.id, { comanda_id: comandaId });
 } finally {
 setIsCreatingComanda(false);
 }
 }
 setReservaProductosComandaId(comandaId);
 };

 const handleEditar = () => {
 setReservaView('nueva');
 };

 const handleAnular = () => {
 openConfirm(
 'ANULAR RESERVA',
 '¿Estás seguro de que deseas anular esta reserva? Podrás verla más tarde en el historial de canceladas.',
 async () => {
 try {
 await updateRxReserva(reserva.id, { estado: 'cancelada' });
 showToast.success('Reserva anulada');
 } catch (e) {
 console.error(e);
 showToast.error('No se pudo anular la reserva');
 }
 }
 );
 };

 const buildTicketContent = () => generarTicketReserva(
 reserva,
 comandaItems,
 zonaNombre,
 ivaPorcentaje,
 [],
 totalAbonado
 );

 const handleDescargarImagen = async () => {
 setIsDownloadingImage(true);
 try {
 const org = getOrgCache();
 downloadTicketReservaAsImage({
 orgName: org.nombre || 'EL JARDIN',
 orgTelefono: org.telefono || undefined,
 orgDireccion: org.direccion || undefined,
 estado: reserva.estado,
 cliente: reserva.nombre,
 fecha: reserva.fecha,
 hora: reserva.hora,
 personas: reserva.personas,
 zona: zonaNombre || undefined,
 telefono: reserva.telefono || undefined,
 nota: reserva.nota || undefined,
 items: comandaItems.filter((it: any) => !it.anulado).map((it: any) => ({
 cantidad: it.cantidad,
 nombre: it.nombre,
 precio: it.precio,
 modificadores: it.modificadores,
 nota: it.nota,
 })),
 ivaPercent: ivaPorcentaje,
 totalAbonado,
 pagos: pagos.map((m: any) => ({
 tipo: m.tipo,
 monto: m.monto ?? 0,
 metodo: m.metodo_pago,
 fecha: m.created_at,
 })),
 }, `reserva-${reserva.nombre.trim().replace(/\s+/g, '_')}`);
 } catch (e) {
 console.error(e);
 showToast.error('No se pudo generar la imagen del ticket');
 } finally {
 setIsDownloadingImage(false);
 }
 };

 const handleImprimirPrecuenta = () => {
 const content = buildTicketContent();
 setPreviewContent(content);
 setPreviewTitle(`Reserva - ${reserva.nombre}`);
 setPreviewOpened(true);
 };

 const handleConfirmPrint = () => {
 queueReprintTicket({
 rawText: previewContent,
 mesaNombre: `Reserva - ${reserva.nombre}`,
 comanda,
 }).catch(err => console.warn('print server offline', err));
 };

 const handleAbonar = async (data: {
 monto: number;
 metodo: 'efectivo' | 'tarjeta' | 'transferencia' | 'otros';
 bancoDestino?: string;
 numeroComprobante?: string;
 redTarjeta?: string;
 comprobanteFile?: File | null;
 }) => {
 try {
 const orgId = localStorage.getItem('pos_active_org_id') || '';
 let ventaId = venta?.id;

 if (!ventaId) {
 // Primer abono: nace la venta con el total del pedido como 'ajuste'
 // (el saldo a cobrar), igual que cualquier venta directa de mesa.
 const nueva = await createRxVenta({
 id: crypto.randomUUID(),
 origen: 'reserva_restaurante',
 tipo: 'directa',
 cliente_id: reserva.cliente_id || undefined,
 cliente_nombre: reserva.nombre,
 referencia: `Reserva · ${reserva.nombre} · ${reserva.fecha} ${reserva.hora}`,
 comanda_id: reserva.comanda_id,
 organization_id: orgId,
 usuario_id: currentMesero?.id,
 }, total);
 ventaId = nueva.id;
 }

 // Mismo flujo que RegistrarVentaPanel: se sube antes de crear el
 // movimiento para que este ya nazca con su comprobante_url y se
 // muestre en Centro de Ventas igual que cualquier otro pago.
 let comprobante_url: string | undefined;
 if (data.comprobanteFile) {
 comprobante_url = await subirComprobante(data.comprobanteFile, orgId, ventaId);
 }

 await agregarVentaMovimiento({
 venta_id: ventaId,
 tipo: 'pago',
 monto: data.monto,
 metodo_pago: data.metodo,
 transferencia_banco: data.bancoDestino,
 transferencia_referencia: data.numeroComprobante,
 tarjeta_red: data.redTarjeta,
 comprobante_url,
 usuario_id: currentMesero?.id,
 });

 await updateRxReserva(reserva.id, { abono: totalAbonado + data.monto });

 showToast.success('Abono registrado', `Se registró un abono de $${data.monto.toFixed(2)}.`);
 } catch (e) {
 console.error(e);
 showToast.error('No se pudo registrar el abono');
 }
 };

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 <header className="p-4 border-b border-border flex items-center justify-between shrink-0 shadow-xs">
 <div className="flex items-center gap-3">
 <button
 type="button"onClick={onBack}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <ArrowLeft size={18} weight="bold"/>
 </button>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground leading-tight">{reserva.nombre}</h3>
 <span className="text-[10px] font-bold text-muted-foreground uppercase">{reserva.estado}</span>
 </div>
 </div>

 <div className="flex items-center gap-1.5">
 {!isReadOnly && (
 <>
 <button
 type="button"onClick={handleEditar}title="Editar reserva"
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <PencilSimple size={16} weight="bold"/>
 </button>
 <button
 type="button"onClick={handleAnular}title="Anular reserva"
 className="w-9 h-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center cursor-pointer transition-colors">
 <Prohibit size={16} weight="bold"/>
 </button>
 </>
 )}
 <button
 type="button"onClick={onCloseSidebar}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <X size={18} weight="bold"/>
 </button>
 </div>
 </header>

 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
 {(() => {
 const telefono = reserva.telefono || clienteVinculado?.telefono;
 const email = reserva.email || clienteVinculado?.email;
 if (!telefono && !email && !clienteVinculado) return null;

 return (
 <div className="rounded-xl bg-muted border border-border text-xs overflow-hidden">
 <button
 type="button"
 onClick={() => setShowContacto(v => !v)}
 className="w-full flex items-center justify-between p-4"
 >
 <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Contacto del cliente</span>
 {showContacto ? <CaretUp size={12} weight="bold" className="text-muted-foreground"/> : <CaretDown size={12} weight="bold" className="text-muted-foreground"/>}
 </button>
 {showContacto && (
 <div className="flex flex-col gap-3 px-4 pb-4">
 {clienteVinculado?.tipo_cliente && (
 <div className="flex items-center gap-2 text-foreground">
 <User size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">
 {TIPO_CLIENTE_LABEL[clienteVinculado.tipo_cliente] ?? clienteVinculado.tipo_cliente}
 </span>
 </div>
 )}
 {telefono && (
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 min-w-0 text-foreground">
 <Phone size={14} className="text-primary shrink-0"/>
 <span className="font-bold select-text cursor-text truncate">{telefono}</span>
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 <a
 href={`tel:${telefono}`}title="Llamar"
 className="w-8 h-8 rounded-lg bg-card border border-border text-primary flex items-center justify-center hover:bg-primary/10 transition-colors"
 >
 <Phone size={14} weight="bold"/>
 </a>
 {getWhatsAppLink(telefono) && (
 <a
 href={getWhatsAppLink(telefono)!}target="_blank"rel="noreferrer"title="Enviar WhatsApp"
 className="w-8 h-8 rounded-lg bg-card border border-border text-emerald-600 flex items-center justify-center hover:bg-emerald-50 transition-colors"
 >
 <WhatsappLogo size={16} weight="fill"/>
 </a>
 )}
 </div>
 </div>
 )}
 {email && (
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 min-w-0 text-foreground">
 <EnvelopeSimple size={14} className="text-primary shrink-0"/>
 <span className="font-bold select-text cursor-text truncate">{email}</span>
 </div>
 <a
 href={`mailto:${email}`}title="Enviar correo"
 className="w-8 h-8 rounded-lg bg-card border border-border text-primary flex items-center justify-center hover:bg-primary/10 transition-colors shrink-0"
 >
 <EnvelopeSimple size={14} weight="bold"/>
 </a>
 </div>
 )}
 {clienteVinculado?.direccion && (
 <div className="flex items-center gap-2 text-foreground">
 <MapPin size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.direccion}</span>
 </div>
 )}
 {clienteVinculado?.dni && (
 <div className="flex items-center gap-2 text-foreground">
 <IdentificationCard size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.dni}</span>
 </div>
 )}
 {clienteVinculado?.nombre_factura && (
 <div className="flex items-center gap-2 text-foreground">
 <Buildings size={14} className="text-primary shrink-0"/>
 <span className="font-semibold select-text cursor-text">{clienteVinculado.nombre_factura}</span>
 </div>
 )}
 {clienteVinculado?.notas && (
 <div className="flex items-start gap-2 text-muted-foreground">
 <NotePencil size={14} className="text-primary shrink-0 mt-0.5"/>
 <span className="font-medium select-text cursor-text">{clienteVinculado.notas}</span>
 </div>
 )}
 </div>
 )}
 </div>
 );
 })()}

 <div className="p-4 rounded-xl bg-muted border border-border flex flex-col gap-2 text-xs">
 <div className="flex items-center justify-between">
 <span className="text-muted-foreground font-bold">Fecha</span>
 <span className="font-extrabold text-foreground">{reserva.fecha}</span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-muted-foreground font-bold">Hora</span>
 <span className="font-extrabold text-primary">{reserva.hora}</span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-muted-foreground font-bold">Comensales</span>
 <span className="font-extrabold text-foreground">{reserva.personas} personas</span>
 </div>
 </div>

 {reserva.nota && (
 <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium">"{reserva.nota}"</div>
 )}

 <div className="flex flex-col gap-2 -mx-4">
 <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-4">Productos pedidos</span>
 <div className="flex flex-col">
 {comandaItems.map((item, index) => (
 <ComandaItemRow
 key={item.id}
 item={item}
 index={index}
 onClick={() => !isReadOnly && setEditingItem(item)}
 />
 ))}
 </div>
 </div>
 </main>

 <footer className="p-4 border-t border-border bg-card flex flex-col gap-3 shrink-0">
 {!editingItem ? (
 <>
 <div className="flex flex-col gap-2 text-xs font-semibold text-muted-foreground">
 <div className="flex items-center justify-between">
 <span>Total del pedido</span>
 <span className="font-black text-foreground">${total.toFixed(2)}</span>
 </div>
 <button
 type="button"
 onClick={() => setShowAbonos(v => !v)}
 disabled={pagos.length === 0}
 className="flex items-center justify-between disabled:cursor-default"
 >
 <span className="flex items-center gap-1">
 Total Abonado
 {pagos.length > 0 && (showAbonos ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />)}
 </span>
 <span className="font-black text-emerald-600">${totalAbonado.toFixed(2)}</span>
 </button>
 <div className="flex items-center justify-between">
 <span>Saldo pendiente</span>
 <span className={`font-black ${saldoPendiente > 0 ? 'text-amber-600' : 'text-foreground'}`}>${saldoPendiente.toFixed(2)}</span>
 </div>
 {showAbonos && pagos.length > 0 && (
 <div className="flex flex-col gap-1.5 mt-1 p-2 rounded-lg bg-muted border border-border">
 {pagos.map((m: any) => (
 <div key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
 <div className="flex flex-col min-w-0">
 <span className="font-bold text-foreground capitalize">
 {m.tipo === 'reembolso' ? 'Reembolso' : 'Abono'} · {m.metodo_pago}
 </span>
 <span className="text-muted-foreground">
 {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
 </span>
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 {m.comprobante_url && <PagoComprobanteLink url={m.comprobante_url} />}
 <span className={`font-black ${m.tipo === 'reembolso' ? 'text-destructive' : 'text-emerald-600'}`}>
 {m.tipo === 'reembolso' ? '-' : '+'}${(m.monto ?? 0).toFixed(2)}
 </span>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 {!isReadOnly && (
 <div className="grid grid-cols-2 gap-2">
 <Button
 type="button"
 variant="secondary"
 disabled={isCreatingComanda}
 onClick={handleAddProductos}
 className="gap-1.5"
 >
 <Plus size={16} weight="bold" />
 Productos
 </Button>
 <Button
 type="button"
 onClick={() => setAbonoModalOpen(true)}
 className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
 >
 <CreditCard size={16} weight="bold" />
 Abonar
 </Button>
 </div>
 )}
 <div className="grid grid-cols-2 gap-2">
 <Button
 type="button"
 variant="secondary"
 disabled={isDownloadingImage}
 onClick={handleDescargarImagen}
 className="gap-1.5"
 >
 <DownloadSimple size={16} weight="bold" />
 Descargar imagen
 </Button>
 <Button
 type="button"
 variant="secondary"
 onClick={handleImprimirPrecuenta}
 className="gap-1.5"
 >
 <Printer size={16} weight="bold" />
 Imprimir
 </Button>
 </div>
 </>
 ) : (
 <div className="flex flex-col gap-2 p-3 rounded-xl bg-muted border border-border">
 <span className="font-extrabold text-xs text-foreground">Editando Producto</span>
 <div className="flex items-center justify-center gap-4 bg-card p-2 rounded-lg border border-border">
 <button type="button"onClick={() => setEditCantidad(Math.max(1, editCantidad - 1))} className="w-8 h-8 rounded bg-muted font-bold">-</button>
 <span className="font-black text-lg text-foreground">{editCantidad}</span>
 <button type="button"onClick={() => setEditCantidad(editCantidad + 1)} className="w-8 h-8 rounded bg-muted font-bold">+</button>
 </div>
 <div className="grid grid-cols-2 gap-2">
 <button type="button"onClick={handleDeleteItem} className="py-2 rounded-lg bg-destructive/10 text-destructive font-bold text-xs">Eliminar</button>
 <button type="button"onClick={handleUpdateItem} className="py-2 rounded-lg bg-primary text-primary-foreground font-bold text-xs">Guardar</button>
 </div>
 </div>
 )}
 </footer>

 <TicketPreviewModal
 opened={previewOpened}
 onClose={() => setPreviewOpened(false)}
 title={previewTitle}
 content={previewContent}
 onPrint={handleConfirmPrint}
 />

 <SidebarReservaAbonoModal
 opened={abonoModalOpen}
 onClose={() => setAbonoModalOpen(false)}
 saldoPendiente={saldoPendiente}
 onConfirm={handleAbonar}
 />
 </div>
 );
}
