import { cn } from '@/lib/utils';

export type TonoEstado = 'success' | 'special' | 'warning' | 'info' | 'destructive' | 'neutral';

const TONOS: Record<TonoEstado, string> = {
  success: 'bg-success-soft text-success-foreground',
  special: 'bg-special-soft text-special-foreground',
  warning: 'bg-warning-soft text-warning-foreground',
  info: 'bg-info-soft text-info-foreground',
  destructive: 'bg-destructive-soft text-destructive',
  neutral: 'bg-muted text-muted-foreground',
};

/**
 * Badge de estado único de la app (Órdenes, Centro de Ventas…): fondo `-soft`, texto `-foreground`, sin icono ni borde (solo texto y color). El borde es del badge de origen, así los dos no compiten en la misma fila.
 */
export function EstadoBadge({ tono, children, className, title }: { tono: TonoEstado; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center px-2.5 py-1 rounded-md t-dato shrink-0 whitespace-nowrap', TONOS[tono], className)}>
      {children}
    </span>
  );
}
