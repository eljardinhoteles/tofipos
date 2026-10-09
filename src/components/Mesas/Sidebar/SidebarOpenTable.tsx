import { HabitacionOpcion } from './habitacion/HabitacionOpcion';
import { filtrarCuentasHabitacionVigentes } from '../../../lib/habitacionCuentas';
import { useEffect, useState } from'react';
import { X, Users, Minus, Plus, Check } from'@phosphor-icons/react';
import type { Mesa } from'../../../db/database';
import { initVerticalRxDb } from'../../../db/rxdb';
import { Tabs, TabsList, TabsTrigger } from'@/components/ui/tabs';
import { Input } from'@/components/ui/input';
import { Button } from'@/components/ui/button';
import { ClienteSelector } from'@/components/Common/ClienteSelector';

interface SidebarOpenTableProps {
 selectedMesa: Mesa;
 customerName: string;
 setCustomerName: (val: string) => void;
 /** Cliente elegido de la lista (su id). null = nombre escrito a mano, sin vincular. */
 clienteId: string | null;
 setClienteId: (id: string | null) => void;
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
 clienteId,
 setClienteId,
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
 let cuentasRaw: any[] = cuentasDocs.map((doc: any) => doc.toJSON());
 let mesasRaw: any[] = mesasDocs.map((doc: any) => doc.toJSON());
 // Solo cuentas vigentes: de esta organización, con habitación existente y una por habitación.
 const publicar = () => {
 setAllMesas(mesasRaw);
 setActiveCuentas(filtrarCuentasHabitacionVigentes(cuentasRaw, mesasRaw));
 };
 publicar();
 unsubs = [
 cuentasQuery.$.subscribe((docs: any[]) => { cuentasRaw = docs.map((doc: any) => doc.toJSON()); publicar(); }) as any,
 mesasQuery.$.subscribe((docs: any[]) => { mesasRaw = docs.map((doc: any) => doc.toJSON()); publicar(); }) as any,
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

 const titulo = 'text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground';

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden">
 {/* Header — en desktop el fondo completo es color primary; en móvil el fondo
 queda neutro y solo el badge del número de mesa lleva el color, igual que
 en SidebarDetails (un header sólido se ve mal dentro del bottom-sheet). */}
 <header className="p-4 bg-card text-foreground md:bg-primary md:text-primary-foreground flex items-center justify-between shrink-0 shadow-xs">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground md:bg-primary-foreground/15 md:text-primary-foreground font-black text-base flex items-center justify-center shrink-0">
 {selectedMesa.nombre.toLowerCase().startsWith('mesa')
 ? selectedMesa.nombre.replace(/^Mesa\s*/i, '')
 : selectedMesa.nombre}
 </div>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base md:text-primary-foreground leading-tight">{tableDisplay}</h3>
 <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground md:text-primary-foreground/70">
 Apertura de Mesa
 </span>
 </div>
 </div>

 <Button variant="ghost" size="icon-lg" aria-label="Cerrar" onClick={onClose}
 className="rounded-xl bg-muted text-muted-foreground md:bg-white/15 md:hover:bg-white/25 md:text-primary-foreground">
 <X size={18} weight="bold"/>
 </Button>
 </header>

 {/* Cuerpo Scrollable */}
 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
 {/* Comensales: mismo selector grande que el panel de productos */}
 <section className="flex flex-col gap-3">
 <h4 className={titulo}>Comensales</h4>
 <div className="flex items-center h-14 rounded-full border border-border overflow-hidden">
 <button type="button" aria-label="Menos" disabled={guestCount <= 1} onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
 className="h-full w-20 flex items-center justify-center text-foreground cursor-pointer active:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors">
 <Minus size={20} weight="bold"/>
 </button>
 <Input
 id="guest-count" type="number" inputMode="numeric" min={1} aria-label="Cantidad de comensales"
 value={guestCount || ''}
 onChange={(e) => setGuestCount(Math.max(0, Number(e.target.value)))}
 className="h-full flex-1 rounded-none border-0 shadow-none focus-visible:ring-0 text-center text-2xl font-black tabular-nums bg-transparent"/>
 <button type="button" aria-label="Más" onClick={() => setGuestCount(guestCount + 1)}
 className="h-full w-20 flex items-center justify-center text-foreground cursor-pointer active:bg-muted transition-colors">
 <Plus size={20} weight="bold"/>
 </button>
 </div>
 </section>

 {/* Cliente o Habitación: una sola acción a la vez */}
 <section className="flex flex-col gap-3">
 <h4 className={titulo}>Vincular a</h4>
 <Tabs
 value={openLinkMode}
 onValueChange={(v) => {
 if (v === 'manual') {
 setOpenLinkMode('manual');
 setSelectedHabitacionId(null);
 } else if (activeCuentas.length > 0) {
 setOpenLinkMode('habitacion');
 }
 }}
 >
 <TabsList aria-label="Vincular la mesa a">
 <TabsTrigger value="manual">Cliente</TabsTrigger>
 <TabsTrigger value="habitacion" disabled={activeCuentas.length === 0}>Habitación activa</TabsTrigger>
 </TabsList>
 </Tabs>

 {openLinkMode ==='manual'? (
 <>
 <ClienteSelector
 id="customer-search"
 value={customerName}
 onChange={(nombre) => {
 setCustomerName(nombre);
 setClienteId(null);
 setOpenLinkMode('manual');
 setSelectedHabitacionId(null);
 }}
 onSelect={(c) => setClienteId(c.id)}
 />

 {/* Cliente elegido de la lista */}
 {clienteId && (
 <span className="flex items-center gap-1.5 text-xs font-bold text-success-foreground">
 <Check size={14} weight="bold" /> Cliente vinculado
 </span>
 )}

 </>
 ) : (
 <div className="flex flex-col gap-2">
 {activeCuentas.map(cuenta => (
 <HabitacionOpcion
 key={cuenta.id}
 mesaNombre={allMesas.find(m => m.id === cuenta.mesa_id)?.nombre}
 huesped={cuenta.huesped}
 seleccionada={selectedHabitacionId === cuenta.id}
 onSelect={() => handlePickHabitacion(cuenta)}
 />
 ))}
 </div>
 )}
 </section>
 </main>

 {/* Footer fijo con fondo sutil, como el de la comanda */}
 <footer className="p-4 border-t border-border bg-muted/40 flex items-center gap-2 shrink-0">
 <Button variant="outline" onClick={onClose} className="h-12 px-5 font-bold">
 Cancelar
 </Button>
 <Button onClick={onOpenTable} disabled={guestCount === 0} className="h-12 flex-1 gap-2 font-bold">
 <Users size={18} weight="bold"/>
 Abrir mesa
 </Button>
 </footer>
 </div>
 );
}
