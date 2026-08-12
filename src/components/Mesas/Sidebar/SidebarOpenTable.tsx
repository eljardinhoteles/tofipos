import { useEffect, useState } from'react';
import { X, Users, Check, Minus, Plus } from'@phosphor-icons/react';
import type { Mesa } from'../../../db/database';
import { initVerticalRxDb } from'../../../db/rxdb';
import { cn } from'@/lib/utils';
import { Input } from'@/components/ui/input';
import { Button } from'@/components/ui/button';
import { Label } from'@/components/ui/label';
import { ClienteSelector } from'@/components/Common/ClienteSelector';

interface SidebarOpenTableProps {
 selectedMesa: Mesa;
 customerName: string;
 setCustomerName: (val: string) => void;
 guestCount: number;
 setGuestCount: (val: number) => void;
 openLinkMode:'manual'|'habitacion';
 setOpenLinkMode: (mode:'manual'|'habitacion') => void;
 selectedHabitacionId: string | null;
 setSelectedHabitacionId: (id: string | null) => void;
 onClose: () => void;
 onOpenTable: () => void;
}

export function SidebarOpenTable({
 selectedMesa,
 customerName,
 setCustomerName,
 guestCount,
 setGuestCount,
 openLinkMode,
 setOpenLinkMode,
 selectedHabitacionId,
 setSelectedHabitacionId,
 onClose,
 onOpenTable,
}: SidebarOpenTableProps) {
 const [activeCuentas, setActiveCuentas] = useState<any[]>([]);
 const [allMesas, setAllMesas] = useState<any[]>([]);

 useEffect(() => {
 let alive = true;
 let unsubs: Array<{ unsubscribe: () => void } | null> = [];
 const run = async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const cuentasQuery = rxDb.habitacion_cuentas.find({ selector: { estado:'activa', _deleted: { $ne: true } } });
 const mesasQuery = rxDb.mesas.find({ selector: { _deleted: { $ne: true } } });
 const [cuentasDocs, mesasDocs] = await Promise.all([cuentasQuery.exec(), mesasQuery.exec()]);
 if (!alive) return;
 setActiveCuentas(cuentasDocs.map((doc: any) => doc.toJSON()));
 setAllMesas(mesasDocs.map((doc: any) => doc.toJSON()));
 unsubs = [
 cuentasQuery.$.subscribe((docs: any[]) => setActiveCuentas(docs.map((doc: any) => doc.toJSON()))) as any,
 mesasQuery.$.subscribe((docs: any[]) => setAllMesas(docs.map((doc: any) => doc.toJSON()))) as any,
 ];
 };
 run().catch(console.error);
 return () => {
 alive = false;
 unsubs.forEach((sub) => sub?.unsubscribe());
 };
 }, []);

 useEffect(() => {
 if (selectedHabitacionId) {
 setOpenLinkMode('habitacion');
 } else {
 setOpenLinkMode('manual');
 }
 }, [selectedHabitacionId, setOpenLinkMode]);

 const tableDisplay = selectedMesa.nombre.toLowerCase().startsWith('mesa')
 ? selectedMesa.nombre
 :`Mesa ${selectedMesa.nombre}`;

 const handlePickHabitacion = (cuenta: any) => {
 setOpenLinkMode('habitacion');
 setSelectedHabitacionId(cuenta.id);
 setCustomerName(cuenta.huesped);
 };

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden">
 {/* Header — en desktop el fondo completo es color primary; en móvil el fondo
 queda neutro y solo el badge del número de mesa lleva el color, igual que
 en SidebarDetails (un header sólido se ve mal dentro del bottom-sheet). */}
 <header className="p-4 bg-card text-foreground md:bg-primary md:text-primary-foreground flex items-center justify-between shrink-0 shadow-xs">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground md:bg-primary-foreground/15 md:text-primary-foreground font-black text-base flex items-center justify-center shrink-0">
 {selectedMesa.nombre.toLowerCase().startsWith('mesa')
 ? selectedMesa.nombre.split('').pop()
 : selectedMesa.nombre}
 </div>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base md:text-primary-foreground leading-tight">{tableDisplay}</h3>
 <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground md:text-primary-foreground/70">
 Apertura de Mesa
 </span>
 </div>
 </div>

 <Button variant="ghost"size="icon-lg"onClick={onClose} className="rounded-xl text-muted-foreground md:text-primary-foreground">
 <X size={18} weight="bold"/>
 </Button>
 </header>

 {/* Cuerpo Scrollable */}
 <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
 {/* Comensales */}
 <div className="flex flex-col gap-2">
 <Label htmlFor="guest-count">Comensales</Label>
 <div className="flex items-center gap-2">
 <Button
 type="button"variant="outline"size="icon"onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
 >
 <Minus size={14} weight="bold"/>
 </Button>
 <Input
 id="guest-count"type="number"min={1}
 placeholder="Cantidad de personas"value={guestCount ||''}
 onChange={(e) => setGuestCount(Math.max(0, Number(e.target.value)))}
 className="text-center tabular-nums"/>
 <Button
 type="button"variant="outline"size="icon"onClick={() => setGuestCount(guestCount + 1)}
 >
 <Plus size={14} weight="bold"/>
 </Button>
 </div>
 </div>

 {/* Cliente o Habitación: una sola acción a la vez */}
 <div className="flex flex-col gap-2">
 <Label>Vincular a</Label>
 <div className="grid grid-cols-2 p-1 bg-muted/50 rounded-2xl text-xs font-semibold">
 <button
 type="button"onClick={() => {
 setOpenLinkMode('manual');
 setSelectedHabitacionId(null);
 }}
 className={cn("py-1.5 rounded-xl transition-all cursor-pointer",
 openLinkMode ==='manual'?"bg-background text-foreground shadow-sm font-bold":"text-muted-foreground")}
 >
 Cliente
 </button>
 <button
 type="button"disabled={activeCuentas.length === 0}
 onClick={() => {
 if (activeCuentas.length === 0) return;
 setOpenLinkMode('habitacion');
 }}
 className={cn("py-1.5 rounded-xl transition-all cursor-pointer disabled:opacity-40",
 openLinkMode ==='habitacion'?"bg-background text-foreground shadow-sm font-bold":"text-muted-foreground")}
 >
 Habitación Activa
 </button>
 </div>

 {openLinkMode ==='manual'? (
 <ClienteSelector
 id="customer-search"
 value={customerName}
 onChange={(nombre) => {
 setCustomerName(nombre);
 setOpenLinkMode('manual');
 setSelectedHabitacionId(null);
 }}
 />
 ) : (
 <div className="flex flex-col gap-2">
 {activeCuentas.map(cuenta => {
 const mesa = allMesas.find(m => m.id === cuenta.mesa_id);
 const roomNum = mesa
 ? (mesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || mesa.nombre)
 : cuenta.mesa_id;
 const roomType = mesa?.nombre.match(/\(([^)]+)\)/)?.[1] ||'';
 const isSelected = selectedHabitacionId === cuenta.id;
 return (
 <button
 key={cuenta.id}
 type="button"onClick={() => handlePickHabitacion(cuenta)}
 className={cn("p-2.5 rounded-2xl border flex items-center justify-between transition-all cursor-pointer text-left",
 isSelected
 ?"border-ring ring-3 ring-ring/30 bg-input/50":"border-transparent bg-input/50")}
 >
 <div className="flex items-center gap-3">
 <div className={cn("w-8 h-8 rounded-xl font-bold text-sm flex items-center justify-center shrink-0",
 isSelected ?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground")}>
 {roomNum}
 </div>
 <div className="flex flex-col">
 <span className="font-medium text-sm text-foreground">{cuenta.huesped}</span>
 {roomType && <span className="text-xs text-muted-foreground">{roomType}</span>}
 </div>
 </div>
 {isSelected && (
 <Check size={16} weight="bold"className="text-primary shrink-0"/>
 )}
 </button>
 );
 })}
 </div>
 )}
 </div>
 </main>

 {/* Footer Fijo */}
 <footer className="p-6 border-t border-border bg-background flex items-center justify-end gap-3 shrink-0">
 <Button
 variant="outline"onClick={onClose}
 >
 Cancelar
 </Button>
 <Button
 onClick={onOpenTable}
 disabled={guestCount === 0}
 className="gap-2">
 <Users size={18} weight="bold"/>
 Abrir Mesa
 </Button>
 </footer>
 </div>
 );
}
