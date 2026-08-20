import { useEffect, useState, useMemo } from'react';
import {
 ArrowLeft, X, Plus, CreditCard
} from'@phosphor-icons/react';
import { ComandaItemRow } from'./ComandaItemRow';
import { SidebarReservaAbonoModal } from'./SidebarReservaAbonoModal';
import { useUI } from'../../../context/UIContext';
import { useAuth } from'../../../context/AuthContext';
import { useComandaIva } from'../../../hooks/useComandaIva';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { showToast } from'@/lib/toast';
import {
 initVerticalRxDb, updateRxComandaItem, createRxComanda, updateRxReserva,
 createRxVenta, agregarVentaMovimiento,
} from'../../../db/rxdb';
import { Button } from'@/components/ui/button';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';

interface SidebarReservaDetailProps {
 reservaId: string;
 onBack: () => void;
 onClose: () => void;
}

export function SidebarReservaDetail({ reservaId, onBack, onClose: onCloseSidebar }: SidebarReservaDetailProps) {
 const { setReservaProductosComandaId } = useUI();
 const { currentMesero } = useAuth();
 const [previewOpened, setPreviewOpened] = useState(false);
 const [previewTitle] = useState('');
 const [previewContent] = useState('');
 const [isCreatingComanda, setIsCreatingComanda] = useState(false);
 const [abonoModalOpen, setAbonoModalOpen] = useState(false);

 const [reserva, setReserva] = useState<any | null>(null);
 const [comandaItems, setComandaItems] = useState<any[]>([]);
 // Venta vinculada a la comanda de la reserva (Centro de Ventas) — es la
 // fuente de verdad de los abonos, no la colección legacy `pagos`.
 const [venta, setVenta] = useState<any | null>(null);
 const [comanda, setComanda] = useState<any | null>(null);
 const [, setZonas] = useState<any[]>([]);
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

 if (!reserva) return null;

 const isReadOnly = reserva.estado ==='completada'|| reserva.estado ==='cancelada';
 const total = totales.total;

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
 confirmada: true,
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

 const handleAbonar = async (data: {
 monto: number;
 metodo: 'efectivo' | 'tarjeta' | 'transferencia' | 'otros';
 bancoDestino?: string;
 numeroComprobante?: string;
 redTarjeta?: string;
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

 await agregarVentaMovimiento({
 venta_id: ventaId,
 tipo: 'pago',
 monto: data.monto,
 metodo_pago: data.metodo,
 transferencia_banco: data.bancoDestino,
 transferencia_referencia: data.numeroComprobante,
 tarjeta_red: data.redTarjeta,
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

 <button
 type="button"onClick={onCloseSidebar}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <X size={18} weight="bold"/>
 </button>
 </header>

 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
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
 <div className="flex items-center justify-between">
 <span>Total Abonado</span>
 <span className="font-black text-emerald-600">${totalAbonado.toFixed(2)}</span>
 </div>
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
 />

 <SidebarReservaAbonoModal
 opened={abonoModalOpen}
 onClose={() => setAbonoModalOpen(false)}
 saldoPendiente={Math.max(0, total - totalAbonado)}
 onConfirm={handleAbonar}
 />
 </div>
 );
}
