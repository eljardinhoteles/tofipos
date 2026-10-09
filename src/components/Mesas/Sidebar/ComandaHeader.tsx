import { ArrowsLeftRight, Bed, X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ComandaHeaderProps {
  mesaNombre: string;
  /** Línea principal: cliente de la comanda o "Toda la mesa". */
  titulo: string;
  /** Línea secundaria: "COMANDA #12" o "3 subcomandas". */
  subtitulo: string;
  enCuenta: boolean;
  /** Mesa de la habitación vinculada, si hay (se muestra como etiqueta). */
  linkedMesa?: { nombre: string } | null;
  puedeDividir: boolean;
  dividiendo: boolean;
  /** Cuenta abierta que puede vincularse (o cambiarse) a una habitación. */
  puedeVincularHabitacion?: boolean;
  onVincularHabitacion?: () => void;
  onCambiarMesa: () => void;
  onDividir: () => void;
  onClose: () => void;
}

// Cabecera del sidebar de mesa. En escritorio el fondo completo toma el color
// de estado (verde / naranja en cuenta pedida); en móvil queda neutro y solo el
// badge de mesa lleva el color, porque un header sólido se veía mal dentro del
// bottom-sheet redondeado.
export function ComandaHeader({ mesaNombre, titulo, subtitulo, enCuenta, linkedMesa, puedeDividir, dividiendo, puedeVincularHabitacion, onVincularHabitacion, onCambiarMesa, onDividir, onClose }: ComandaHeaderProps) {
  return (
 <header className={cn("p-4 flex items-center justify-between shrink-0 shadow-xs bg-card text-foreground",
 enCuenta?"md:bg-warning-foreground md:text-white":"md:bg-primary md:text-primary-foreground")}>
 <div className="flex items-center gap-3">
 <button
 type="button"
 title="Cambiar mesa"
 onClick={onCambiarMesa}
 className={cn("w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95",
 enCuenta?"bg-warning-foreground text-white md:bg-white/15":"bg-primary text-primary-foreground md:bg-primary-foreground/15")}>
 {mesaNombre.replace(/^Mesa\s*/i,'')}
 </button>
 <div className="flex flex-col">
 <h3 className={cn("font-extrabold text-base leading-tight", enCuenta?"md:text-white":"md:text-primary-foreground")}>
 {titulo}
 </h3>
 <div className="flex items-center gap-1.5">
 <span className={cn("text-[10px] font-bold text-muted-foreground", enCuenta?"md:text-white/70":"md:text-primary-foreground/70")}>
 {subtitulo} · {mesaNombre}
 </span>
 {linkedMesa && (
 <span className={cn("flex items-center gap-1 w-fit px-1.5 py-0.5 rounded-md text-[10px] font-extrabold",
 enCuenta?"bg-warning-foreground/10 text-warning-foreground md:bg-white/20 md:text-white":"bg-primary/10 text-primary md:bg-primary-foreground/20 md:text-primary-foreground")}>
 <Bed size={11} weight="fill"/>
 Hab. {linkedMesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || linkedMesa.nombre}
 </span>
 )}
 </div>
 </div>
 </div>

 <div className="flex items-center gap-3">
 {puedeVincularHabitacion && (
 <Button
 variant="ghost"size="icon-lg"title={linkedMesa ?'Cambiar o quitar la habitación' :'Vincular esta cuenta a una habitación'}
 aria-label={linkedMesa ?'Cambiar o quitar la habitación' :'Vincular esta cuenta a una habitación'}
 onClick={onVincularHabitacion}
 className={cn("rounded-xl text-muted-foreground",
 enCuenta?"md:text-white":"md:text-primary-foreground")}
 >
 <Bed size={18} weight="bold"/>
 </Button>
 )}
 {puedeDividir && (
 <Button
 variant="ghost"size="icon-lg"title="Dividir la mesa en varias cuentas"aria-label="Dividir la mesa en varias cuentas"
 disabled={dividiendo}
 onClick={onDividir}
 className={cn("rounded-xl text-muted-foreground",
 enCuenta?"md:text-white":"md:text-primary-foreground")}
 >
 <ArrowsLeftRight size={18} weight="bold"/>
 </Button>
 )}
 <Button
 variant="ghost"size="icon-lg"onClick={onClose}
 className={cn("rounded-xl bg-muted text-muted-foreground md:bg-white/15 md:hover:bg-white/25",
 enCuenta?"md:text-white":"md:text-primary-foreground")}
 >
 <X size={18} weight="bold"/>
 </Button>
 </div>
 </header>
  );
}
