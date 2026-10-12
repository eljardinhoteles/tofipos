import { useEffect, useState, useMemo } from'react';
import { folioLabel } from '../../../lib/folio';
import { Door, Check } from'@phosphor-icons/react';
import type { Comanda } from'../../../db/database';
import { showToast } from'@/lib/toast';
import { useIvaActivo } from'../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from'../../../lib/taxUtils';
import { SubcuentaChips } from'./habitacion/SubcuentaChips';
import { filtrarCuentasHabitacionVigentes } from'../../../lib/habitacionCuentas';
import { ReservaHeader } from'./ReservaHeader';
import { initVerticalRxDb, updateRxComanda, liberarMesaSiSinOperativas } from'../../../db/rxdb';

interface SidebarEnviarHabitacionProps {
 activeComanda: Comanda;
 onBack: () => void;
 onSuccess: () => void;
}

export function SidebarEnviarHabitacion({ activeComanda, onBack, onSuccess }: SidebarEnviarHabitacionProps) {
 const [selectedCuentaId, setSelectedCuentaId] = useState<string | null>(null);
 const [selectedSubcuentaId, setSelectedSubcuentaId] = useState<string | null>(null);
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

 const [docsCuentas, docsMesas] = await Promise.all([
 rxDb.habitacion_cuentas.find({ selector: { estado:'activa', _deleted: { $ne: true } } }).exec(),
 rxDb.mesas.find({ selector: { _deleted: { $ne: true } } }).exec(),
 ]);
 if (alive) setCuentasActivas(filtrarCuentasHabitacionVigentes(
 docsCuentas.map((doc: any) => doc.toJSON()),
 docsMesas.map((doc: any) => doc.toJSON())
 ));

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
 habitacion_subcuenta_id: selectedSubcuentaId,
 total: totales.total,
 confirmada: true,
 sincronizado: true,
 });

 await liberarMesaSiSinOperativas(activeComanda.mesa_id);
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
 <ReservaHeader tono="neutro" badge={null} titulo="Enviar a Habitación" subtitulo={`Comanda #${folioLabel(activeComanda)}`} onBack={onBack} />

 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
 {cuentasActivas.map((cuenta) => {
 const isSelected = selectedCuentaId === cuenta.id;
 return (
 <div
 key={cuenta.id}
 onClick={() => { setSelectedCuentaId(cuenta.id); setSelectedSubcuentaId(null); }}
 className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer ${
 isSelected ?'bg-primary/10 border-primary':'bg-muted border-border'}`}
 >
 <div className="flex items-center gap-3">
 <Door size={20} className={isSelected ?'text-primary':'text-muted-foreground'} />
 <div className="flex flex-col">
 <span className="t-dato text-foreground">{cuenta.huesped}</span>
 <span className="t-meta text-muted-foreground">Habitación activa</span>
 </div>
 </div>
 </div>
 );
 })}

 {(() => {
 const cuentaSel = cuentasActivas.find((c) => c.id === selectedCuentaId);
 const subs = cuentaSel?.subcuentas ?? [];
 if (subs.length === 0) return null;
 return (
 <div className="flex flex-col gap-2 pt-3 border-t border-border">
 <span className="t-etiqueta text-muted-foreground">Cargar a la subcuenta</span>
 <SubcuentaChips subcuentas={subs} value={selectedSubcuentaId} onChange={setSelectedSubcuentaId} nombrePrincipal={cuentaSel?.principal_nombre || 'Principal'} />
 </div>
 );
 })()}
 </main>

 <footer className="p-4 border-t border-border">
 <button
 type="button"disabled={!selectedCuentaId || isProcessing}
 onClick={handleEnviar}
 className="w-full py-3.5 rounded-2xl bg-primary disabled:opacity-40 text-primary-foreground t-dato flex items-center justify-center gap-2 cursor-pointer shadow-xs">
 <Check size={18} weight="bold"/> Confirmar Cargo (${totales.total.toFixed(2)})
 </button>
 </footer>
 </div>
 );
}
