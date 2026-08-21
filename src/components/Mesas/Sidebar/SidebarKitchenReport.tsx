import { useState } from'react';
import {
 Sheet,
 SheetContent,
 SheetTitle,
 SheetDescription,
} from'@/components/ui/sheet';
import {
 Drawer,
 DrawerPortal,
 DrawerOverlay,
 DrawerContent,
 DrawerTitle,
 DrawerDescription,
 DrawerHandle,
} from'@/components/ui/drawer';
import { ClipboardText, FileText, X, Check, CalendarBlank } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { initVerticalRxDb } from'../../../db/rxdb';
import { isOperativeComanda } from'../../../db/comandaState';
import { A4ReportPreviewModal } from'../../Common/A4ReportPreviewModal';
import type { Comanda, HabitacionCuenta } from'../../../db/database';
import { cn } from'@/lib/utils';
import { useIsMobile } from'../../../hooks/useIsMobile';
import { useRxReservas } from'../../../hooks/useRxReservas';

interface SidebarKitchenReportProps {
 opened: boolean;
 onClose: () => void;
 allMesas: any[];
 allComandas: Comanda[];
 allCuentas: HabitacionCuenta[];
}

export function SidebarKitchenReport({
 opened,
 onClose,
 allMesas,
 allComandas,
 allCuentas,
}: SidebarKitchenReportProps) {
 const isMobile = useIsMobile();
 const { reservas } = useRxReservas();
 const [selectedReportMesas, setSelectedReportMesas] = useState<Set<string>>(new Set());
 const [selectedReservas, setSelectedReservas] = useState<Set<string>>(new Set());
 const [reportData, setReportData] = useState<Array<{ mesaNombre: string; habitacionNombre?: string; items: any[] }>>([]);
 const [a4PreviewOpened, setA4PreviewOpened] = useState(false);
 const [loading, setLoading] = useState(false);

 const mesaExtrasPorMesa = (mesaId: string) => {
 const comanda = allComandas.find(c => c.mesa_id === mesaId && isOperativeComanda(c));
 let habitacionNombre: string | undefined;
 let clienteNombre: string | undefined = comanda?.cliente || undefined;
 if (comanda?.habitacion_cuenta_id) {
 const cuenta = allCuentas.find(c => c.id === comanda.habitacion_cuenta_id);
 if (cuenta) {
 const roomMesa = allMesas.find(m => m.id === cuenta.mesa_id);
 habitacionNombre = roomMesa?.nombre;
 clienteNombre = cuenta.huesped || clienteNombre;
 }
 }
 return { habitacionNombre, clienteNombre };
 };

 const activeMesas = (allMesas ?? [])
 .filter(m =>
 m.piso.toLowerCase() !=='habitaciones'&&
 m.piso !=='Reservas'&&
 !/^(reserva_|delivery_|local_)/.test(m.id) &&
 allComandas.some(c => c.mesa_id === m.id && isOperativeComanda(c)))
 .sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity:'base'}));

 const toISO = (d: Date) => {
 const local = new Date(d);
 local.setMinutes(d.getMinutes() - d.getTimezoneOffset());
 return local.toISOString().split('T')[0];
 };
 const hoyStr = toISO(new Date());
 const reservasHoy = (reservas ?? [])
 .filter((r: any) => r.fecha === hoyStr && r.estado !=='cancelada')
 .sort((a: any, b: any) => a.hora.localeCompare(b.hora));

 const toggleMesa = (id: string, checked: boolean) => {
 const newSet = new Set(selectedReportMesas);
 if (checked) newSet.add(id);
 else newSet.delete(id);
 setSelectedReportMesas(newSet);
 };

 const toggleReserva = (id: string, checked: boolean) => {
 const newSet = new Set(selectedReservas);
 if (checked) newSet.add(id);
 else newSet.delete(id);
 setSelectedReservas(newSet);
 };

 const handleSelectAll = () => setSelectedReportMesas(new Set(activeMesas.map(m => m.id)));
 const handleDeselectAll = () => setSelectedReportMesas(new Set());

 const handleGenerarReporte = async () => {
 if (selectedReportMesas.size === 0 && selectedReservas.size === 0) {
 showToast.error('Ninguna mesa o reserva seleccionada');
 return;
 }
 setLoading(true);
 try {
 const rxDb = await initVerticalRxDb();
 const mesasData: Array<{ mesaNombre: string; habitacionNombre?: string; clienteNombre?: string; items: any[] }> = [];

 const sorted = Array.from(selectedReportMesas).sort((aId, bId) => {
 const a = allMesas.find(m => m.id === aId);
 const b = allMesas.find(m => m.id === bId);
 if (!a || !b) return 0;
 return a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity:'base'});
 });

 for (const mesaId of sorted) {
 const mesa = allMesas.find(m => m.id === mesaId);
 const comanda = allComandas.find(c => c.mesa_id === mesaId && isOperativeComanda(c));
 if (!mesa || !comanda) continue;

 const docs = await rxDb.comanda_items.find({
 selector: { comanda_id: comanda.id, _deleted: { $ne: true } }
 }).exec();
 const items = docs.map((d: any) => d.toJSON()).filter((it: any) => !it.anulado);
 if (items.length === 0) continue;

 const { habitacionNombre, clienteNombre } = mesaExtrasPorMesa(mesaId);
 mesasData.push({ mesaNombre: mesa.nombre, habitacionNombre, clienteNombre, items });
 }

 const reservasSeleccionadasDocs = reservasHoy.filter((r: any) => selectedReservas.has(r.id));

 for (const reserva of reservasSeleccionadasDocs) {
 if (!reserva.comanda_id) continue;
 const docs = await rxDb.comanda_items.find({
 selector: { comanda_id: reserva.comanda_id, _deleted: { $ne: true } }
 }).exec();
 const items = docs.map((d: any) => d.toJSON()).filter((it: any) => !it.anulado);
 if (items.length === 0) continue;
 mesasData.push({ mesaNombre: `Reserva — ${reserva.nombre} (${reserva.hora})`, items });
 }

 if (mesasData.length === 0 && selectedReservas.size === 0) {
 showToast.error('Las mesas y reservas seleccionadas no tienen productos');
 return;
 }

 setReportData(mesasData);
 setA4PreviewOpened(true);
 } catch (e) {
 console.error(e);
 showToast.error('Error generando reporte');
 } finally {
 setLoading(false);
 }
 };

 if (!opened) return null;

 const header = (
 <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
 <ClipboardText size={20} weight="bold"/>
 </div>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground leading-tight">Reporte de Cocina</h3>
 <span className="text-[10px] font-bold text-muted-foreground">Consolidado de mesas activas</span>
 </div>
 </div>
 <button type="button"onClick={onClose} className="text-muted-foreground">
 <X size={18} />
 </button>
 </div>
 );

 const body = (
 <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">
 <div className="flex items-center justify-between">
 <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-extrabold text-xs">
 {activeMesas.length} mesas activas
 </span>
 <div className="flex items-center gap-2 text-xs font-bold">
 <button type="button"onClick={handleSelectAll} className="text-primary">Todas</button>
 <span className="text-muted-foreground/60">·</span>
 <button type="button"onClick={handleDeselectAll} className="text-muted-foreground">Ninguna</button>
 </div>
 </div>

 <div className="flex flex-col gap-2">
 {activeMesas.length === 0 ? (
 <span className="text-xs text-muted-foreground font-semibold text-center py-6">No hay mesas activas.</span>
 ) : (
 activeMesas.map(mesa => {
 const isChecked = selectedReportMesas.has(mesa.id);
 const { habitacionNombre, clienteNombre } = mesaExtrasPorMesa(mesa.id);
 return (
 <div
 key={mesa.id}
 onClick={() => toggleMesa(mesa.id, !isChecked)}
 className={cn("p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all",
 isChecked ?"bg-primary/10 border-primary":"bg-muted border-border")}
 >
 <div className="flex items-center gap-3">
 <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", isChecked ?"bg-primary":"bg-border")}>
 {isChecked && <Check size={14} weight="bold"/>}
 </div>
 <div className="flex flex-col">
 <span className="font-extrabold text-xs text-foreground">{mesa.nombre}</span>
 {(habitacionNombre || clienteNombre) && (
 <span className="text-[10px] font-bold text-muted-foreground">
 {[
 habitacionNombre && `Hab. ${habitacionNombre.match(/\d+/)?.[0] ?? habitacionNombre}`,
 clienteNombre,
 ].filter(Boolean).join(' · ')}
 </span>
 )}
 </div>
 </div>
 </div>
 );
 })
 )}
 </div>

 <div className="flex items-center justify-between pt-2">
 <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-extrabold text-xs flex items-center gap-1.5">
 <CalendarBlank size={14} weight="bold"/> Reservas de hoy
 </span>
 </div>

 <div className="flex flex-col gap-2">
 {reservasHoy.length === 0 ? (
 <span className="text-xs text-muted-foreground font-semibold text-center py-6">No hay reservas para hoy.</span>
 ) : (
 reservasHoy.map((reserva: any) => {
 const isChecked = selectedReservas.has(reserva.id);
 return (
 <div
 key={reserva.id}
 onClick={() => toggleReserva(reserva.id, !isChecked)}
 className={cn("p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all",
 isChecked ?"bg-primary/10 border-primary":"bg-muted border-border")}
 >
 <div className="flex items-center gap-3">
 <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", isChecked ?"bg-primary":"bg-border")}>
 {isChecked && <Check size={14} weight="bold"/>}
 </div>
 <div className="flex flex-col">
 <span className="font-extrabold text-xs text-foreground">{reserva.nombre}</span>
 <span className="text-[10px] font-bold text-muted-foreground">{reserva.hora} · {reserva.personas} personas</span>
 </div>
 </div>
 </div>
 );
 })
 )}
 </div>
 </div>
 );

 const footer = (
 <div className="p-4 border-t border-border bg-card shrink-0">
 <button
 type="button"disabled={loading || (selectedReportMesas.size === 0 && selectedReservas.size === 0)}
 onClick={() => handleGenerarReporte()}
 className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
 <FileText size={16} /> Hoja A4
 </button>
 </div>
 );

 return (
 <>
 {isMobile ? (
 <Drawer open={opened} dismissible handleOnly onOpenChange={v => !v && onClose()}>
 <DrawerPortal>
 <DrawerOverlay />
 <DrawerContent className="fixed bottom-0 left-0 right-0 h-[95vh] max-h-[95vh] bg-card rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.25)] z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden">
 <DrawerTitle className="sr-only">Reporte de Cocina</DrawerTitle>
 <DrawerDescription className="sr-only">Consolidado de mesas activas para reporte de cocina</DrawerDescription>
 <DrawerHandle />
 {header}
 {body}
 {footer}
 </DrawerContent>
 </DrawerPortal>
 </Drawer>
 ) : (
 <Sheet open={opened} onOpenChange={(v: boolean) => !v && onClose()}>
 <SheetContent side="right"className="w-full max-w-md p-0 flex flex-col gap-0"showCloseButton={false}>
 <SheetTitle className="sr-only">Reporte de Cocina</SheetTitle>
 <SheetDescription className="sr-only">Consolidado de mesas activas para reporte de cocina</SheetDescription>
 {header}
 {body}
 {footer}
 </SheetContent>
 </Sheet>
 )}

 <A4ReportPreviewModal
 opened={a4PreviewOpened}
 onClose={() => setA4PreviewOpened(false)}
 mesasData={reportData}
 />
 </>
 );
}
