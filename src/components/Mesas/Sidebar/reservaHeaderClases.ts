import { cn } from '@/lib/utils';

/** Botón de icono de las acciones del header de reserva (editar, anular…). */
export function reservaHeaderActionClass(peligro = false) {
  return cn('rounded-xl md:bg-white/15 md:hover:bg-white/25 md:text-white',
    peligro ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground');
}
