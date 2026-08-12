import { useEffect, useState } from'react';
import { ArrowLeft } from'@phosphor-icons/react';
import type { Mesa } from'../../../db/database';
import { initVerticalRxDb } from'../../../db/rxdb';

interface SidebarSeleccionarMesaProps {
 onSelectMesa: (mesa: Mesa) => void;
 onClose: () => void;
}

export function SidebarSeleccionarMesa({ onSelectMesa, onClose }: SidebarSeleccionarMesaProps) {
 const [mesasLibres, setMesasLibres] = useState<Mesa[]>([]);

 useEffect(() => {
 let alive = true;
 const run = async () => {
 const rxDb = await initVerticalRxDb();
 if (!alive) return;
 const docs = await rxDb.mesas.find({ selector: { estado:'libre', _deleted: { $ne: true } } }).exec();
 if (!alive) return;
 setMesasLibres(docs.map((doc: any) => doc.toJSON()).filter((mesa: Mesa) => mesa.piso?.toLowerCase() !=='habitaciones'));
 };
 run().catch(console.error);
 return () => { alive = false; };
 }, []);

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 <header className="p-4 border-b border-border flex items-center justify-between shrink-0 shadow-xs">
 <div className="flex items-center gap-3">
 <button type="button"onClick={onClose} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
 <ArrowLeft size={18} />
 </button>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground leading-tight">Seleccionar Mesa</h3>
 <span className="text-[10px] font-bold text-muted-foreground">Elige la mesa libre</span>
 </div>
 </div>
 </header>

 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
 {mesasLibres.map((mesa) => (
 <div
 key={mesa.id}
 onClick={() => onSelectMesa(mesa)}
 className="p-3 rounded-xl bg-muted border border-border flex items-center justify-between cursor-pointer">
 <span className="font-extrabold text-xs text-foreground">{mesa.nombre}</span>
 <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">Libre</span>
 </div>
 ))}
 </main>
 </div>
 );
}
