import { useEffect, useState, useMemo } from'react';
import {
 ArrowLeft, Users, Receipt, CurrencyCircleDollar, Check,
 Printer, Plus, Minus
} from'@phosphor-icons/react';
import type { Mesa, ComandaItem } from'../../../db/database';
import { showToast } from'@/lib/toast';
import { useIvaActivo } from'../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';
import { generarPrecuentaDividida } from'../../../services/printTemplateEngine';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import {
 initVerticalRxDb,
 createRxVenta,
 updateRxComanda,
 updateRxComandaItem,
 updateRxMesa
} from'../../../db/rxdb';
import { cn } from'@/lib/utils';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';

interface SidebarSplitProps {
 selectedMesa: Mesa;
 activeComanda: any;
 comandaItems: any[];
 onBack: () => void;
 onSuccess: () => void;
}

export function SidebarSplit({ selectedMesa, activeComanda, comandaItems, onBack, onSuccess }: SidebarSplitProps) {
 const [splitMethod, setSplitMethod] = useState<'iguales'|'productos'|'monto'| null>(null);
 const [saldoInicialSplit, setSaldoInicialSplit] = useState<number>(0);
 const [selectedItems, setSelectedItems] = useState<{id: string, qtyToPay: number}[]>([]);
 const [personas, setPersonas] = useState(2);
 const [selectedPersonaIdx, setSelectedPersonaIdx] = useState<number | null>(null);
 const [paidPersonaIndexes, setPaidPersonaIndexes] = useState<number[]>([]);
 const [montoCustom, setMontoCustom] = useState<number |''>('');
 const [cobrarModalState, setCobrarModalState] = useState<{
 monto: number;
 label: string;
 itemsPagados?: any[];
 onSuccessCallback?: () => void;
 } | null>(null);

 const [payerName, setPayerName] = useState<string>('');
 const [previewTicketText, setPreviewTicketText] = useState<string | null>(null);
 const [pagos, setPagos] = useState<any[]>([]);

 useEffect(() => {
 if (!activeComanda?.id) {
 setPagos([]);
 return;
 }

 let sub: { unsubscribe: () => void } | null = null;
 let alive = true;

 const run = async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const query = rxDb.pagos.find({
 selector: { comanda_id: activeComanda.id, _deleted: false }
 });
 const docs = await query.exec();
 if (!alive) return;
 setPagos(docs.map((doc: any) => doc.toJSON()));
 sub = query.$.subscribe((docs: any[]) => {
 setPagos(docs.map((doc: any) => doc.toJSON()));
 });
 };

 run().catch(console.error);

 return () => {
 alive = false;
 sub?.unsubscribe();
 };
 }, [activeComanda?.id]);

 const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
 const { menuItems } = useRxMenuCatalog();

 const totalesOriginales = useMemo(() => {
 return calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);
 }, [comandaItems, menuItems, ivaPorcentaje, preciosConIva]);

 const totalOriginal = totalesOriginales.total;
 const totalPagado = useMemo(() => pagos.reduce((acc, p) => acc + p.monto, 0), [pagos]);
 const saldoPendiente = Math.max(0, totalOriginal - totalPagado);

 const hasNonProductPayments = useMemo(() => {
 return pagos.some(p => !p.tipo_division || !p.tipo_division.includes('(Productos)'));
 }, [pagos]);

 const montoPorPersona = useMemo(() => saldoInicialSplit / personas, [saldoInicialSplit, personas]);

 const totalesSeleccionados = useMemo(() => {
 if (selectedItems.length === 0) return { subtotalNeto: 0, ivaTotal: 0, total: 0 };
 const itemsTemporales = selectedItems.map(si => {
 const item = comandaItems.find(i => i.id === si.id);
 return { ...item, cantidad: si.qtyToPay } as ComandaItem;
 });
 return calcularTotalesComanda(itemsTemporales, menuItems, ivaPorcentaje, preciosConIva);
 }, [selectedItems, comandaItems, menuItems, ivaPorcentaje, preciosConIva]);

 const selectSplitMethod = (method:'iguales'|'productos'|'monto') => {
 setSplitMethod(method);
 setSaldoInicialSplit(saldoPendiente);
 setSelectedPersonaIdx(null);
 setPaidPersonaIndexes([]);
 setMontoCustom('');
 setSelectedItems([]);
 };

 const procesarPagoSimple = async (
 monto: number,
 itemsPagados?: any[],
 label?: string,
 onSuccessCallback?: () => void,
 nameOfPayer?: string
 ) => {
 if (!activeComanda) return;
 try {
 // Sin método: la división de cuenta en Mesas ya no elige método de pago
 // — se define después al anclar en Centro de Ventas.
 const labelDivision = nameOfPayer?.trim()
 ?`Dividido - ${nameOfPayer.trim()}${itemsPagados && itemsPagados.length > 0 ?'(Productos)':''}`:`Dividido - ${label ||'Parte'}${itemsPagados && itemsPagados.length > 0 ?'(Productos)':''}`;
 await createRxVenta({
 id: crypto.randomUUID(),
 origen:'mesa',
 tipo:'directa',
 cliente_id: activeComanda.cliente_id || undefined,
 cliente_nombre: nameOfPayer?.trim() || activeComanda.cliente || undefined,
 referencia: `Mesa ${activeComanda.mesa_nombre || selectedMesa.nombre} · #${activeComanda.folio} · ${labelDivision}`,
 comanda_id: activeComanda.id,
 organization_id: activeComanda.organization_id || localStorage.getItem('pos_active_org_id') ||'',
 }, monto);

 if (itemsPagados && itemsPagados.length > 0) {
 for (const item of itemsPagados) {
 const comandaItem = comandaItems.find(i => i.id === item.id);
 if (comandaItem) {
 await updateRxComandaItem(item.id, {
 pagado_cantidad: (comandaItem.pagado_cantidad || 0) + item.qtyToPay
 });
 }
 }
 }

 showToast.success('Pago y Ticket',`Cobro registrado por $${monto.toFixed(2)}.`);

 const labelText = nameOfPayer?.trim() || label ||'Parte';
 const itemsMapeados = (itemsPagados || []).map(si => {
 const item = comandaItems.find(i => i.id === si.id);
 if (!item) return si;
 return { ...item, qtyToPay: si.qtyToPay || si.cantidad || 1 };
 });

 const ticketText = generarPrecuentaDividida(
 activeComanda,
 itemsMapeados,
 selectedMesa.nombre,
 labelText,
 monto,
 ivaPorcentaje
 );
 setPreviewTicketText(ticketText);

 if (onSuccessCallback) onSuccessCallback();

 setSelectedItems([]);
 setMontoCustom('');
 setCobrarModalState(null);

 const rxDb = await initVerticalRxDb();
 const pagosActualizados = await rxDb.pagos.find({
 selector: { comanda_id: activeComanda.id, _deleted: false }
 }).exec();
 const nuevoTotalPagado = pagosActualizados.reduce((acc, p) => acc + p.monto, 0);

 if (Math.abs(totalOriginal - nuevoTotalPagado) < 0.05 || nuevoTotalPagado >= totalOriginal) {
 await updateRxComanda(activeComanda.id, {
 estado:'cerrado',
 mesa_nombre: activeComanda.mesa_nombre || selectedMesa.nombre,
 updated_at: new Date().toISOString()
 });
 await updateRxMesa(selectedMesa.id, { estado:'libre'});
 showToast.success('Cuenta Pagada','El saldo pendiente ha sido cubierto en su totalidad.');
 onSuccess();
 }
 } catch (error) {
 console.error(error);
 showToast.error('Error al registrar el pago');
 }
 };

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 <header className="p-4 border-b border-border flex items-center justify-between shrink-0 shadow-xs">
 <div className="flex items-center gap-3">
 <button
 type="button"onClick={splitMethod ? () => setSplitMethod(null) : onBack}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <ArrowLeft size={18} weight="bold"/>
 </button>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground leading-tight">Dividir Cuenta</h3>
 <span className="text-[10px] font-bold text-muted-foreground">
 {selectedMesa.nombre.replace('Mesa','Mesa #')} - Cuenta #{activeComanda?.folio}
 </span>
 </div>
 </div>
 </header>

 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
 {splitMethod && (
 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold text-foreground/80">Nombre de quien paga (Opcional)</Label>
 <Input
 type="text"placeholder="Ej: Juan Pérez"value={payerName}
 onChange={(e) => setPayerName(e.target.value)}
 />
 </div>
 )}

 {!splitMethod ? (
 <div className="flex flex-col gap-4">
 <div className="p-6 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col items-center gap-1 text-center">
 <span className="text-[10px] font-black uppercase tracking-wider text-primary">Total a Dividir</span>
 <span className="text-3xl font-black text-primary">${saldoPendiente.toFixed(2)}</span>
 </div>

 <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Métodos de división</span>

 <button
 type="button"onClick={() => selectSplitMethod('iguales')}
 className="p-4 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-3 text-left transition-colors cursor-pointer">
 <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
 <Users size={20} />
 </div>
 <div className="flex flex-col">
 <span className="font-extrabold text-sm text-foreground">Partes iguales</span>
 <span className="text-xs text-muted-foreground">Divide el saldo entre N personas por igual.</span>
 </div>
 </button>

 <button
 type="button"disabled={hasNonProductPayments}
 onClick={() => !hasNonProductPayments && selectSplitMethod('productos')}
 className={cn("p-4 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-3 text-left transition-colors",
 hasNonProductPayments ?"opacity-50 cursor-not-allowed":"cursor-pointer")}
 >
 <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
 <Receipt size={20} />
 </div>
 <div className="flex flex-col">
 <span className="font-extrabold text-sm text-foreground">Por productos</span>
 <span className="text-xs text-muted-foreground">Elige los artículos que paga cada persona.</span>
 </div>
 </button>

 <button
 type="button"onClick={() => selectSplitMethod('monto')}
 className="p-4 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-3 text-left transition-colors cursor-pointer">
 <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
 <CurrencyCircleDollar size={20} />
 </div>
 <div className="flex flex-col">
 <span className="font-extrabold text-sm text-foreground">Monto fijo</span>
 <span className="text-xs text-muted-foreground">Registra un pago rápido por una cantidad específica.</span>
 </div>
 </button>
 </div>
 ) : (
 <>
 {splitMethod ==='iguales'&& (
 <div className="flex flex-col gap-4">
 <div className="flex flex-col gap-1.5">
 <Label className="text-xs font-bold text-foreground/80 text-center">¿Entre cuántas personas?</Label>
 <div className="grid grid-cols-6 gap-1.5">
 {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
 <button
 key={num}
 type="button"onClick={() => { setPersonas(num); setSelectedPersonaIdx(null); setPaidPersonaIndexes([]); }}
 className={cn("h-10 rounded-xl font-black text-sm transition-colors cursor-pointer",
 personas === num ?"bg-primary text-primary-foreground":"bg-muted text-foreground/80")}
 >
 {num}
 </button>
 ))}
 </div>
 </div>

 <div className="flex flex-col gap-2">
 {Array.from({ length: personas }).map((_, idx) => {
 const isPaid = paidPersonaIndexes.includes(idx);
 const isSelected = selectedPersonaIdx === idx;
 return (
 <div
 key={idx}
 onClick={() => !isPaid && setSelectedPersonaIdx(isSelected ? null : idx)}
 className={cn("p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all",
 isPaid ?"bg-emerald-50 border-emerald-300": isSelected ?"bg-primary/10 border-primary":"bg-card border-border")}
 >
 <div className="flex items-center gap-3">
 <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs", isPaid ?"bg-emerald-600 text-white":"bg-muted text-foreground/80")}>
 {isPaid ? <Check size={16} /> : idx + 1}
 </div>
 <div className="flex flex-col">
 <span className="font-extrabold text-xs text-foreground">Persona {idx + 1}</span>
 <span className="font-bold text-xs text-primary">${montoPorPersona.toFixed(2)}</span>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {splitMethod ==='monto'&& (
 <div className="flex flex-col gap-3">
 <Label className="text-xs font-bold text-foreground/80">Monto a Pagar</Label>
 <Input
 type="number"step="0.01"placeholder="0.00"value={montoCustom}
 onChange={(e) => setMontoCustom(parseFloat(e.target.value) ||'')}
 className="h-12 px-4 text-lg font-black"/>
 </div>
 )}

 {splitMethod ==='productos'&& (
 <div className="flex flex-col gap-3">
 <span className="text-xs font-bold text-foreground/80">Selecciona lo que deseas pagar ahora:</span>
 <div className="flex flex-col gap-2">
 {comandaItems.filter(item => (item.cantidad - (item.pagado_cantidad || 0)) > 0).map(item => {
 const qtyPendiente = item.cantidad - (item.pagado_cantidad || 0);
 const selectedQty = selectedItems.find(si => si.id === item.id)?.qtyToPay || 0;
 return (
 <div key={item.id} className="p-3 rounded-xl bg-muted border border-border flex items-center justify-between">
 <div className="flex flex-col">
 <span className="font-extrabold text-xs text-foreground">{item.nombre}</span>
 <span className="text-[10px] text-muted-foreground font-bold">Pendientes: {qtyPendiente} • ${item.precio.toFixed(2)} c/u</span>
 </div>

 <div className="flex items-center gap-2">
 {selectedQty > 0 && (
 <button
 type="button"onClick={() => {
 setSelectedItems(prev => {
 const existing = prev.find(si => si.id === item.id);
 if (existing && existing.qtyToPay > 1) {
 return prev.map(si => si.id === item.id ? { ...si, qtyToPay: si.qtyToPay - 1 } : si);
 }
 return prev.filter(si => si.id !== item.id);
 });
 }}
 className="w-7 h-7 rounded-lg bg-destructive/10 text-destructive font-extrabold flex items-center justify-center cursor-pointer">
 <Minus size={14} />
 </button>
 )}
 <span className="font-black text-xs w-4 text-center">{selectedQty}</span>
 <button
 type="button"disabled={selectedQty >= qtyPendiente}
 onClick={() => {
 setSelectedItems(prev => {
 const existing = prev.find(si => si.id === item.id);
 if (existing) {
 return prev.map(si => si.id === item.id ? { ...si, qtyToPay: si.qtyToPay + 1 } : si);
 }
 return [...prev, { id: item.id, qtyToPay: 1 }];
 });
 }}
 className="w-7 h-7 rounded-lg bg-primary text-primary-foreground font-extrabold flex items-center justify-center cursor-pointer disabled:opacity-30">
 <Plus size={14} />
 </button>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </>
 )}
 </main>

 {/* Footers Fijos */}
 {splitMethod ==='monto'&& (
 <footer className="p-4 border-t border-border bg-card grid grid-cols-2 gap-2 shrink-0">
 <button
 type="button"disabled={!montoCustom || Number(montoCustom) <= 0 || Number(montoCustom) > saldoPendiente}
 onClick={() => {
 const montoVal = Number(montoCustom);
 if (montoVal > 0) {
 const label = payerName.trim() ||"Pago Parcial";
 const text = generarPrecuentaDividida(activeComanda, [], selectedMesa.nombre, label, montoVal, ivaPorcentaje);
 setPreviewTicketText(text);
 }
 }}
 className="py-3 rounded-xl bg-amber-50 text-amber-700 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40">
 <Printer size={16} /> Pre-cuenta
 </button>
 <button
 type="button"disabled={!montoCustom || Number(montoCustom) <= 0 || Number(montoCustom) > saldoPendiente}
 onClick={() => setCobrarModalState({ monto: Number(montoCustom), label:'Pago Parcial'})}
 className="py-3 rounded-xl bg-emerald-600 text-white font-extrabold text-xs cursor-pointer disabled:opacity-40 shadow-xs">
 Cobrar Monto
 </button>
 </footer>
 )}

 {splitMethod ==='iguales'&& (
 <footer className="p-4 border-t border-border bg-card grid grid-cols-2 gap-2 shrink-0">
 <button
 type="button"disabled={selectedPersonaIdx === null}
 onClick={() => {
 if (selectedPersonaIdx !== null) {
 const label = payerName.trim() ||`Persona ${selectedPersonaIdx + 1}`;
 const text = generarPrecuentaDividida(activeComanda, [], selectedMesa.nombre, label, montoPorPersona, ivaPorcentaje);
 setPreviewTicketText(text);
 }
 }}
 className="py-3 rounded-xl bg-amber-50 text-amber-700 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40">
 <Printer size={16} /> Pre-cuenta
 </button>
 <button
 type="button"disabled={selectedPersonaIdx === null}
 onClick={() => {
 if (selectedPersonaIdx !== null) {
 const idx = selectedPersonaIdx;
 setCobrarModalState({
 monto: montoPorPersona,
 label:`Persona ${idx + 1}`,
 onSuccessCallback: () => {
 setPaidPersonaIndexes(prev => [...prev, idx]);
 setSelectedPersonaIdx(null);
 }
 });
 }
 }}
 className="py-3 rounded-xl bg-emerald-600 text-white font-extrabold text-xs cursor-pointer disabled:opacity-40 shadow-xs">
 Cobrar parte
 </button>
 </footer>
 )}

 {splitMethod ==='productos'&& selectedItems.length > 0 && (
 <footer className="p-4 border-t border-border bg-card grid grid-cols-2 gap-2 shrink-0">
 <button
 type="button"onClick={() => {
 const label = payerName.trim() ||"Cuenta por Productos";
 const itemsMapeados = selectedItems.map(si => {
 const item = comandaItems.find(i => i.id === si.id);
 return { ...item, qtyToPay: si.qtyToPay };
 });
 const text = generarPrecuentaDividida(activeComanda, itemsMapeados, selectedMesa.nombre, label, totalesSeleccionados.total, ivaPorcentaje);
 setPreviewTicketText(text);
 }}
 className="py-3 rounded-xl bg-amber-50 text-amber-700 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
 <Printer size={16} /> Pre-cuenta
 </button>
 <button
 type="button"onClick={() => setCobrarModalState({ monto: totalesSeleccionados.total, label:'Pago de Productos', itemsPagados: selectedItems })}
 className="py-3 rounded-xl bg-emerald-600 text-white font-extrabold text-xs cursor-pointer shadow-xs">
 Cobrar (${totalesSeleccionados.total.toFixed(2)})
 </button>
 </footer>
 )}

 {/* Modal de cobro */}
 {cobrarModalState && (
 <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4">
 <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
 <h3 className="font-extrabold text-base text-foreground">Cobrar e Imprimir</h3>
 <div className="p-4 rounded-xl bg-muted border border-border text-center flex flex-col gap-0.5">
 <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Monto</span>
 <span className="font-black text-2xl text-emerald-600">${cobrarModalState.monto.toFixed(2)}</span>
 </div>
 <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
 <button
 type="button"onClick={() => setCobrarModalState(null)}
 className="px-4 py-2 rounded-lg bg-muted text-foreground/80 font-bold text-xs cursor-pointer">
 Cancelar
 </button>
 <button
 type="button"onClick={() => procesarPagoSimple(cobrarModalState.monto, cobrarModalState.itemsPagados, cobrarModalState.label, cobrarModalState.onSuccessCallback, payerName)}
 className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs cursor-pointer shadow-xs">
 Cobrar e Imprimir
 </button>
 </div>
 </div>
 </div>
 )}

 <TicketPreviewModal
 opened={previewTicketText !== null}
 onClose={() => setPreviewTicketText(null)}
 title="Precuenta Dividida"content={previewTicketText ||''}
 />
 </div>
 );
}
