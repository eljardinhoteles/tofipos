import { useEffect, useState } from'react';
import { X, MapPin } from'@phosphor-icons/react';
import { type Mesa } from'../../db/database';
import { useIvaActivo } from'../../hooks/useIvaActivo';
import { initVerticalRxDb } from'../../db/rxdb';

interface OrdenDetailModalProps {
 comandaId: string | null;
 onClose: () => void;
 onAction: (mesa: Mesa, action: string) => void;
}

export function OrdenDetailModal({ comandaId, onClose, onAction: _onAction }: OrdenDetailModalProps) {
 const [comanda, setComanda] = useState<any | null>(null);
 const [items] = useState<any[]>([]);
 const { valor: ivaValor } = useIvaActivo();

 useEffect(() => {
 let alive = true;
 (async () => {
 if (!comandaId) return;
 const rxDb = await initVerticalRxDb();
 const c = await rxDb.comandas.findOne(comandaId).exec();
 if (!alive) return;
 setComanda(c ? c.toJSON() : null);
 })();
 return () => { alive = false; };
 }, [comandaId]);

 if (!comandaId || !comanda) return null;

 const subtotal = items.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
 const iva = subtotal * ivaValor;
 const total = subtotal + iva;

 return (
 <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4">
 <div className="bg-card rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col p-6 gap-4">
 <div className="flex items-center justify-between border-b border-border pb-3">
 <div className="flex items-center gap-3">
 <MapPin size={24} className="text-primary"/>
 <div className="flex flex-col">
 <h3 className="font-black text-lg text-foreground">Mesa {comanda.mesa_nombre ||'N/A'}</h3>
 <span className="text-xs font-bold text-muted-foreground">Folio #{comanda.folio}</span>
 </div>
 </div>
 <button type="button"onClick={onClose} className="text-muted-foreground">
 <X size={20} />
 </button>
 </div>

 <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
 {items.map((item) => (
 <div key={item.id} className="p-3 rounded-xl bg-muted flex items-center justify-between">
 <span className="font-extrabold text-xs text-foreground">{item.cantidad}x {item.nombre}</span>
 <span className="font-black text-xs text-foreground">${(item.precio * item.cantidad).toFixed(2)}</span>
 </div>
 ))}
 </div>

 <div className="flex items-center justify-between pt-3 border-t border-border font-extrabold text-base">
 <span>Total</span>
 <span className="text-primary text-lg font-black">${total.toFixed(2)}</span>
 </div>
 </div>
 </div>
 );
}
