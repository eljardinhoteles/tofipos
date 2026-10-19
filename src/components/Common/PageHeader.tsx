import type { ReactNode, Ref } from 'react';
import { MagnifyingGlass, XCircle, type Icon } from '@phosphor-icons/react';
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
  /** Etiqueta junto al título (p. ej. "Prueba"). */
  badge?: ReactNode;
  /** Línea de contexto bajo el título (conteo, rango, estado). */
  subtitle?: ReactNode;
  /** Buscador (HeaderSearch), siempre justo después del título. */
  search?: ReactNode;
  /** Acciones a la derecha: la principal con HeaderPrimaryButton, el resto con headerIconButtonClass. */
  actions?: ReactNode;
  /**
   * Secciones de la página (`HeaderTabs`), centradas en el header (debajo del buscador, si lo hay, y entonces el header es
   * más alto; en celular, en una fila bajo el header). Así quedan separadas de los filtros del contenido.
   */
  tabs?: ReactNode;
  /** Indicador que sale del borde inferior del header (p. ej. `PulsoSincronizacion`). Se posiciona solo, en absoluto. */
  pulso?: ReactNode;
}

export function PageHeader({ title, badge, subtitle, search, actions, tabs, pulso }: PageHeaderProps) {
  // En PC el buscador va centrado (columna del medio) con el título a la izquierda y
  // las acciones a la derecha; en móvil no hay buscador en el header.
  // Con `tabs` la columna del medio lleva el buscador y, debajo, las secciones.
  const centro = !!search || !!tabs;
  return (
    <>
    <header className={cn(
      'relative h-16 px-6 bg-nav text-nav-foreground flex items-center justify-between md:grid shrink-0 gap-4',
      // Con buscador y secciones apilados necesita más alto; con solo las secciones, el normal.
      tabs && search ? 'md:h-[112px]' : 'md:h-[72px]',
      // Sin buscador no hay columna del medio: una columna vacía le quitaba ancho al título cuando un sidebar
      // abierto estrechaba la página. Con buscador, el título conserva al menos 9rem.
      tabs ? 'md:grid-cols-[minmax(9rem,1fr)_minmax(0,34rem)_minmax(max-content,1fr)]'
        : centro ? 'md:grid-cols-[minmax(9rem,1fr)_minmax(8rem,24rem)_minmax(max-content,1fr)]' : 'md:grid-cols-[minmax(9rem,1fr)_auto]',
    )}>
      <div className="flex flex-col justify-center min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="font-redonda t-titulo text-nav-foreground truncate max-w-[240px]">{title}</h1>
          {badge}
        </div>
        {subtitle && <span className="t-dato leading-tight text-nav-foreground/70 truncate">{subtitle}</span>}
      </div>
      {tabs ? (
        <div className="hidden md:flex flex-col items-center justify-center gap-2 min-w-0">
          {search}
          {tabs}
        </div>
      ) : search && <div className="hidden md:flex justify-center min-w-0">{search}</div>}
      <div className="flex items-center justify-end gap-3 shrink-0">{actions}</div>
      {pulso}
    </header>
    {tabs && <div className="md:hidden bg-nav px-4 pb-3 shrink-0 flex justify-center">{tabs}</div>}
    </>
  );
}

/** Secciones de la página dentro del header (sobre el fondo oscuro). Se pasan a `PageHeader` con la prop `tabs`. */
export function HeaderTabs({ children, label }: { children: ReactNode; label: string }) {
  return <div role="tablist" aria-label={label} className="flex items-center gap-1 max-w-full overflow-x-auto hide-scrollbar">{children}</div>;
}

export function HeaderTab({ activa, onClick, icono: Icono, children }: { activa: boolean; onClick: () => void; icono?: Icon; children: ReactNode }) {
  return (
    <button
      type="button" role="tab" aria-selected={activa} onClick={onClick}
      className={cn(
        'h-9 pointer-coarse:h-11 px-3.5 rounded-2xl t-dato whitespace-nowrap shrink-0 cursor-pointer transition-colors inline-flex items-center gap-1.5',
        activa ? 'bg-nav-foreground/15 text-nav-foreground' : 'text-nav-foreground/70 hover:bg-nav-foreground/10 hover:text-nav-foreground',
      )}
    >
      {Icono && <Icono size={16} weight={activa ? 'fill' : 'bold'} aria-hidden />}
      {children}
    </button>
  );
}

/** Botón secundario del header (icono o icono + texto), translúcido sobre el marco. */
export const headerButtonClass =
  'h-9 rounded-2xl bg-nav-foreground/10 hover:bg-nav-foreground/15 text-nav-foreground inline-flex items-center justify-center gap-1.5 t-dato transition-colors cursor-pointer shrink-0 active:scale-95';
export const headerIconButtonClass = cn(headerButtonClass, 'w-9');

/** Acción principal de la página (crear): botón relleno en claro. Solo el icono + hasta pantallas muy anchas (con el buscador centrado el texto no cabe); desde 2xl, icono + texto (poner el texto en `<span className="hidden 2xl:inline">`, y title/aria-label). */
export const headerPrimaryButtonClass =
  'h-9 w-9 2xl:w-auto 2xl:px-4 rounded-2xl bg-nav-foreground text-nav hover:bg-nav-foreground/90 inline-flex items-center justify-center gap-1.5 t-cuerpo-fuerte transition-colors cursor-pointer shrink-0 active:scale-95';

interface HeaderSearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}

/** Buscador del header: mismo ancho en todas las páginas. */
export function HeaderSearch({ value, onChange, placeholder }: HeaderSearchProps) {
  return (
    <div className="relative w-96 max-w-full min-w-0">
      <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-nav-foreground/80 pointer-events-none" />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-2xl bg-nav-foreground/15 ring-1 ring-nav-foreground/20 pl-9 pr-10 t-cuerpo text-nav-foreground placeholder:text-nav-foreground/75 outline-none transition-colors hover:bg-nav-foreground/20 focus:bg-nav-foreground/20 focus-visible:ring-2 focus-visible:ring-nav-foreground/50"
      />
      {value && (
        <button type="button" aria-label="Limpiar búsqueda" onClick={() => onChange('')}
          className="absolute right-0 top-1/2 -translate-y-1/2 size-9 pointer-coarse:size-11 flex items-center justify-center text-nav-foreground/80 hover:text-nav-foreground cursor-pointer">
          <XCircle size={16} weight="fill" />
        </button>
      )}
    </div>
  );
}

/** Tarjeta de contenido: llega al borde derecho e inferior; solo la esquina superior izquierda redondeada (en móvil, ambas de arriba). */
export function PageContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 min-h-0 flex flex-col bg-background rounded-t-marco md:rounded-t-none md:rounded-tl-marco overflow-hidden', className)}>
      {children}
    </div>
  );
}

/** Fila de filtros / pestañas dentro de la tarjeta, bajo el header. */
export function PageToolbar({ children, scrollRef, className }: { children: ReactNode; scrollRef?: Ref<HTMLDivElement>; className?: string }) {
  return (
    <div ref={scrollRef} className={cn('h-13 px-6 flex items-center gap-3 shrink-0 overflow-x-auto hide-scrollbar', className)}>
      {children}
    </div>
  );
}

/** Chip de filtro de la toolbar (mismo estilo que los pisos de Mesas). */
export function toolbarChipClass(active: boolean) {
  return cn(
    'px-3.5 py-1.5 rounded-full t-meta transition-all cursor-pointer whitespace-nowrap border shrink-0',
    active ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs' : 'bg-card text-muted-foreground font-medium border-border'
  );
}
