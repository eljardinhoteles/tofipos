import { esParteRepartida } from '../../../lib/reparto';
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
import { ClipboardText, FileText, Check } from'@phosphor-icons/react';
import { ReservaHeader } from'./ReservaHeader';
import { Button } from'@/components/ui/button';
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
 .filter((r: any) => r.fecha === hoyStr && r.estado !== 'cancelada' && r.estado !== 'completada')
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

 // Índices por id: evita un .find() sobre todas las mesas/comandas por cada mesa.
 const mesaPorId = new Map(allMesas.map(m => [m.id, m]));
 const comandaOperativaPorMesa = new Map<string, any>();
 for (const c of allComandas) {
 if (isOperativeComanda(c) && !comandaOperativaPorMesa.has(c.mesa_id)) comandaOperativaPorMesa.set(c.mesa_id, c);
 }
 const sorted = Array.from(selectedReportMesas).sort((aId, bId) => {
 const a = mesaPorId.get(aId);
 const b = mesaPorId.get(bId);
 if (!a || !b) return 0;
 return a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity:'base'});
 });

 for (const mesaId of sorted) {
 const mesa = mesaPorId.get(mesaId);
 const comanda = comandaOperativaPorMesa.get(mesaId);
 if (!mesa || !comanda) continue;

 const docs = await rxDb.comanda_items.find({
 selector: { comanda_id: comanda.id, _deleted: { $ne: true } }
 }).exec();
 const items = docs.map((d: any) => d.toJSON()).filter((it: any) => !it.anulado && !esParteRepartida(it));
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
 const items = docs.map((d: any) => d.toJSON()).filter((it: any) => !it.anulado && !esParteRepartida(it));
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

 const totalSeleccionado = selectedReportMesas.size + selectedReservas.size;

 const header = (
 <ReservaHeader
 tono="primary"
 badge={<ClipboardText size={22} weight="bold" />}
 titulo="Reporte de Cocina"
 subtitulo={totalSeleccionado > 0 ? `${totalSeleccionado} seleccionadas` : 'Consolidado de mesas activas'}
 onClose={onClose}
 />
 );

 // Fila de selección: lista plana con separador; la elegida se tiñe de azul de marca.
 const fila = (key: string, checked: boolean, onToggle: () => void, titulo: string, detalle?: string) => (
 <button
 key={key}
 type="button"
 role="checkbox"
 aria-checked={checked}
 onClick={onToggle}
 className={cn('w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer transition-colors border-b border-border/60',
 checked && 'bg-primary/10')}
 >
 <span className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors',
 checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-transparent')}>
 <Check size={14} weight="bold" />
 </span>
 <span className="flex flex-col min-w-0">
 <span className="font-extrabold text-sm text-foreground truncate">{titulo}</span>
 {detalle && <span className="text-xs font-semibold text-muted-foreground truncate">{detalle}</span>}
 </span>
 </button>
 );

 const encabezadoSeccion = (titulo: string, extra?: React.ReactNode) => (
 <div className="flex items-center justify-between px-4 py-2 border-y border-border bg-muted/40">
 <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</span>
 {extra}
 </div>
 );

 const body = (
 <div className="flex-1 overflow-y-auto">
 {encabezadoSeccion(`Mesas activas · ${activeMesas.length}`, (
 <span className="flex items-center gap-1">
 <Button type="button" variant="ghost" size="sm" onClick={handleSelectAll} className="h-6 px-2 text-[11px] font-bold">Todas</Button>
 <Button type="button" variant="ghost" size="sm" onClick={handleDeselectAll} className="h-6 px-2 text-[11px] font-bold text-muted-foreground">Ninguna</Button>
 </span>
 ))}
 {activeMesas.length === 0 ? (
 <span className="block text-xs text-muted-foreground font-semibold text-center py-8">No hay mesas activas.</span>
 ) : (
 activeMesas.map(mesa => {
 const { habitacionNombre, clienteNombre } = mesaExtrasPorMesa(mesa.id);
 const detalle = [
 habitacionNombre && `Hab. ${habitacionNombre.match(/\d+/)?.[0] ?? habitacionNombre}`,
 clienteNombre,
 ].filter(Boolean).join(' · ');
 return fila(mesa.id, selectedReportMesas.has(mesa.id), () => toggleMesa(mesa.id, !selectedReportMesas.has(mesa.id)), mesa.nombre, detalle || undefined);
 })
 )}

 {encabezadoSeccion(`Reservas de hoy · ${reservasHoy.length}`)}
 {reservasHoy.length === 0 ? (
 <span className="block text-xs text-muted-foreground font-semibold text-center py-8">No hay reservas pendientes para hoy.</span>
 ) : (
 reservasHoy.map((reserva: any) =>
 fila(reserva.id, selectedReservas.has(reserva.id), () => toggleReserva(reserva.id, !selectedReservas.has(reserva.id)),
 reserva.nombre, `${reserva.hora} · ${reserva.personas} personas`)
 )
 )}
 </div>
 );

 const footer = (
 <div className="p-4 border-t border-border bg-muted/40 shrink-0">
 <Button
 type="button"
 disabled={loading || totalSeleccionado === 0}
 onClick={() => handleGenerarReporte()}
 className="w-full h-12 font-bold gap-1.5">
 <FileText size={18} weight="bold" /> {loading ? 'Generando…' : 'Hoja A4'}
 </Button>
 </div>
 );

 return (
 <>
 {isMobile ? (
 <Drawer open={opened} dismissible handleOnly onOpenChange={v => !v && onClose()}>
 <DrawerPortal>
 <DrawerOverlay />
 <DrawerContent className="fixed bottom-0 left-0 right-0 h-dvh max-h-dvh pt-[env(safe-area-inset-top)] bg-card rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.25)] z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden">
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
 <SheetContent side="right" showCloseButton={false} className="data-[side=right]:w-full data-[side=right]:sm:max-w-[462px] p-0 flex flex-col gap-0 data-[side=right]:border-l-0">
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
