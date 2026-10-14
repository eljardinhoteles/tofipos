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
  habitacion: 'Consumo habitación',
};

export const ORIGEN_ICON: Record<VentaOrigen, typeof SquaresFour> = {
  // Mismo icono que la sección Mesas del menú.
  mesa: SquaresFour,
  reserva_restaurante: ForkKnife,
  reserva_hotel: BedIcon,
  habitacion: Door,
};

// Color = lugar de origen, igual que en el plano de Mesas: mesa = verde de marca,
// habitación = azul, reserva restaurante = naranja, reserva hotel = violeta. Tono suave con borde fino para que
// no compita con los chips de estado ni con el contenido de la fila.
export const ORIGEN_CLASSES: Record<VentaOrigen, string> = {
  mesa: 'bg-primary/10 text-primary border-primary/25',
  reserva_restaurante: 'bg-warning-soft text-warning-foreground border-warning/40',
  reserva_hotel: 'bg-special-soft text-special-foreground border-special/30',
  habitacion: 'bg-info-soft text-info-foreground border-info/30',
};

// Solo el color del texto/icono de cada origen (para iconos sueltos fuera del badge).
export const ORIGEN_TEXTO: Record<VentaOrigen, string> = {
  mesa: 'text-primary',
  reserva_restaurante: 'text-warning-foreground',
  reserva_hotel: 'text-special-foreground',
  habitacion: 'text-info-foreground',
};

// Fondo suave del color de cada origen (p. ej. la tarjeta de resumen del detalle de una venta).
export const ORIGEN_FONDO: Record<VentaOrigen, string> = {
  mesa: 'bg-primary-soft',
  reserva_restaurante: 'bg-warning-soft',
  reserva_hotel: 'bg-special-soft',
  habitacion: 'bg-info-soft',
};

// Borde fino del color de cada origen, el mismo del badge (para la tarjeta de resumen).
export const ORIGEN_BORDE: Record<VentaOrigen, string> = {
  mesa: 'border-primary/25',
  reserva_restaurante: 'border-warning/40',
  reserva_hotel: 'border-special/30',
  habitacion: 'border-info/30',
};

// Fila abierta en el sidebar: mismo color con relleno sólido.
export const ORIGEN_CLASSES_ACTIVO: Record<VentaOrigen, string> = {
  mesa: 'bg-primary text-primary-foreground border-primary',
  reserva_restaurante: 'bg-warning-foreground text-white border-warning-foreground',
  reserva_hotel: 'bg-special text-white border-special',
  habitacion: 'bg-info text-white border-info',
};

// Barra lateral de la fila seleccionada: el mismo color que el relleno del badge de origen activo.
export const ORIGEN_BARRA_ACTIVA: Record<VentaOrigen, string> = {
  mesa: 'shadow-[inset_3px_0_0_var(--primary)]',
  reserva_restaurante: 'shadow-[inset_3px_0_0_var(--warning-foreground)]',
  reserva_hotel: 'shadow-[inset_3px_0_0_var(--special)]',
  habitacion: 'shadow-[inset_3px_0_0_var(--info)]',
};

interface OrigenBadgeProps {
  origen: VentaOrigen;
  /** Compacto para listas o normal para detalle (mismo texto de 12px; cambia el relleno). */
  size?: 'sm' | 'md';
  /** Relleno sólido: la fila u orden está abierta/seleccionada. */
  activo?: boolean;
  /** Gris neutro (p. ej. ventas anuladas). */
  apagado?: boolean;
  className?: string;
}

export function OrigenBadge({ origen, size = 'sm', apagado = false, activo = false, className }: OrigenBadgeProps) {
  const Icon = ORIGEN_ICON[origen];
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 font-bold gap-1.5 whitespace-nowrap',
        size === 'sm' ? 'h-6 px-2 [&>svg]:size-3.5!' : 'h-7 px-2.5 [&>svg]:size-4!',
        apagado ? 'border-border text-muted-foreground bg-muted' : activo ? ORIGEN_CLASSES_ACTIVO[origen] : ORIGEN_CLASSES[origen],
        className
      )}
    >
      <Icon size={size === 'sm' ? 14 : 16} weight="fill" /> {ORIGEN_LABEL[origen]}
    </Badge>
  );
}
