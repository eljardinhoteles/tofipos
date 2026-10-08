import { SquaresFour, ForkKnife, BedIcon, Door } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { VentaOrigen } from '../../db/rxdb';

// Fuente única del origen de una venta/comanda (Mesa, Reserva restaurante,
// Reserva hotel, Habitación): mismo nombre, icono y color en Centro de Ventas
// y en Órdenes.
export const ORIGEN_LABEL: Record<VentaOrigen, string> = {
  mesa: 'Mesa',
  reserva_restaurante: 'Reserva restaurante',
  reserva_hotel: 'Reserva hotel',
  habitacion: 'Checkout habitación',
};

export const ORIGEN_ICON: Record<VentaOrigen, typeof SquaresFour> = {
  // Mismo icono que la sección Mesas del menú.
  mesa: SquaresFour,
  reserva_restaurante: ForkKnife,
  reserva_hotel: BedIcon,
  habitacion: Door,
};

// Rellenos (fondo sólido + texto blanco), a diferencia de los badges de estado
// que van en tono claro con borde — así un badge de origen nunca se confunde
// con el de estado.
export const ORIGEN_CLASSES: Record<VentaOrigen, string> = {
  mesa: 'bg-primary text-white border-primary',
  reserva_restaurante: 'bg-warning-foreground text-white border-warning',
  reserva_hotel: 'bg-info text-white border-info',
  habitacion: 'bg-special text-white border-special',
};

interface OrigenBadgeProps {
  origen: VentaOrigen;
  /** Compacto para listas (10px) o normal para detalle (12px). */
  size?: 'sm' | 'md';
  /** Gris neutro (p. ej. ventas anuladas). */
  apagado?: boolean;
  className?: string;
}

export function OrigenBadge({ origen, size = 'sm', apagado = false, className }: OrigenBadgeProps) {
  const Icon = ORIGEN_ICON[origen];
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 font-bold gap-1 whitespace-nowrap',
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : '',
        apagado ? 'border-border text-muted-foreground bg-muted' : ORIGEN_CLASSES[origen],
        className
      )}
    >
      <Icon size={size === 'sm' ? 10 : 12} weight="bold" /> {ORIGEN_LABEL[origen]}
    </Badge>
  );
}
