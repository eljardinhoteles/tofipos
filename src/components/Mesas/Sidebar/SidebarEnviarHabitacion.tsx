import { useEffect, useState, useMemo } from'react';
import { ArrowLeft, Door, Check } from'@phosphor-icons/react';
import type { Comanda } from'../../../db/database';
import { showToast } from'@/lib/toast';
import { useIvaActivo } from'../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { initVerticalRxDb, updateRxComanda, updateRxMesa } from'../../../db/rxdb';

interface SidebarEnviarHabitacionProps {
 activeComanda: Comanda;
 onBack: () => void;
 onSuccess: () => void;
}

export function SidebarEnviarHabitacion({ activeComanda, onBack, onSuccess }: SidebarEnviarHabitacionProps) {
 const [selectedCuentaId, setSelectedCuentaId] = useState<string | null>(null);
 const [isProcessing, setIsProcessing] = useState(false);
 const [menuItems] = useState<any[]>([]);
 const [cuentasActivas, setCuentasActivas] = useState<any[]>([]);
 const [comandaItems, setComandaItems] = useState<any[]>([]);

 const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();

 useEffect(() => {
 let alive = true;
 const run = async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;

 const docsCuentas = await rxDb.habitacion_cuentas.find({ selector: { estado:'activa', _deleted: { $ne: true } } }).exec();
 if (alive) setCuentasActivas(docsCuentas.map((doc: any) => doc.toJSON()));

 const docsItems = await rxDb.comanda_items.find({ selector: { comanda_id: activeComanda.id, _deleted: { $ne: true } } }).exec();
 if (alive) setComandaItems(docsItems.map((doc: any) => doc.toJSON()));
 };
 run().catch(console.error);
 return () => { alive = false; };
 }, [activeComanda.id]);

 const totales = useMemo(
 () => calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva),
 [comandaItems, menuItems, ivaPorcentaje, preciosConIva]
 );

 const handleEnviar = async () => {
 if (!selectedCuentaId) return;
 setIsProcessing(true);
 try {
 await updateRxComanda(activeComanda.id, {
 habitacion_cuenta_id: selectedCuentaId,
 total: totales.total,
 confirmada: true,
 sincronizado: true,
 });

 await updateRxMesa(activeComanda.mesa_id, { estado:'libre'});
 showToast.success('Cargo enviado a habitación');
 onSuccess();
 } catch {
 showToast.error('Error al enviar cargo');
 } finally {
 setIsProcessing(false);
 }
 };

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 <header className="p-4 border-b border-border flex items-center justify-between shrink-0 shadow-xs">
 <div className="flex items-center gap-3">
 <button type="button"onClick={onBack} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
 <ArrowLeft size={18} />
 </button>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground leading-tight">Enviar a Habitación</h3>
 <span className="text-[10px] font-bold text-muted-foreground">Comanda #{activeComanda.folio}</span>
 </div>
 </div>
 </header>

 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
 {cuentasActivas.map((cuenta) => {
 const isSelected = selectedCuentaId === cuenta.id;
 return (
 <div
 key={cuenta.id}
 onClick={() => setSelectedCuentaId(cuenta.id)}
 className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer ${
 isSelected ?'bg-primary/10 border-primary':'bg-muted border-border'}`}
 >
 <div className="flex items-center gap-3">
 <Door size={20} className={isSelected ?'text-primary':'text-muted-foreground'} />
 <div className="flex flex-col">
 <span className="font-extrabold text-xs text-foreground">{cuenta.huesped}</span>
 <span className="text-[10px] text-muted-foreground font-semibold">Habitación activa</span>
 </div>
 </div>
 </div>
 );
 })}
 </main>

 <footer className="p-4 border-t border-border">
 <button
 type="button"disabled={!selectedCuentaId || isProcessing}
 onClick={handleEnviar}
 className="w-full py-3.5 rounded-xl bg-primary disabled:opacity-40 text-primary-foreground font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs">
 <Check size={18} weight="bold"/> Confirmar Cargo (${totales.total.toFixed(2)})
 </button>
 </footer>
 </div>
 );
}
