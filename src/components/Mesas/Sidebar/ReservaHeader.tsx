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
  /** Color del header en escritorio: naranja de reserva (por defecto), el de marca, o 'neutro' (blanco, para pantallas de configuración). */
  tono?: 'reserva' | 'primary' | 'info' | 'neutro';
  onBack?: () => void;
  /** Botones propios de la pantalla (editar, anular…), antes del de cerrar. */
  acciones?: ReactNode;
  /** Sin esto no se muestra el botón de cerrar (pantallas que ya tienen Cancelar). */
  onClose?: () => void;
}

// Cabecera de los paneles de reserva: mismo lenguaje que ComandaHeader (badge
// cuadrado + título + subtítulo). En escritorio el fondo completo toma el color
// de reserva (naranja, como su etiqueta en Centro de Ventas; gris si ya se
// atendió o canceló); en móvil queda neutro y solo el badge lleva el color.
export function ReservaHeader({ badge, titulo, subtitulo, cerrada = false, tono = 'reserva', onBack, acciones, onClose }: ReservaHeaderProps) {
  const neutro = tono === 'neutro' && !cerrada;
  const bgHeader = neutro ? 'border-b border-border' : cerrada ? 'md:bg-muted-foreground' : tono === 'primary' ? 'md:bg-primary' : tono === 'info' ? 'md:bg-info' : 'md:bg-warning-foreground';
  const bgBadge = neutro ? 'bg-muted' : cerrada ? 'bg-muted-foreground' : tono === 'primary' ? 'bg-primary' : tono === 'info' ? 'bg-info' : 'bg-warning-foreground';
  // En escritorio el header de color lleva texto blanco; el neutro conserva los colores normales.
  const textoMd = neutro ? '' : 'md:text-white';
  const botonHeader = neutro ? 'bg-muted text-muted-foreground hover:bg-secondary' : 'bg-muted text-muted-foreground md:bg-white/15 md:hover:bg-white/25 md:text-white';
  return (
    <header className={cn('h-16 md:h-[72px] px-4 flex items-center justify-between shrink-0 bg-card text-foreground',
      neutro ? '' : 'shadow-xs', bgHeader, textoMd)}>
      <div className="flex items-center gap-3 min-w-0">
        {onBack ? (
          <Button type="button" variant="ghost" size="icon-lg" aria-label="Volver" onClick={onBack}
            className={cn('rounded-xl shrink-0', botonHeader)}>
            <ArrowLeft size={18} weight="bold" />
          </Button>
        ) : (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            neutro ? 'bg-muted text-muted-foreground' : cn(bgBadge, 'text-white md:bg-white/15'))}>
            {badge}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <h3 className={cn('font-extrabold text-base leading-tight truncate', textoMd)}>{titulo}</h3>
          <span className={cn('text-[10px] font-bold text-muted-foreground uppercase truncate', !neutro && 'md:text-white/70')}>{subtitulo}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {acciones}
        {onClose && (
        <Button type="button" variant="ghost" size="icon-lg" aria-label="Cerrar" onClick={onClose}
          className={cn('rounded-xl', botonHeader)}>
          <X size={18} weight="bold" />
        </Button>
        )}
      </div>
    </header>
  );
}
