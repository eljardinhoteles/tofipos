import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Piezas compartidas por las pantallas de Ajustes. Siguen el lenguaje de los sidebars de la app (Clientes,
// Cargar habitación…): título de sección pequeño y gris en mayúsculas, campos de 48 px con su etiqueta
// encima, y listas de filas separadas por una línea fina. Sin tarjetas ni sombras.

/** Título de sección / etiqueta de campo: el mismo estilo que usan los sidebars. */
export const TITULO_SECCION = 't-etiqueta! text-muted-foreground';

interface SeccionProps {
  titulo: string;
  descripcion?: ReactNode;
  /** Control principal de la sección (a la derecha del título). */
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Seccion({ titulo, descripcion, accion, children, className }: SeccionProps) {
  // Cada sección es un "papel": una hoja blanca con borde fino sobre el fondo gris de la página, con su
  // cabecera (título, descripción y acción) separada del contenido por una línea.
  return (
    <section className={cn('flex flex-col rounded-2xl border border-border bg-card shadow-xs overflow-hidden', className)}>
      <header className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4 px-4 py-4 sm:px-6 sm:py-5 border-b border-border">
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className={TITULO_SECCION}>{titulo}</h3>
          {descripcion && <p className="t-cuerpo text-muted-foreground leading-snug">{descripcion}</p>}
        </div>
        {accion && <div className="shrink-0 max-sm:w-full [&>button]:max-sm:w-full">{accion}</div>}
      </header>
      <div className="flex flex-col gap-5 p-4 sm:p-6">{children}</div>
    </section>
  );
}

/** Lista de filas separadas por una línea fina (la última no lleva). */
export function Grupo({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col', className)}>{children}</div>;
}

interface FilaProps {
  titulo?: ReactNode;
  ayuda?: ReactNode;
  /** Icono o avatar a la izquierda del texto. */
  icono?: ReactNode;
  /** Control(es) a la derecha. */
  children?: ReactNode;
  className?: string;
}

export function Fila({ titulo, ayuda, icono, children, className }: FilaProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 min-h-16 px-1 py-3 border-b border-border/60 last:border-b-0', className)}>
      <div className="flex flex-1 basis-48 items-center gap-3.5 min-w-0">
        {icono}
        <div className="flex flex-col min-w-0">
          {titulo && <span className="t-fila text-foreground break-words">{titulo}</span>}
          {ayuda && <span className="t-cuerpo text-muted-foreground">{ayuda}</span>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 ml-auto">{children}</div>}
    </div>
  );
}

/** Campo de formulario: etiqueta pequeña encima y el control (input de 48 px) debajo. */
export function Campo({ etiqueta, htmlFor, ayuda, children, className }: { etiqueta: string; htmlFor?: string; ayuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className={TITULO_SECCION}>{etiqueta}</label>
      {children}
      {ayuda && <span className="t-meta text-muted-foreground">{ayuda}</span>}
    </div>
  );
}

/** Texto centrado para listas vacías. */
export function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center t-cuerpo text-muted-foreground border-b border-border/60 last:border-b-0">{children}</p>;
}
