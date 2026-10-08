import { useEffect, useState, useMemo } from'react';
import {
 Plus, CreditCard, PencilSimple, Prohibit, CaretDown,
 DownloadSimple, Printer, Phone, WhatsappLogo, EnvelopeSimple,
 MapPin, IdentificationCard, NotePencil, User, Buildings, CalendarCheck, CalendarBlank, Clock, Users, SquaresFour,
} from'@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ReservaHeader, reservaHeaderActionClass } from './ReservaHeader';
import { SidebarReservaAbono } from './SidebarReservaAbono';
import { ItemActionsPanel } from './ItemActionsPanel';
import { ComandaTotales } from './ComandaTotales';
import { STATUS_LABEL } from '../../Reservas/reservaUtils';
import { ComandaItemRow } from'./ComandaItemRow';
import { useUI } from'../../../context/UIContext';
import { useAuth } from'../../../context/AuthContext';
import { useComandaIva } from'../../../hooks/useComandaIva';
import { useRxClientes } from'../../../hooks/useRxClientes';
import { useRxComandas } from'../../../hooks/useRxComandas';
import { AsignarMesaModal } from'../../Reservas/AsignarMesaModal';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { showToast } from'@/lib/toast';
import {
 initVerticalRxDb, updateRxComandaItem, createRxComanda, updateRxReserva,
 createRxVenta, agregarVentaMovimiento,
  siguienteFolio,
} from'../../../db/rxdb';
import { Button } from'@/components/ui/button';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';
import { generarTicketReserva } from'../../../services/printTemplateEngine';
import { queueReprintTicket } from'../../../lib/printServerClient';
import { downloadTicketReservaAsImage } from'../../../lib/ticketImage';
import { getOrgCache } from'../../../lib/orgCache';
import { subirComprobante } from'@/lib/comprobantes';

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

interface SidebarReservaDetailProps {
 reservaId: string;
 onBack: () => void;
 onClose: () => void;
}

export function SidebarReservaDetail({ reservaId, onClose: onCloseSidebar }: SidebarReservaDetailProps) {
 const { setReservaProductosComandaId, setReservaView, openConfirm } = useUI();
 const { currentMesero } = useAuth();
 const { clientes } = useRxClientes();
 const [previewOpened, setPreviewOpened] = useState(false);
 const [previewTitle, setPreviewTitle] = useState('');
 const [previewContent, setPreviewContent] = useState('');
 const [isCreatingComanda, setIsCreatingComanda] = useState(false);
 const [abonoModalOpen, setAbonoModalOpen] = useState(false);
 const [showContacto, setShowContacto] = useState(false);
 const [isDownloadingImage, setIsDownloadingImage] = useState(false);

 const [reserva, setReserva] = useState<any | null>(null);
 const [comandaItems, setComandaItems] = useState<any[]>([]);
 // Venta vinculada a la comanda de la reserva (Centro de Ventas) — es la
 // fuente de verdad de los abonos, no la colección legacy `pagos`.
 const [venta, setVenta] = useState<any | null>(null);
 const [comanda, setComanda] = useState<any | null>(null);
 const [zonas, setZonas] = useState<any[]>([]);
 const [mesas, setMesas] = useState<any[]>([]);
 const { comandas: todasComandas } = useRxComandas() as { comandas: any[] };
 const [asignarOpen, setAsignarOpen] = useState(false);

 const [editingItem, setEditingItem] = useState<any | null>(null);

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

 const handleUpdateItem = async (cantidad: number, precio?: number) => {
 if (!editingItem) return;
 await updateRxComandaItem(editingItem.id, precio !== undefined ? { cantidad, precio } : { cantidad });
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
 const nextFolio = await siguienteFolio();
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
 totalAbonado > 0.005
 ? `Esta reserva tiene $${totalAbonado.toFixed(2)} abonados. Anularla NO los devuelve: regístralo como reembolso en Centro de Ventas. ¿Anular de todos modos?`
 : '¿Estás seguro de que deseas anular esta reserva? Podrás verla más tarde en el historial de canceladas.',
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
 if (data.monto > saldoPendiente + 0.005) {
 showToast.error('Abono mayor al saldo', `El abono no puede superar el saldo pendiente ($${saldoPendiente.toFixed(2)}).`);
 return;
 }
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

 const editingMenuItem = editingItem ? menuItems.find((m: any) => m.id === editingItem.item_id) : undefined;
 const telefono = reserva.telefono || clienteVinculado?.telefono;
 const email = reserva.email || clienteVinculado?.email;
 const hayContacto = !!(telefono || email || clienteVinculado);
 const itemsActivos = comandaItems.filter((i: any) => !i.anulado);
 // Asignar mesa (iniciar el servicio) solo el día de la reserva.
 const esHoy = reserva.fecha === new Date().toLocaleDateString('en-CA');

 // Registrar abono: página dentro del mismo sidebar, no un modal encima.
 if (abonoModalOpen) {
 return (
 <SidebarReservaAbono
 nombre={reserva.nombre}
 saldoPendiente={saldoPendiente}
 pagos={pagos}
 onBack={() => setAbonoModalOpen(false)}
 onClose={onCloseSidebar}
 onConfirm={handleAbonar}
 />
 );
 }

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 <ReservaHeader
 badge={<CalendarCheck size={22} weight="bold" />}
 titulo={reserva.nombre}
 subtitulo={`Reserva · ${STATUS_LABEL[reserva.estado as keyof typeof STATUS_LABEL] ?? reserva.estado}`}
 cerrada={isReadOnly}
 onClose={onCloseSidebar}
 acciones={!isReadOnly && (
 <>
 <Button type="button" variant="ghost" size="icon-lg" title="Editar reserva" aria-label="Editar reserva" onClick={handleEditar} className={reservaHeaderActionClass()}>
 <PencilSimple size={17} weight="bold" />
 </Button>
 <Button type="button" variant="ghost" size="icon-lg" title="Anular reserva" aria-label="Anular reserva" onClick={handleAnular} className={reservaHeaderActionClass(true)}>
 <Prohibit size={17} weight="bold" />
 </Button>
 </>
 )}
 />

 {/* Datos del cliente, colapsable (mismo bloque que el sidebar de mesa) */}
 {hayContacto && (
 <Collapsible open={showContacto} onOpenChange={setShowContacto} className="shrink-0 border-b border-border bg-muted/50">
 <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer">
 <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
 <IdentificationCard size={14} /> Datos del cliente
 </span>
 <CaretDown size={14} className={cn('text-muted-foreground transition-transform', showContacto && 'rotate-180')} />
 </CollapsibleTrigger>
 <CollapsibleContent>
 <div className="flex flex-col gap-3 px-4 pb-4 text-xs">
 {clienteVinculado?.tipo_cliente && (
 <div className="flex items-center gap-2 text-foreground">
 <User size={14} className="text-muted-foreground shrink-0"/>
 <span className="font-semibold select-text cursor-text">{TIPO_CLIENTE_LABEL[clienteVinculado.tipo_cliente] ?? clienteVinculado.tipo_cliente}</span>
 </div>
 )}
 {telefono && (
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 min-w-0 text-foreground">
 <Phone size={14} className="text-muted-foreground shrink-0"/>
 <span className="font-bold select-text cursor-text truncate">{telefono}</span>
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 <a href={`tel:${telefono}`} title="Llamar" className="w-8 h-8 rounded-lg bg-card border border-border text-foreground flex items-center justify-center hover:bg-muted transition-colors">
 <Phone size={14} weight="bold"/>
 </a>
 {getWhatsAppLink(telefono) && (
 <a href={getWhatsAppLink(telefono)!} target="_blank" rel="noreferrer" title="Enviar WhatsApp" className="w-8 h-8 rounded-lg bg-card border border-border text-foreground flex items-center justify-center hover:bg-muted transition-colors">
 <WhatsappLogo size={16} weight="fill"/>
 </a>
 )}
 </div>
 </div>
 )}
 {email && (
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 min-w-0 text-foreground">
 <EnvelopeSimple size={14} className="text-muted-foreground shrink-0"/>
 <span className="font-bold select-text cursor-text truncate">{email}</span>
 </div>
 <a href={`mailto:${email}`} title="Enviar correo" className="w-8 h-8 rounded-lg bg-card border border-border text-foreground flex items-center justify-center hover:bg-muted transition-colors shrink-0">
 <EnvelopeSimple size={14} weight="bold"/>
 </a>
 </div>
 )}
 {clienteVinculado?.direccion && (
 <div className="flex items-center gap-2 text-foreground"><MapPin size={14} className="text-muted-foreground shrink-0"/><span className="font-semibold select-text cursor-text">{clienteVinculado.direccion}</span></div>
 )}
 {clienteVinculado?.dni && (
 <div className="flex items-center gap-2 text-foreground"><IdentificationCard size={14} className="text-muted-foreground shrink-0"/><span className="font-semibold select-text cursor-text">{clienteVinculado.dni}</span></div>
 )}
 {clienteVinculado?.nombre_factura && (
 <div className="flex items-center gap-2 text-foreground"><Buildings size={14} className="text-muted-foreground shrink-0"/><span className="font-semibold select-text cursor-text">{clienteVinculado.nombre_factura}</span></div>
 )}
 {clienteVinculado?.notas && (
 <div className="flex items-start gap-2 text-muted-foreground"><NotePencil size={14} className="text-muted-foreground shrink-0 mt-0.5"/><span className="font-medium select-text cursor-text">{clienteVinculado.notas}</span></div>
 )}
 </div>
 </CollapsibleContent>
 </Collapsible>
 )}

 <main className="flex-1 overflow-y-auto">
 {/* Cuándo y para cuántos, de un vistazo */}
 <div className="grid grid-cols-3 gap-2 p-4 pb-3">
 {[
 { icon: CalendarBlank, etiqueta: 'Fecha', valor: reserva.fecha },
 { icon: Clock, etiqueta: 'Hora', valor: reserva.hora },
 { icon: Users, etiqueta: 'Comensales', valor: `${reserva.personas}` },
 ].map(({ icon: Icon, etiqueta, valor }) => (
 <div key={etiqueta} className="rounded-xl bg-muted/60 px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
 <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Icon size={12} weight="bold" /> {etiqueta}</span>
 <span className="text-sm font-black text-foreground truncate tabular-nums">{valor}</span>
 </div>
 ))}
 </div>
 {zonaNombre && (
 <div className="px-4 pb-3">
 <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
 <MapPin size={12} weight="bold" /> {zonaNombre}
 </span>
 </div>
 )}
 {reserva.nota && (
 <div className="mx-4 mb-3 p-3 rounded-xl bg-warning-soft text-xs text-warning-foreground font-medium">"{reserva.nota}"</div>
 )}

 <div className="flex items-center justify-between px-4 py-2 border-y border-border bg-muted/40">
 <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Productos pedidos</span>
 <span className="text-[11px] font-bold text-muted-foreground">{itemsActivos.length}</span>
 </div>
 {itemsActivos.length === 0 ? (
 <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
 <span className="text-sm font-bold text-foreground">Aún no hay productos</span>
 <span className="text-xs text-muted-foreground">Añade lo que el cliente pidió para calcular el total y el abono.</span>
 {!isReadOnly && (
 <Button type="button" variant="outline" disabled={isCreatingComanda} onClick={handleAddProductos} className="gap-1.5 font-bold">
 <Plus size={16} weight="bold" /> Añadir productos
 </Button>
 )}
 </div>
 ) : (
 <div className="flex flex-col pb-6">
 {comandaItems.map((item, index) => (
 <ComandaItemRow
 key={item.id}
 item={item}
 index={index}
 onClick={() => !isReadOnly && setEditingItem(item)}
 />
 ))}
 </div>
 )}
 </main>

 <footer className={cn('relative p-4 flex flex-col gap-3 shrink-0 border-t border-border', editingItem ? 'bg-muted/70' : 'bg-muted/40', !editingItem && !isReadOnly && itemsActivos.length > 0 && 'pt-6')}>
 {!editingItem ? (
 <>
 {!isReadOnly && itemsActivos.length > 0 && (
 <Button
 className="absolute -top-[18px] left-1/2 -translate-x-1/2 z-20 h-9 w-auto px-4 rounded-full border-0 font-semibold text-xs whitespace-nowrap bg-warning-foreground hover:bg-warning-foreground text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] focus-visible:ring-0 active:scale-95 transition-transform"
 disabled={isCreatingComanda}
 onClick={handleAddProductos}
 >
 <Plus size={15} weight="bold" className="mr-1.5" /> Añadir productos
 </Button>
 )}
 <ComandaTotales
 subtotal={totales.subtotalNeto}
 iva={totales.ivaTotal}
 ivaPorcentaje={ivaPorcentaje}
 total={total}
 etiquetaTotal="Total del pedido"
 totalPagado={totalAbonado}
 saldoPendiente={saldoPendiente}
 onVerPagos={pagos.length > 0 ? () => setAbonoModalOpen(true) : undefined}
 />
 <div className="grid grid-cols-2 gap-2">
 {!isReadOnly && (
 <>
 <Button type="button" className="h-10 font-bold gap-1.5" onClick={() => setAbonoModalOpen(true)}>
 <CreditCard size={18} weight="bold" /> Abonar
 </Button>
 <Button
 type="button" variant="warningSoft" disabled={!esHoy}
 title={esHoy ? 'Asignar mesa e iniciar el servicio' : 'Solo se puede asignar mesa el día de la reserva'}
 className="h-10 font-bold gap-1.5"
 onClick={() => setAsignarOpen(true)}
 >
 <SquaresFour size={18} weight="bold" /> Asignar mesa
 </Button>
 </>
 )}
 <Button type="button" variant="secondary" className="h-10 font-bold gap-1.5" onClick={handleImprimirPrecuenta}>
 <Printer size={18} weight="bold" /> Imprimir
 </Button>
 <Button type="button" variant="secondary" className="h-10 font-bold gap-1.5" disabled={isDownloadingImage} onClick={handleDescargarImagen}>
 <DownloadSimple size={18} weight="bold" /> Imagen
 </Button>
 </div>
 {!isReadOnly && !esHoy && (
 <p className="text-[11px] font-medium text-muted-foreground text-center -mt-1">
 La mesa se asigna el día del servicio ({reserva.fecha}).
 </p>
 )}
 </>
 ) : (
 <ItemActionsPanel
 key={editingItem.id}
 item={editingItem}
 confirmado={false}
 destinos={[]}
 tieneOpciones={false}
 precioVariable={!!editingMenuItem?.precio_variable}
 ocultarEstado
 onClose={() => setEditingItem(null)}
 onGuardar={handleUpdateItem}
 onEliminar={handleDeleteItem}
 onEditarOpciones={() => {}}
 onMover={() => {}}
 onAnular={() => {}}
 onCortesia={() => {}}
 />
 )}
 </footer>

 <AsignarMesaModal reserva={asignarOpen ? reserva : null} mesas={mesas} comandas={todasComandas} onClose={() => setAsignarOpen(false)} />

 <TicketPreviewModal
 opened={previewOpened}
 onClose={() => setPreviewOpened(false)}
 title={previewTitle}
 content={previewContent}
 onPrint={handleConfirmPrint}
 />
 </div>
 );
}
