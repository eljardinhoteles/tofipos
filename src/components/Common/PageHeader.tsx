import type { ReactNode, Ref } from 'react';
import { MagnifyingGlass, XCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

// Marco de página: sidebar y header comparten el color `--nav` (una "L") y el
// contenido va en una tarjeta pegada al borde derecho e inferior.
//
//   <PageFrame>
//     <PageHeader title subtitle search actions />
//     <PageContent>
//       <PageToolbar>…filtros / pestañas…</PageToolbar>
//       …contenido…
//     </PageContent>
//   </PageFrame>

export function PageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col h-full w-full bg-nav text-foreground overflow-hidden', className)}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  /** Línea de contexto bajo el título (conteo, rango, estado). */
  subtitle?: ReactNode;
  /** Buscador (HeaderSearch), siempre justo después del título. */
  search?: ReactNode;
  /** Acciones a la derecha: la principal con HeaderPrimaryButton, el resto con headerIconButtonClass. */
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, search, actions }: PageHeaderProps) {
  // En PC el buscador va centrado (columna del medio) con el título a la izquierda y
  // las acciones a la derecha; en móvil no hay buscador en el header.
  return (
    <header className="h-16 md:h-[72px] px-6 bg-nav text-nav-foreground flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] shrink-0 gap-4">
      <div className="flex flex-col justify-center min-w-0">
        <h1 className="font-extrabold text-base text-nav-foreground truncate max-w-[240px]">{title}</h1>
        {subtitle && <span className="text-xs font-semibold leading-tight text-nav-foreground/70 truncate">{subtitle}</span>}
      </div>
      <div className="hidden md:flex justify-center">{search}</div>
      <div className="flex items-center justify-end gap-3 shrink-0 min-w-0">{actions}</div>
    </header>
  );
}

/** Botón secundario del header (icono o icono + texto), translúcido sobre el marco. */
export const headerButtonClass =
  'h-9 rounded-xl bg-nav-foreground/10 hover:bg-nav-foreground/15 text-nav-foreground inline-flex items-center justify-center gap-1.5 font-bold text-xs transition-colors cursor-pointer shrink-0 active:scale-95';
export const headerIconButtonClass = cn(headerButtonClass, 'w-9');

/** Acción principal de la página (crear): botón relleno en claro. Solo el icono + hasta pantallas muy anchas (con el buscador centrado el texto no cabe); desde 2xl, icono + texto (poner el texto en `<span className="hidden 2xl:inline">`, y title/aria-label). */
export const headerPrimaryButtonClass =
  'h-9 w-9 2xl:w-auto 2xl:px-4 rounded-xl bg-nav-foreground text-nav hover:bg-nav-foreground/90 inline-flex items-center justify-center gap-1.5 font-bold text-sm transition-colors cursor-pointer shrink-0 active:scale-95';

interface HeaderSearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}

/** Buscador del header: mismo ancho en todas las páginas. */
export function HeaderSearch({ value, onChange, placeholder }: HeaderSearchProps) {
  return (
    <div className="relative w-96 max-w-full">
      <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-nav-foreground/60 pointer-events-none" />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-xl bg-nav-foreground/10 pl-9 pr-8 text-sm font-semibold text-nav-foreground placeholder:text-nav-foreground/55 outline-none transition-colors focus:bg-nav-foreground/15 focus-visible:ring-2 focus-visible:ring-nav-foreground/30"
      />
      {value && (
        <button type="button" aria-label="Limpiar búsqueda" onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-nav-foreground/60 hover:text-nav-foreground cursor-pointer">
          <XCircle size={14} weight="fill" />
        </button>
      )}
    </div>
  );
}

/** Tarjeta de contenido: llega al borde derecho e inferior; solo la esquina superior izquierda redondeada (en móvil, ambas de arriba). */
export function PageContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 min-h-0 flex flex-col bg-background rounded-t-2xl md:rounded-t-none md:rounded-tl-2xl overflow-hidden', className)}>
      {children}
    </div>
  );
}

/** Fila de filtros / pestañas dentro de la tarjeta, bajo el header. */
export function PageToolbar({ children, scrollRef }: { children: ReactNode; scrollRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={scrollRef} className="h-13 px-6 flex items-center gap-3 shrink-0 overflow-x-auto hide-scrollbar">
      {children}
    </div>
  );
}

/** Chip de filtro de la toolbar (mismo estilo que los pisos de Mesas). */
export function toolbarChipClass(active: boolean) {
  return cn(
    'px-3.5 py-1.5 rounded-full text-xs transition-all cursor-pointer whitespace-nowrap border shrink-0',
    active ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs' : 'bg-card text-muted-foreground font-medium border-border'
  );
}
