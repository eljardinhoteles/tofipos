import { Bed, ForkKnife, User } from'@phosphor-icons/react';
import { type Comanda, type Mesa, type ComandaItem } from'../../db/database';

interface FacturadasListProps {
 comandas: Comanda[];
 mesas: Mesa[];
 comandaItems: ComandaItem[];
 onViewInvoice: (comanda: Comanda) => void;
}

export function FacturadasList({ comandas, mesas, comandaItems, onViewInvoice }: FacturadasListProps) {
 return (
 <div className="bg-card rounded-2xl border border-border shadow-xs overflow-hidden w-full">
 <table className="w-full text-left text-xs">
 <thead className="bg-muted border-b border-border text-muted-foreground font-bold uppercase tracking-wider">
 <tr>
 <th className="px-6 py-3.5">Mesa / Folio</th>
 <th className="px-6 py-3.5 hidden sm:table-cell">Factura Nro</th>
 <th className="px-6 py-3.5">Total</th>
 <th className="px-6 py-3.5 hidden sm:table-cell">Fecha</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {comandas.map(comanda => {
 const mesa = mesas.find(m => m.id === comanda.mesa_id);
 const items = comandaItems.filter(i => i.comanda_id === comanda.id);
 const total = items.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);

 return (
 <tr
 key={comanda.id}
 onClick={() => onViewInvoice(comanda)}
 className="transition-colors cursor-pointer">
 <td className="px-6 py-4">
 <div className="flex flex-col gap-1">
 <div className="flex items-center gap-1.5 text-primary font-extrabold text-sm">
 <User size={14} />
 <span>{comanda.cliente ||'Sin cliente'}</span>
 </div>

 <span className="text-[11px] text-muted-foreground font-semibold pl-5">
 Comanda #{comanda.folio}
 </span>

 <div className="flex items-center gap-1.5 text-foreground/80 font-bold text-xs pl-5">
 {comanda.habitacion_cuenta_id ? <Bed size={14} /> : <ForkKnife size={14} />}
 <span>
 {(() => {
 const name = mesa?.nombre || comanda.mesa_nombre ||'Desconocida';
 const prefix = name.toLowerCase().startsWith('mesa') || name.toLowerCase().startsWith('hab') ?'':'Mesa';
 return`${prefix}${name}`;
 })()}
 </span>
 </div>
 </div>
 </td>

 <td className="px-6 py-4 hidden sm:table-cell">
 <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary font-bold text-xs">
 {comanda.factura_nro ||'Sin factura'}
 </span>
 </td>

 <td className="px-6 py-4 font-black text-foreground text-sm">
 ${total.toFixed(2)}
 </td>

 <td className="px-6 py-4 hidden sm:table-cell">
 <div className="flex flex-col text-foreground/70 font-medium">
 <span className="font-bold text-xs">{new Date(comanda.updated_at).toLocaleDateString()}</span>
 <span className="text-[10px] text-muted-foreground">
 {new Date(comanda.updated_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit'})}
 </span>
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 );
}
