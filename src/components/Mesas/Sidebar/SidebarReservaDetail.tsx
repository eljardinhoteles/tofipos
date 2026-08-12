import { useEffect, useState, useMemo } from'react';
import {
 ArrowLeft, X
} from'@phosphor-icons/react';
import { ComandaItemRow } from'./ComandaItemRow';
import { useIvaActivo } from'../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { initVerticalRxDb, updateRxComandaItem } from'../../../db/rxdb';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';

interface SidebarReservaDetailProps {
 reservaId: string;
 onBack: () => void;
 onClose: () => void;
}

export function SidebarReservaDetail({ reservaId, onBack, onClose }: SidebarReservaDetailProps) {
 const [previewOpened, setPreviewOpened] = useState(false);
 const [previewTitle] = useState('');
 const [previewContent] = useState('');

 const [reserva, setReserva] = useState<any | null>(null);
 const [comandaItems, setComandaItems] = useState<any[]>([]);
 const [pagos, setPagos] = useState<any[]>([]);
 const [, setZonas] = useState<any[]>([]);
 const [, setMesas] = useState<any[]>([]);

 const [editingItem, setEditingItem] = useState<any | null>(null);
 const [editCantidad, setEditCantidad] = useState(1);
 const [editPrecio, setEditPrecio] = useState(0);

 const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
 const { menuItems } = useRxMenuCatalog();

 useEffect(() => {
 let alive = true;
 let subs: Array<{ unsubscribe: () => void }> = [];

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

 if (r?.comanda_id) {
 rxDb.comanda_items.find({ selector: { comanda_id: r.comanda_id, _deleted: { $ne: true } } }).exec().then(docs => {
 if (alive) setComandaItems(docs.map((d: any) => d.toJSON()));
 });
 rxDb.pagos.find({ selector: { comanda_id: r.comanda_id, _deleted: { $ne: true } } }).exec().then(docs => {
 if (alive) setPagos(docs.map((d: any) => d.toJSON()));
 });
 }
 })
 );
 })().catch(() => {});

 return () => {
 alive = false;
 subs.forEach(s => s.unsubscribe());
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
 const totalAbonado = useMemo(() => pagos.reduce((acc, p) => acc + p.monto, 0), [pagos]);

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
 type="button"onClick={onClose}
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
 </div>
 );
}
