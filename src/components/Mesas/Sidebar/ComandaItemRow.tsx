import { memo } from'react';
import { CheckCircle } from'@phosphor-icons/react';
import { cn } from'@/lib/utils';

export interface ComandaItemData {
 id: string;
 nombre: string;
 cantidad: number;
 precio: number;
 modificadores?: string[];
 pagado_cantidad?: number;
 anulado?: boolean;
 anulado_motivo?: string | null;
 cortesia_cantidad?: number | null;
 cortesia_motivo?: string | null;
}

interface ComandaItemRowProps {
 item: ComandaItemData;
 index: number;
 onClick?: () => void;
 isSelected?: boolean;
 // Ítem ya confirmado/enviado a cocina — no editable/borrable normalmente,
 // solo anulable. Calculado por el padre (esItemBloqueado), este componente
 // no conoce confirmada_at ni ninguna lógica de negocio.
 isLocked?: boolean;
}

export const ComandaItemRow = memo(function ComandaItemRow({ item, onClick, isSelected, isLocked }: ComandaItemRowProps) {
 const pagado = item.pagado_cantidad || 0;
 const isFullyPaid = item.cantidad > 0 && pagado >= item.cantidad;
 const isAnulado = !!item.anulado;
 const isCortesia = (item.cortesia_cantidad || 0) > 0 || !!item.cortesia_motivo;
 const isReadOnly = !onClick;

 const dinero = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
 const tachado = isAnulado || isFullyPaid;

 // Lista legible: cantidad ("2") | nombre y detalle en texto plano | precio.
 // Sin fondos ni recuadros; la jerarquía la dan el peso y el color del texto.
 const content = (
 <div className="flex items-start gap-3 w-full px-4 py-3">
 <span className={cn("w-8 shrink-0 self-center text-center text-xl leading-6 font-bold tracking-[-0.04em]",
 isAnulado ?"text-destructive": isFullyPaid ?"text-emerald-700":"text-primary")}>
 {item.cantidad}
 </span>

 <div className="flex flex-col flex-1 min-w-0 gap-0.5">
 <div className="flex items-start justify-between gap-3">
 <span className={cn("font-bold text-[17px] leading-6 break-words",
 isAnulado ?"line-through text-muted-foreground":"text-foreground")}>
 {item.nombre}
 </span>
 <span className="flex items-center gap-1.5 shrink-0 leading-6">
 <span className={cn("font-medium text-base tabular-nums",
 tachado ?"line-through text-muted-foreground":"text-foreground")}>
 {dinero(item.precio * item.cantidad)}
 </span>
 {isLocked && !isAnulado && <CheckCircle size={14} weight="fill"className="text-emerald-500/70 shrink-0"aria-label="Confirmado"/>}
 </span>
 </div>

 {item.modificadores && item.modificadores.length > 0 && (
 <span className="flex items-baseline gap-2 text-[15px] font-medium text-[#9a6b3d] leading-snug">
 <span aria-hidden="true"className="w-1.5 h-1.5 rounded-full bg-[#9a6b3d] shrink-0 translate-y-[-1px]"/>
 <span>{item.modificadores.join(' · ')}</span>
 </span>
 )}

 {(isAnulado || isCortesia || pagado > 0) && (
 <div className="flex items-center gap-2 flex-wrap text-[13px] font-bold">
 {isAnulado && <span className="text-destructive">ANULADO</span>}
 {isCortesia && <span className="text-emerald-700">CORTESÍA</span>}
 {pagado > 0 && (
 <span className={isFullyPaid ?"text-emerald-700":"text-amber-700"}>
 {isFullyPaid ?'Pagado':`${pagado} pagados`}
 </span>
 )}
 </div>
 )}

 {isAnulado && item.anulado_motivo && (
 <span className="text-[15px] text-muted-foreground">Motivo: {item.anulado_motivo}</span>
 )}
 {isCortesia && item.cortesia_motivo && (
 <span className="text-[15px] text-muted-foreground">Motivo: {item.cortesia_motivo}</span>
 )}
 </div>
 </div>
 );

 return (
 <div className={cn("w-full transition-opacity", (isFullyPaid || isAnulado) &&"opacity-60")}>
 {isReadOnly ? (
 <div className="w-full text-left">
 {content}
 </div>
 ) : (
 <button
 type="button"onClick={onClick}
 className={cn("w-full text-left cursor-pointer focus:outline-none focus-visible:bg-primary/10 border-l-4",
 isSelected
 ?"bg-primary/10 border-l-primary"
 :"border-l-transparent")}
 >
 {content}
 </button>
 )}
 {/* Separador tenue, con margen para no tocar los bordes */}
 <div aria-hidden="true"className="mx-4 border-b border-border/60"/>
 </div>
 );
});
