import { memo } from'react';
import { cn } from'@/lib/utils';

export interface ComandaItemData {
 id: string;
 nombre: string;
 cantidad: number;
 precio: number;
 modificadores?: string[];
 pagado_cantidad?: number;
}

interface ComandaItemRowProps {
 item: ComandaItemData;
 index: number;
 onClick?: () => void;
 isSelected?: boolean;
}

export const ComandaItemRow = memo(function ComandaItemRow({ item, index, onClick, isSelected }: ComandaItemRowProps) {
 const pagado = item.pagado_cantidad || 0;
 const isFullyPaid = item.cantidad > 0 && pagado >= item.cantidad;
 const isReadOnly = !onClick;
 const isOdd = index % 2 === 1;

 const content = (
 <div className="flex items-center gap-3 w-full px-4 py-3">
 {/* Badge de cantidad */}
 <div className={cn("w-7 h-7 rounded-md font-bold text-xs flex items-center justify-center border shrink-0",
 isFullyPaid ?"bg-emerald-100 border-emerald-300 text-emerald-800":"bg-muted border-border text-foreground")}>
 {item.cantidad}
 </div>

 {/* Contenido */}
 <div className="flex flex-col flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <span className="font-bold text-sm text-foreground truncate">{item.nombre}</span>
 <span className={cn("font-black text-sm shrink-0",
 isFullyPaid ?"line-through text-muted-foreground":"text-foreground")}>
 ${(item.precio * item.cantidad).toLocaleString('en-US', { minimumFractionDigits: 2 })}
 </span>
 </div>

 {(item.modificadores?.length || pagado > 0 || item.cantidad > 1) ? (
 <div className="flex items-center justify-between gap-2 mt-0.5">
 <div className="flex items-center gap-1 flex-wrap">
 {item.modificadores && item.modificadores.length > 0 &&
 item.modificadores.map((mod, i) => (
 <span key={`${mod}-${i}`} className="px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground font-medium text-[10px]">
 {mod}
 </span>
 ))
 }
 {pagado > 0 && (
 <span className={cn("px-1.5 py-0.5 rounded font-bold text-[10px] text-white",
 isFullyPaid ?"bg-emerald-600":"bg-amber-600")}>
 {isFullyPaid ?'Pagado':`${pagado} pagados`}
 </span>
 )}
 </div>
 {item.cantidad > 1 && (
 <span className="text-[10px] text-muted-foreground font-semibold shrink-0">
 ${item.precio.toLocaleString('en-US', { minimumFractionDigits: 2 })} c/u
 </span>
 )}
 </div>
 ) : null}
 </div>
 </div>
 );

 return (
 <div className={cn("w-full transition-opacity", isFullyPaid &&"opacity-60")}>
 {isReadOnly ? (
 <div className={cn("w-full text-left transition-colors", isOdd &&"bg-muted/70")}>
 {content}
 </div>
 ) : (
 <button
 type="button"onClick={onClick}
 className={cn("w-full text-left cursor-pointer transition-colors focus:outline-none focus-visible:bg-primary/10 border-l-4",
 isSelected
 ?"bg-primary/10 border-l-primary"
 :cn("border-l-transparent", isOdd &&"bg-muted/70"))}
 >
 {content}
 </button>
 )}
 </div>
 );
});
