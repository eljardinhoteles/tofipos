import { useEffect, useState, useMemo } from'react';
import {
 ArrowLeft, Users, CurrencyCircleDollar, Check,
 Printer
} from'@phosphor-icons/react';
import type { Mesa } from'../../../db/database';
import { showToast } from'@/lib/toast';
import { useIvaActivo } from'../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { TicketPreviewModal } from'../../Common/TicketPreviewModal';
import { generarPrecuentaDividida } from'../../../services/printTemplateEngine';
import { queueReprintTicket } from'../../../lib/printServerClient';
import { useRxMenuCatalog } from'../../../hooks/useRxMenuCatalog';
import {
 initVerticalRxDb,
 createRxVenta,
 updateRxComanda,
 liberarMesaSiSinOperativas
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
 const [splitMethod, setSplitMethod] = useState<'iguales'|'monto'| null>(null);
 const [saldoInicialSplit, setSaldoInicialSplit] = useState<number>(0);
 const [personas, setPersonas] = useState(2);
 const [selectedPersonaIdx, setSelectedPersonaIdx] = useState<number | null>(null);
 const [paidPersonaIndexes, setPaidPersonaIndexes] = useState<number[]>([]);
 const [montoCustom, setMontoCustom] = useState<number |''>('');
 const [cobrarModalState, setCobrarModalState] = useState<{
 monto: number;
 label: string;
 onSuccessCallback?: () => void;
 } | null>(null);

 const [payerName, setPayerName] = useState<string>('');
 const [previewTicketText, setPreviewTicketText] = useState<string | null>(null);
 const [previewOnPrint, setPreviewOnPrint] = useState<(() => void) | null>(null);
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

 // Abonos previos registrados fuera del split (p.ej. desde la reserva
 // antes de asignar mesa) — se restan del total a dividir igual que los
 // pagos legacy, para no pedirle de más a quienes falta cobrar.
 const [ventasPrevias, setVentasPrevias] = useState<any[]>([]);
 useEffect(() => {
 if (!activeComanda?.id) {
 setVentasPrevias([]);
 return;
 }
 let alive = true;
 let unsub: { unsubscribe: () => void } | null = null;
 const run = async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const query = rxDb.ventas.find({ selector: { comanda_id: activeComanda.id, _deleted: { $ne: true } } });
 const docs = await query.exec();
 if (!alive) return;
 setVentasPrevias(docs.map((d: any) => d.toJSON()));
 unsub = query.$.subscribe((docs: any[]) => {
 setVentasPrevias(docs.map((d: any) => d.toJSON()));
 });
 };
 run().catch(console.error);
 return () => {
 alive = false;
 unsub?.unsubscribe();
 };
 }, [activeComanda?.id]);

 const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
 const { menuItems } = useRxMenuCatalog();

 const totalesOriginales = useMemo(() => {
 return calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);
 }, [comandaItems, menuItems, ivaPorcentaje, preciosConIva]);

 const totalOriginal = totalesOriginales.total;
 const totalPagadoVentas = useMemo(() => {
 return ventasPrevias.reduce((accVenta: number, v: any) => {
 // El dinero de una venta normal (abono de reserva, cobro hecho en la mesa)
 // es anticipo de la mesa y se decide al cobrar la cuenta; aquí solo cuenta
 // lo que se cobró por división.
 if (!(typeof v.referencia ==='string' && v.referencia.includes('Dividido - '))) return accVenta;
 const movs = v.movimientos ?? [];
 // Las ventas "Dividido - ..." creadas por este mismo split (cualquiera
 // de los 3 métodos) registran el cobro ya recibido como 'ajuste' (el
 // método de pago real se ancla después en Centro de Ventas, no 'pago'
 // aquí) — sin esto, un segundo split sobre la misma comanda no veía lo
 // ya cobrado.
 const esSplit = typeof v.referencia ==='string' && v.referencia.includes('Dividido - ');
 const sumaVenta = movs.reduce((acc: number, m: any) => {
 if (m.anulado) return acc;
 if (m.tipo ==='pago') return acc + (m.monto ?? 0);
 if (m.tipo ==='reembolso') return acc - (m.monto ?? 0);
 if (m.tipo ==='ajuste'&& esSplit) return acc + (m.monto ?? 0);
 return acc;
 }, 0);
 return accVenta + sumaVenta;
 }, 0);
 }, [ventasPrevias]);
 const totalPagado = useMemo(
 () => pagos.reduce((acc, p) => acc + p.monto, 0) + totalPagadoVentas,
 [pagos, totalPagadoVentas]
 );
 const saldoPendiente = Math.max(0, totalOriginal - totalPagado);

 const montoPorPersona = saldoInicialSplit / personas;

 const selectSplitMethod = (method:'iguales'|'monto') => {
 setSplitMethod(method);
 setSaldoInicialSplit(saldoPendiente);
 setSelectedPersonaIdx(null);
 setPaidPersonaIndexes([]);
 setMontoCustom('');
 };

 const procesarPagoSimple = async (
 monto: number,
 label?: string,
 onSuccessCallback?: () => void,
 nameOfPayer?: string
 ) => {
 if (!activeComanda) return;
 try {
 // Sin método: la división de cuenta en Mesas ya no elige método de pago
 // — se define después al anclar en Centro de Ventas.
 const labelDivision = nameOfPayer?.trim()
 ?`Dividido - ${nameOfPayer.trim()}`:`Dividido - ${label ||'Parte'}`;
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

 showToast.success('Pago y Ticket',`Cobro registrado por $${monto.toFixed(2)}.`);

 const labelText = nameOfPayer?.trim() || label ||'Parte';
 const ticketText = generarPrecuentaDividida(
 activeComanda,
 [],
 selectedMesa.nombre,
 labelText,
 monto,
 ivaPorcentaje
 );
 setPreviewTicketText(ticketText);
 setPreviewOnPrint(() => () => {
 queueReprintTicket({
 rawText: ticketText,
 mesaNombre: selectedMesa.nombre,
 comanda: activeComanda,
 }).catch(err => console.warn('print server offline', err));
 });

 if (onSuccessCallback) onSuccessCallback();

 setMontoCustom('');
 setCobrarModalState(null);

 // Recalcula sumando ambas fuentes (pagos legacy + movimientos de venta):
 // una parte pudo haberse cobrado por acá y otra ya venir abonada desde la
 // reserva antes de asignar mesa — solo mirar `pagos` subestimaba lo ya
 // cubierto y dejaba la cuenta "abierta" aunque estuviera saldada.
 const rxDb = await initVerticalRxDb();
 const pagosActualizados = await rxDb.pagos.find({
 selector: { comanda_id: activeComanda.id, _deleted: false }
 }).exec();
 const ventasActualizadas = await rxDb.ventas.find({
 selector: { comanda_id: activeComanda.id, _deleted: { $ne: true } }
 }).exec();
 const totalPagosLegacy = pagosActualizados.reduce((acc, p) => acc + p.monto, 0);
 // Solo lo cobrado por división: un abono/anticipo de la mesa se decide al
 // cerrar la cuenta y no la salda desde aquí.
 const totalVentas = ventasActualizadas.reduce((accVenta, doc: any) => {
 const v = doc.toJSON();
 if (!(typeof v.referencia ==='string' && v.referencia.includes('Dividido - '))) return accVenta;
 const sumaVenta = (v.movimientos ?? []).reduce((acc: number, m: any) => {
 if (m.anulado) return acc;
 if (m.tipo ==='pago') return acc + (m.monto ?? 0);
 if (m.tipo ==='reembolso') return acc - (m.monto ?? 0);
 if (m.tipo ==='ajuste') return acc + (m.monto ?? 0);
 return acc;
 }, 0);
 return accVenta + sumaVenta;
 }, 0);
 const nuevoTotalPagado = totalPagosLegacy + totalVentas;

 if (Math.abs(totalOriginal - nuevoTotalPagado) < 0.05 || nuevoTotalPagado >= totalOriginal) {
 await updateRxComanda(activeComanda.id, {
 estado:'cerrado',
 mesa_nombre: activeComanda.mesa_nombre || selectedMesa.nombre,
 updated_at: new Date().toISOString()
 });
 await liberarMesaSiSinOperativas(selectedMesa.id);
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
 <Label className="text-xs font-bold text-foreground/80">Nombre de quien paga</Label>
 <Input
 type="text"placeholder="Ej: Juan Pérez"value={payerName}
 onChange={(e) => setPayerName(e.target.value)}
 />
 </div>
 )}

 {!splitMethod ? (
 saldoPendiente <= 0.001 ? (
 <div className="flex flex-col items-center gap-2 py-10 text-center">
 <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
 <Check size={24} weight="bold"/>
 </div>
 <span className="font-extrabold text-sm text-foreground">Cuenta ya pagada</span>
 <span className="text-xs text-muted-foreground max-w-[220px]">
 Esta cuenta ya fue cubierta en su totalidad, no hay saldo para dividir.
 </span>
 </div>
 ) : (
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
 )
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
 <div className="flex items-center justify-between">
 <Label className="text-xs font-bold text-foreground/80">Monto a Pagar</Label>
 <span className="text-[10px] font-bold text-muted-foreground">
 Pendiente: ${saldoPendiente.toFixed(2)}
 </span>
 </div>
 <Input
 type="number"step="0.01"min={0}max={saldoPendiente}placeholder="0.00"value={montoCustom}
 onChange={(e) => setMontoCustom(parseFloat(e.target.value) ||'')}
 className={cn("h-12 px-4 text-lg font-black", Number(montoCustom) > saldoPendiente &&"border-destructive text-destructive")}/>
 {Number(montoCustom) > saldoPendiente && (
 <span className="text-[10px] font-bold text-destructive">
 El monto no puede superar el pendiente (${saldoPendiente.toFixed(2)}).
 </span>
 )}
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
 setPreviewOnPrint(() => () => {
 queueReprintTicket({ rawText: text, mesaNombre: selectedMesa.nombre, comanda: activeComanda }).catch(err => console.warn('print server offline', err));
 });
 }
 }}
 className="py-3 rounded-xl bg-amber-50 text-amber-700 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40">
 <Printer size={16} /> Pre-cuenta
 </button>
 <button
 type="button"
 disabled={!montoCustom || Number(montoCustom) <= 0 || Number(montoCustom) > saldoPendiente || !payerName.trim()}
 title={!payerName.trim() ?'Ingresa el nombre de quien paga para poder cobrar': undefined}
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
 setPreviewOnPrint(() => () => {
 queueReprintTicket({ rawText: text, mesaNombre: selectedMesa.nombre, comanda: activeComanda }).catch(err => console.warn('print server offline', err));
 });
 }
 }}
 className="py-3 rounded-xl bg-amber-50 text-amber-700 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40">
 <Printer size={16} /> Pre-cuenta
 </button>
 <button
 type="button"
 disabled={selectedPersonaIdx === null || !payerName.trim()}
 title={!payerName.trim() ?'Ingresa el nombre de quien paga para poder cobrar': undefined}
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
 type="button"
 disabled={!payerName.trim()}
 onClick={() => procesarPagoSimple(cobrarModalState.monto, cobrarModalState.label, cobrarModalState.onSuccessCallback, payerName)}
 className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed">
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
 onPrint={previewOnPrint ?? undefined}
 />
 </div>
 );
}
