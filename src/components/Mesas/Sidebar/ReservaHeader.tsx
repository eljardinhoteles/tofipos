import type { ReactNode } from 'react';
import { ArrowLeft, X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ReservaHeaderProps {
  /** Contenido del badge cuadrado (icono o texto corto). */
  badge: ReactNode;
  titulo: string;
  subtitulo: string;
  /** Reserva ya atendida o cancelada: el header pasa a gris. */
  cerrada?: boolean;
  /** Color del header en escritorio: naranja de reserva (por defecto) o el de marca. */
  tono?: 'reserva' | 'primary';
  onBack?: () => void;
  /** Botones propios de la pantalla (editar, anular…), antes del de cerrar. */
  acciones?: ReactNode;
  onClose: () => void;
}

// Cabecera de los paneles de reserva: mismo lenguaje que ComandaHeader (badge
// cuadrado + título + subtítulo). En escritorio el fondo completo toma el color
// de reserva (naranja, como su etiqueta en Centro de Ventas; gris si ya se
// atendió o canceló); en móvil queda neutro y solo el badge lleva el color.
export function ReservaHeader({ badge, titulo, subtitulo, cerrada = false, tono = 'reserva', onBack, acciones, onClose }: ReservaHeaderProps) {
  const bgHeader = cerrada ? 'md:bg-muted-foreground' : tono === 'primary' ? 'md:bg-primary' : 'md:bg-warning-foreground';
  const bgBadge = cerrada ? 'bg-muted-foreground' : tono === 'primary' ? 'bg-primary' : 'bg-warning-foreground';
  return (
    <header className={cn('p-4 flex items-center justify-between shrink-0 shadow-xs bg-card text-foreground',
      bgHeader, 'md:text-white')}>
      <div className="flex items-center gap-3 min-w-0">
        {onBack ? (
          <Button type="button" variant="ghost" size="icon-lg" aria-label="Volver" onClick={onBack}
            className="rounded-xl bg-muted text-muted-foreground md:bg-white/15 md:hover:bg-white/25 md:text-white shrink-0">
            <ArrowLeft size={18} weight="bold" />
          </Button>
        ) : (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            bgBadge, 'text-white md:bg-white/15')}>
            {badge}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <h3 className="font-extrabold text-base leading-tight truncate md:text-white">{titulo}</h3>
          <span className="text-[10px] font-bold text-muted-foreground uppercase truncate md:text-white/70">{subtitulo}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {acciones}
        <Button type="button" variant="ghost" size="icon-lg" aria-label="Cerrar" onClick={onClose}
          className="rounded-xl bg-muted text-muted-foreground md:bg-white/15 md:hover:bg-white/25 md:text-white">
          <X size={18} weight="bold" />
        </Button>
      </div>
    </header>
  );
}

/** Botón de icono de las acciones del header de reserva (editar, anular…). */
export function reservaHeaderActionClass(peligro = false) {
  return cn('rounded-xl md:bg-white/15 md:hover:bg-white/25 md:text-white',
    peligro ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground');
}
