import { memo } from'react';
import { CheckCircle, Clock } from'@phosphor-icons/react';
import { cn } from'@/lib/utils';
import { parseReparto } from'@/lib/reparto';

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
 reparto?: string | null;
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
 // Tiene unidades que cocina aún no recibió (sin confirmar, o una unidad sumada a un
 // ítem ya confirmado). Si no se indica, se deduce de isLocked.
 pendiente?: boolean;
}

// Las filas fuera de pantalla no se pintan ni calculan layout hasta que se
// acercan (la altura estimada evita saltos en la barra de scroll).
const FILA_FUERA_DE_PANTALLA = { contentVisibility: 'auto', containIntrinsicSize: 'auto 64px' } as const;

// toLocaleString crea un Intl.NumberFormat en cada llamada: con 100+ filas era
// lo más caro de abrir la comanda. Formato manual equivalente (en-US, 2 decimales).
const dinero = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

export const ComandaItemRow = memo(function ComandaItemRow({ item, onClick, isSelected, isLocked, pendiente }: ComandaItemRowProps) {
 const pagado = item.pagado_cantidad || 0;
 const isFullyPaid = item.cantidad > 0 && pagado >= item.cantidad;
 const isAnulado = !!item.anulado;
 const isCortesia = (item.cortesia_cantidad || 0) > 0 || !!item.cortesia_motivo;
 const reparto = parseReparto(item);
 const isReadOnly = !onClick;

 const tachado = isAnulado || isFullyPaid;
 const porConfirmar = !isAnulado && (pendiente ?? isLocked === false);

 // Lista legible: cantidad ("2") | nombre y detalle en texto plano | precio.
 // Sin fondos ni recuadros; la jerarquía la dan el peso y el color del texto.
 const content = (
 <div className="flex items-start gap-3 w-full px-4 py-3">
 <span className={cn("w-8 shrink-0 self-center text-center text-xl leading-6 font-bold tracking-[-0.04em]",
 isAnulado ?"text-destructive": isFullyPaid ?"text-foreground":"text-foreground")}>
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
 {isLocked && !isAnulado && !porConfirmar && <CheckCircle size={16} weight="fill"className="text-primary shrink-0"aria-label="Confirmado"/>}
 {porConfirmar && <Clock size={16} weight="fill"className="text-orange-500 animate-pulse shrink-0"aria-label="Por confirmar"/>}
 </span>
 </div>

 {item.modificadores && item.modificadores.length > 0 && (
 <span className="flex items-baseline gap-2 text-[15px] font-medium text-[#9a6b3d] leading-snug">
 <span aria-hidden="true"className="w-1.5 h-1.5 rounded-full bg-[#9a6b3d] shrink-0 translate-y-[-1px]"/>
 <span>{item.modificadores.join(' · ')}</span>
 </span>
 )}

 {(isAnulado || isCortesia || pagado > 0 || reparto) && (
 <div className="flex items-center gap-2 flex-wrap text-[13px] font-bold">
 {isAnulado && <span className="text-destructive">ANULADO</span>}
 {isCortesia && <span className="text-foreground">CORTESÍA</span>}
 {reparto && (
 <span className="text-special-foreground">
 {/* La parte ya dice "parte i/n" en su nombre (que también sale en los tickets): aquí solo se marca como repartida. */}
 {reparto.tipo === 'parte' ? 'REPARTIDO' : `REPARTIDO ENTRE ${reparto.partes.length}`}
 </span>
 )}
 {pagado > 0 && (
 <span className={isFullyPaid ?"text-foreground":"text-warning-foreground"}>
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
 <div style={FILA_FUERA_DE_PANTALLA} className={cn("w-full transition-opacity", (isFullyPaid || isAnulado) &&"opacity-60")}>
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
