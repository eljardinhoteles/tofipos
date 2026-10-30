import type { Icon } from '@phosphor-icons/react';
import { Bed, Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerPortal, DrawerContent, DrawerTitle, DrawerDescription, DrawerHandle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

export interface ZonaOpcion {
  clave: string;
  titulo: string;
  /** Número de la tarjeta (mesas o habitaciones con cuenta abierta). */
  contador: number;
  /** Línea pequeña bajo el título, p. ej. «3 de 8 ocupadas». */
  detalle: string;
  icono?: Icon;
  tono: 'primario' | 'info';
  activa: boolean;
}

interface Props {
  abierta: boolean;
  onClose: () => void;
  opciones: ZonaOpcion[];
  onElegir: (clave: string) => void;
  /** Hotel y mesas activas, al final y a partes iguales como en la franja de arriba de Mesas; cada uno solo si existe. */
  hotel?: { cantidad: number; activa: boolean; onClick: () => void };
  activas?: { cantidad: number; activa: boolean; onClick: () => void };
  onAnadir?: () => void;
}

/** Hoja inferior del celular con las zonas de Mesas como tarjetas grandes, para cambiar de zona con el pulgar. */
export function ZonasSheet({ abierta, onClose, opciones, onElegir, hotel, activas, onAnadir }: Props) {
  return (
    <>
    {/* El overlay del Drawer del sistema es transparente y no recibe toques; este atenúa el fondo y cierra al tocar fuera. */}
    {abierta && <div aria-hidden className="fixed inset-0 z-[45] bg-black/30" onClick={onClose} />}
    <Drawer open={abierta} onOpenChange={(o) => { if (!o) onClose(); }} dismissible>
      <DrawerPortal>
        <DrawerContent className="fixed bottom-0 left-0 right-0 max-h-[80dvh] bg-card rounded-t-marco shadow-[0_-8px_30px_rgba(0,0,0,0.25)] z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden">
          <DrawerHandle />
          <div className="flex items-center justify-between gap-3 px-5 pt-7 pb-1 shrink-0">
            <DrawerTitle className="t-titulo">Zonas</DrawerTitle>
            {onAnadir && (
              <Button type="button" variant="ghost" onClick={onAnadir} className="gap-1.5">
                <Plus size={16} weight="bold" /> Añadir zona
              </Button>
            )}
          </div>
          <DrawerDescription className="sr-only">Elige la zona de mesas que quieres ver</DrawerDescription>
          <div className="min-h-0 overflow-y-auto px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+20px)] grid grid-cols-2 gap-3">
            {opciones.map((o) => {
              const Icono = o.icono;
              const info = o.tono === 'info';
              return (
                <button
                  key={o.clave} type="button" onClick={() => onElegir(o.clave)}
                  aria-pressed={o.activa}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-2xl border p-3.5 text-left cursor-pointer active:scale-[0.98] transition-all',
                    o.activa
                      ? (info ? 'bg-info text-white border-info' : 'bg-primary text-primary-foreground border-primary')
                      : o.contador > 0
                        // Con actividad: relieve y borde del color de la zona. Sin nada: plana y apagada, sin borde.
                        ? (info ? 'bg-info-soft border-info/60 shadow-(--shadow-btn)' : 'bg-primary/10 border-primary/60 shadow-(--shadow-btn)')
                        : 'bg-muted/50 border-transparent',
                  )}
                >
                  <span className="flex w-full items-center gap-2 min-w-0">
                    <span className={cn('flex items-center gap-1.5 t-cuerpo-fuerte font-redonda font-extrabold min-w-0', !o.activa && o.contador === 0 && 'text-muted-foreground')}>
                      {Icono && <Icono size={18} weight="bold" className="shrink-0" />}
                      <span className="truncate">{o.titulo}</span>
                    </span>
                  </span>
                  {o.contador > 0 && <span className={cn('t-dato', o.activa ? 'text-current' : info ? 'text-info-foreground' : 'text-primary')}>{o.detalle}</span>}
                </button>
              );
            })}
            {(hotel || activas) && (
              <div className="col-span-2 flex gap-3">
                {hotel && (
                  <Button
                    type="button" variant="infoSoft" onClick={hotel.onClick} aria-pressed={hotel.activa}
                    className={cn('flex-1 min-w-0 h-12 gap-2 rounded-2xl', hotel.activa && 'bg-info text-white border-info hover:bg-info hover:brightness-110')}
                  >
                    {hotel.cantidad > 0 && (
                      <span className={cn('min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center t-dato leading-none shrink-0', hotel.activa ? 'bg-white text-info-foreground' : 'bg-info text-white')}>{hotel.cantidad}</span>
                    )}
                    <Bed size={18} weight="bold" className="shrink-0" />
                    <span className="truncate">Hotel</span>
                  </Button>
                )}
                {activas && (
                  <Button
                    type="button" variant="primarySoft" onClick={activas.onClick} aria-pressed={activas.activa}
                    className={cn('flex-1 min-w-0 h-12 gap-2 rounded-2xl', activas.activa && 'bg-primary text-primary-foreground border-primary hover:bg-primary hover:brightness-110')}
                  >
                    <span className={cn('min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center t-dato leading-none shrink-0', activas.activa ? 'bg-white text-primary' : 'bg-primary text-primary-foreground')}>{activas.cantidad}</span>
                    <span className="truncate">Activas</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
    </>
  );
}
