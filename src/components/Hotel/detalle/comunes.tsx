import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';


/** Tarjeta de una sección del detalle: título con icono y, a la derecha, su acción («Editar»…). */
const FICHA_ICONO = {
  primary: 'bg-primary-soft text-primary',
  info: 'bg-info-soft text-info-foreground',
  success: 'bg-success-soft text-success-foreground',
  warning: 'bg-warning-soft text-warning-foreground',
  destructive: 'bg-destructive-soft text-destructive',
} as const;

export function Seccion({ icono: Icono, titulo, accion, children, tono, color = 'primary' }: { icono: Icon; titulo: string; accion?: ReactNode; children: ReactNode; tono?: 'normal' | 'aviso'; color?: keyof typeof FICHA_ICONO }) {
  return (
    <section className={tono === 'aviso' ? 'rounded-2xl border border-warning/40 bg-warning-soft p-4 flex flex-col gap-3' : 'rounded-2xl border border-border bg-card p-4 flex flex-col gap-3'}>
      <div className="flex items-center justify-between gap-3 min-h-9">
        <h3 className="t-fila flex items-center gap-2.5 min-w-0"><span className={`size-8 rounded-xl flex items-center justify-center shrink-0 ${FICHA_ICONO[color]}`}><Icono size={18} /></span> <span className="truncate">{titulo}</span></h3>
        {accion}
      </div>
      {children}
    </section>
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
