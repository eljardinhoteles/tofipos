import { ForkKnife } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { importePlan, incluyeDelPlan, planSeCobra, type PlanAlimentacion } from '../../../lib/hotelPlanesApi';
import { dinero, plural } from './formatos';

interface Props {
  planes: PlanAlimentacion[];
  /** Id del plan elegido; null = sin plan. */
  valor: string | null;
  onChange: (id: string | null) => void;
  adultos: number;
  ninos: number;
  noches: number;
}

/**
 * Elige el plan de alimentación de una reserva: «Sin plan» o uno de los planes activos. Muestra para cuántos adultos y niños
 * aplica y su valor referencial (por noche y por la estadía). Informativo: no se cobra.
 */
export function SelectorPlan({ planes, valor, onChange, adultos, ninos, noches }: Props) {
  const elegido = planes.find((p) => p.id === valor) ?? null;
  const opcion = (activo: boolean) => cn('min-h-11 px-3.5 rounded-2xl border flex items-center gap-2 t-cuerpo-fuerte cursor-pointer transition-colors',
    activo ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60');
  return (
    <div className="flex flex-col gap-2.5">
      <div role="radiogroup" aria-label="Plan de alimentación" className="flex flex-wrap gap-2">
        <button type="button" role="radio" aria-checked={valor === null} onClick={() => onChange(null)} className={opcion(valor === null)}>Sin plan</button>
        {planes.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={valor === p.id} onClick={() => onChange(p.id)} className={opcion(valor === p.id)}>
            <ForkKnife size={16} /> {p.nombre}
          </button>
        ))}
      </div>
      {elegido ? (
        <div className="flex flex-col gap-0.5 t-meta text-muted-foreground">
          {incluyeDelPlan(elegido, ninos).map((l) => <span key={l.texto + (l.quien ?? '')} className="text-foreground">{l.quien && <b>{l.quien}: </b>}{l.texto}</span>)}
          <span>
            Para {plural(adultos, 'adulto', 'adultos')}{ninos ? ` y ${plural(ninos, 'niño', 'niños')}` : ''} · {plural(noches, 'noche', 'noches')}
            {planSeCobra(elegido) ? <> · <b className="text-foreground">se cobra {dinero(importePlan(elegido, adultos, ninos, noches))}</b></> : <> · incluido en la tarifa</>}
          </span>
        </div>
      ) : (
        <span className="t-meta text-muted-foreground">Solo alojamiento: sin plan de alimentación.</span>
      )}
    </div>
  );
}
