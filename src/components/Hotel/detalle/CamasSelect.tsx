import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { agruparPlantas, escribirSeleccion, leerSeleccion } from '../../../lib/hotelCamas';

const SIN_CAMA = '__sin__';
const disparador = 'w-full px-2.5 text-base rounded-2xl bg-card border-border shadow-xs';

interface Props {
  /** Camas que admite la habitación; con prefijo «Planta: » si tiene varias plantas. */
  camas: string[];
  /** Cama guardada (una por planta, unidas con « · »). */
  valor: string | null;
  onChange: (valor: string | null) => void;
  disabled?: boolean;
  /** Alto del selector (`h-10` en la reserva nueva, `h-11` en el detalle). */
  alto?: 'h-10' | 'h-11';
  etiqueta: string;
}

/** Selector de cama: uno solo, o uno por planta si la habitación tiene varias. */
export function CamasSelect({ camas, valor, onChange, disabled, alto = 'h-11', etiqueta }: Props) {
  const grupos = agruparPlantas(camas);
  const claseAlto = alto === 'h-10' ? 'data-[size=default]:h-10' : 'data-[size=default]:h-11';

  if (!grupos) {
    // Si la cama guardada ya no está en la lista, se sigue mostrando para no perderla de vista.
    const opciones = valor && !camas.includes(valor) ? [valor, ...camas] : camas;
    return (
      <Select value={valor ?? SIN_CAMA} onValueChange={(v) => onChange(v === SIN_CAMA ? null : v)} disabled={disabled}>
        <SelectTrigger className={`${claseAlto} ${disparador}`} aria-label={etiqueta}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={SIN_CAMA} className="t-cuerpo">Sin definir</SelectItem>
          {opciones.map((c) => <SelectItem key={c} value={c} className="t-cuerpo">{c}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }

  const sel = leerSeleccion(valor);
  return (
    <div className="flex flex-col gap-2 min-w-0 w-full">
      {grupos.map((g) => (
        <div key={g.planta} className="flex items-center gap-2">
          <span className="t-meta text-muted-foreground w-20 shrink-0 truncate" title={g.planta}>{g.planta}</span>
          <Select value={sel[g.planta] ?? SIN_CAMA} disabled={disabled}
            onValueChange={(v) => {
              const nueva = { ...sel };
              if (v === SIN_CAMA) delete nueva[g.planta]; else nueva[g.planta] = v;
              onChange(escribirSeleccion(grupos, nueva));
            }}>
            <SelectTrigger className={`${claseAlto} ${disparador}`} aria-label={`${etiqueta}, ${g.planta}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_CAMA} className="t-cuerpo">Sin definir</SelectItem>
              {g.camas.map((c) => <SelectItem key={c} value={c} className="t-cuerpo">{c.slice(g.planta.length + 2)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
