import { esMesaBarra } from '../../../lib/mesaBarra';
import { useEffect, useState } from'react';
import type { Mesa } from'../../../db/database';
import { ReservaHeader } from'./ReservaHeader';
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
 setMesasLibres(docs.map((doc: any) => doc.toJSON()).filter((mesa: Mesa) => mesa.piso?.toLowerCase() !=='habitaciones' && !esMesaBarra(mesa)));
 };
 run().catch(console.error);
 return () => { alive = false; };
 }, []);

 return (
 <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
 <ReservaHeader tono="neutro" badge={null} titulo="Seleccionar Mesa" subtitulo="Elige la mesa libre" onBack={onClose} />

 <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
 {mesasLibres.map((mesa) => (
 <div
 key={mesa.id}
 onClick={() => onSelectMesa(mesa)}
 className="p-3 rounded-2xl bg-muted border border-border flex items-center justify-between cursor-pointer">
 <span className="t-dato text-foreground">{mesa.nombre}</span>
 <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground t-dato">Libre</span>
 </div>
 ))}
 </main>
 </div>
 );
}
