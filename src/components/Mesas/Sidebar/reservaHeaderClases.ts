import { cn } from '@/lib/utils';

/** Botón de icono de las acciones del header de reserva (editar, anular…): sin fondo, solo icono. */
export function reservaHeaderActionClass(peligro = false) {
  return cn('rounded-xl bg-transparent md:bg-transparent md:text-white md:hover:bg-white/15',
    peligro ? 'text-destructive hover:bg-destructive-soft' : 'text-muted-foreground hover:bg-muted');
}
