import { CircleNotch } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/** Piezas para que una espera de red no se sienta como un congelamiento: se ve que algo está pasando y qué. */

/** Spinner pequeño (se detiene con «reducir movimiento»). */
export function Girando({ size = 16, className }: { size?: number; className?: string }) {
  return <CircleNotch size={size} weight="bold" aria-hidden className={cn('animate-spin motion-reduce:animate-none shrink-0', className)} />;
}

/** Aviso de una operación en curso, con lo que se está haciendo. Lo anuncian los lectores de pantalla. */
export function BannerEspera({ texto, detalle, className }: { texto: string; detalle?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex items-center gap-3 rounded-2xl bg-info-soft text-info-foreground px-4 py-3', className)}>
      <Girando size={20} />
      <span className="flex flex-col min-w-0">
        <span className="t-cuerpo-fuerte">{texto}</span>
        {detalle && <span className="t-meta opacity-80">{detalle}</span>}
      </span>
    </div>
  );
}

/** Filas grises con pulso que ocupan el lugar de una lista que está cargando (evita el hueco en blanco). */
export function SkeletonFilas({ n = 4, alto = 'h-16', className }: { n?: number; alto?: string; className?: string }) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: n }, (_, i) => <div key={i} className={cn('rounded-2xl bg-muted animate-pulse motion-reduce:animate-none', alto)} />)}
    </div>
  );
}

/** Línea fina bajo una cabecera mientras se actualiza algo en segundo plano. Ocupa su sitio siempre: no mueve el diseño. */
export function BarraCarga({ activa, className }: { activa: boolean; className?: string }) {
  return (
    <div aria-hidden className={cn('h-0.5 w-full rounded-full overflow-hidden bg-transparent', activa && 'bg-primary/20', className)}>
      {activa && <div className="h-full w-1/3 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />}
    </div>
  );
}
