import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';


/** Tarjeta de una sección del detalle: título y, a la derecha, su acción («Editar»…). `icono` y `color` ya no se muestran (se conservan en las props para no tocar a quien llama). */
export function Seccion({ titulo, accion, children, tono }: { icono?: Icon; titulo: string; accion?: ReactNode; children: ReactNode; tono?: 'normal' | 'aviso'; color?: string }) {
  // Aviso: caja ámbar con su título dentro. Normal: el título y la acción van FUERA de la tarjeta, sobre el fondo del panel,
  // y solo el contenido va en la tarjeta blanca (menos cajas, lista más liviana). Los botones grises («suave») de la acción pasan a blanco
  // para contrastar con el fondo gris; los demás (verde principal, contorno, fantasma) no se tocan.
  if (tono === 'aviso') {
    return (
      <section className="rounded-2xl border border-warning/40 bg-warning-soft p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 min-h-9">
          <h3 className="font-redonda t-fila min-w-0 truncate">{titulo}</h3>
          {accion}
        </div>
        {children}
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 min-h-9 px-1">
        <h3 className="font-redonda t-fila min-w-0 truncate">{titulo}</h3>
        {accion && <div className="shrink-0 [&_button.bg-muted]:bg-card [&_button.bg-muted:hover]:bg-card/70">{accion}</div>}
      </div>
      <div className="rounded-2xl bg-card p-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Fila de información al estilo del popover del calendario: ícono a la izquierda, dato principal y, debajo, un detalle más tenue. */
export function FilaInfo({ icono: Icono, children, sub }: { icono: Icon; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <Icono size={20} className="text-muted-foreground shrink-0 mt-0.5" aria-hidden />
      <div className="flex flex-col min-w-0">
        <span className="t-cuerpo-fuerte break-words">{children}</span>
        {sub ? <span className="t-meta text-muted-foreground">{sub}</span> : null}
      </div>
    </div>
  );
}

export function Dato({ t, v }: { t: string; v: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="t-etiqueta text-muted-foreground">{t}</span>
      <span className="t-cuerpo-fuerte break-words">{v}</span>
    </div>
  );
}

export function Fila({ t, v, fuerte }: { t: string; v: ReactNode; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={fuerte ? 't-cuerpo-fuerte' : 't-cuerpo text-muted-foreground'}>{t}</span>
      <span className={fuerte ? 't-valor' : 't-cuerpo-fuerte tabular-nums'}>{v}</span>
    </div>
  );
}
